import mongoose from 'mongoose';
import { PTEBookingProduct, PTE_BOOKING_STATUSES, PTE_BOOKING_CURRENCIES, AuditLog, Setting } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { uploadImage, deleteCloudinaryAsset } from '../services/cloudinaryService.js';

/**
 * PTE Exam Booking — catalog & admin storefront CMS.
 * Public:  GET /api/pte-booking-catalog        → { products, page }
 * Admin:   /api/admin/pte-booking-products[...] → CRUD, reorder, publish
 *          /api/admin/pte-booking/config        → page-level content
 * Rules:
 *  - Public catalog serves ONLY `status:'published' && active` products and the
 *    PUBLISHED page config (drafts are never exposed).
 *  - Every mutation writes to the document's `auditHistory` AND a central
 *    AuditLog row.
 *  - Pricing lives ONLY here; payment re-reads it at order time.
 */

export const PTE_BOOKING_CONFIG_KEY = 'pte_booking_page_config';

/** Mirrors the current storefront section (brand row, hero, notice, bottom bar). */
export const DEFAULT_PTE_BOOKING_PAGE_CONTENT = {
  brand: { showPearsonLogo: true, badgeText: 'PTE EXAM BOOKING' },
  hero: {
    heading: 'Get Your PTE Exam Booked.',
    highlight: 'PTE Exam',
    subtitle: 'Simple booking. Better pricing. Zero hassle.',
  },
  notice: {
    enabled: true,
    title: 'EXAM BOOKING ASSISTANCE ONLY',
    description: 'This payment is for PTE exam booking assistance only. No voucher, voucher code, or voucher credit is included.',
  },
  bottomBar: {
    cards: [
      { title: 'Authorized Pearson', description: 'Test Centre Booking Assistance', icon: 'ShieldCheck' },
      { title: 'Slot Selection Assistance', description: 'Across India', icon: 'Calendar' },
      { title: 'Dedicated Human Support', description: 'on WhatsApp & Phone', icon: 'Headphones' },
    ],
    button: { text: 'Learn More About Booking Assistance →', href: '/contact', visible: true },
  },
};

const JSON_SAME = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return a === b; }
};

const diffFields = (before, after) => {
  const changes = {};
  for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (!JSON_SAME(before?.[key], after?.[key])) changes[key] = { from: before?.[key], to: after?.[key] };
  }
  return changes;
};

const adminInfo = (req) => ({
  adminId: req?.user?._id || null,
  adminEmail: req?.user?.email || 'system@apexvouchers.in',
  ipAddress: req?.ip || null,
});

const sanitizeAuditDoc = (doc) => ({
  key: doc.key,
  name: doc.name,
  shortDescription: doc.shortDescription,
  serviceLabel: doc.serviceLabel,
  badgeText: doc.badgeText,
  badgeTint: doc.badgeTint,
  pricing: doc.pricing,
  features: (doc.features || []).map((f) => ({ text: f.text, enabled: f.enabled })),
  button: doc.button,
  active: doc.active,
  displayOrder: doc.displayOrder,
  status: doc.status,
});

const appendAudit = async ({ doc, admin, action, before, after, note }) => {
  const entry = {
    action,
    adminId: admin.adminId,
    adminEmail: admin.adminEmail,
    timestamp: new Date(),
    changes: { ...(note ? { note } : {}), ...diffFields(before, after) },
  };
  await PTEBookingProduct.updateOne({ _id: doc._id }, { $push: { auditHistory: { $each: [entry] } } }).catch(() => {});
  await AuditLog.create({
    adminId: admin.adminId,
    adminEmail: admin.adminEmail,
    action,
    resourceType: 'PTEBookingProduct',
    resourceId: String(doc._id),
    details: { key: doc.key, name: doc.name, changes: entry.changes },
    ipAddress: admin.ipAddress,
  }).catch(() => {});
  return entry;
};
const normalizePTEBookingPayload = (body = {}, { partial = false } = {}) => {
  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  const out = {};

  if (body.name !== undefined || !partial) {
    const name = clean(body.name);
    if (!name && !partial) throw new AppError('Product name is required', 400, 'NAME_REQUIRED');
    out.name = name;
  }
  if (body.key !== undefined || !partial) {
    const key = clean(body.key).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    if (!key && !partial) throw new AppError('A unique key is required (lowercase, e.g. pte-academic)', 400, 'KEY_REQUIRED');
    out.key = key;
  }
  if (body.shortDescription !== undefined) out.shortDescription = clean(body.shortDescription);
  if (body.serviceLabel !== undefined) out.serviceLabel = clean(body.serviceLabel);
  if (body.badgeText !== undefined) out.badgeText = clean(body.badgeText);
  if (body.badgeTint !== undefined) out.badgeTint = /^#[0-9a-fA-F]{3,8}$/.test(clean(body.badgeTint)) ? clean(body.badgeTint) : '#FF005C';
  if (body.image !== undefined) out.image = clean(body.image);
  if (body.imagePublicId !== undefined) out.imagePublicId = clean(body.imagePublicId);
  if (body.imageAlt !== undefined) out.imageAlt = clean(body.imageAlt);

  if (body.pricing !== undefined || !partial) {
    const p = body.pricing && typeof body.pricing === 'object' ? body.pricing : (partial ? {} : null);
    if (!p && !partial) throw new AppError('Pricing is required', 400, 'PRICING_REQUIRED');
    const bookingPrice = p?.bookingPrice !== undefined ? Number(p.bookingPrice) : NaN;
    const standardPrice = p?.standardPrice !== undefined ? Number(p.standardPrice) : (partial ? undefined : 0);
    if (!partial && (!Number.isFinite(bookingPrice) || bookingPrice < 0)) {
      throw new AppError('Special booking price must be a non-negative number', 400, 'PRICE_INVALID');
    }
    if (!partial && (!Number.isFinite(standardPrice) || standardPrice < 0)) {
      throw new AppError('Standard exam price must be a non-negative number', 400, 'PRICE_INVALID');
    }
    const pricing = {};
    if (Number.isFinite(bookingPrice)) pricing.bookingPrice = bookingPrice;
    if (Number.isFinite(standardPrice)) pricing.standardPrice = standardPrice;
    if (p?.currency !== undefined) pricing.currency = PTE_BOOKING_CURRENCIES.includes(p.currency) ? p.currency : 'INR';
    if (p?.showStandardPrice !== undefined) pricing.showStandardPrice = !!p.showStandardPrice;
    if (p?.showSavingsBadge !== undefined) pricing.showSavingsBadge = !!p.showSavingsBadge;
    out.pricing = pricing;
  }

  if (body.features !== undefined) {
    if (!Array.isArray(body.features)) throw new AppError('features must be an array', 400, 'FEATURES_INVALID');
    out.features = body.features
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({ text: clean(f.text), enabled: f.enabled !== false }))
      .filter((f) => f.text);
  }

  if (body.button !== undefined) {
    const b = body.button && typeof body.button === 'object' ? body.button : {};
    const button = {};
    if (b.text !== undefined) button.text = clean(b.text);
    if (b.href !== undefined) button.href = clean(b.href);
    if (b.visible !== undefined) button.visible = !!b.visible;
    if (b.enabled !== undefined) button.enabled = !!b.enabled;
    out.button = button;
  }

  if (body.active !== undefined) out.active = !!body.active;
  if (body.displayOrder !== undefined) out.displayOrder = Number(body.displayOrder) || 0;

  return out;
};
/* ══════════════════════════════════════════════════════════════
 * PUBLIC — storefront catalog
 * ══════════════════════════════════════════════════════════════ */
export const getPublicPTEBookingCatalog = async (_req, res, next) => {
  try {
    const products = await PTEBookingProduct.find({ status: 'published', active: true })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();

    const cfgDoc = await Setting.findOne({ key: PTE_BOOKING_CONFIG_KEY }).lean();
    const cfg = cfgDoc?.value || {};
    const content = cfg.status === 'published' && cfg.content ? cfg.content : DEFAULT_PTE_BOOKING_PAGE_CONTENT;

    res.json({
      success: true,
      products: products.map((p) => ({
        _id: String(p._id),
        key: p.key,
        name: p.name,
        shortDescription: p.shortDescription || '',
        serviceLabel: p.serviceLabel || 'EXAM BOOKING SERVICE',
        badgeText: p.badgeText || '',
        badgeTint: p.badgeTint || '#FF005C',
        image: p.image || '',
        imageAlt: p.imageAlt || `${p.name} exam booking service`,
        pricing: {
          bookingPrice: Number(p.pricing?.bookingPrice) || 0,
          standardPrice: Number(p.pricing?.standardPrice) || 0,
          currency: p.pricing?.currency || 'INR',
          showStandardPrice: p.pricing?.showStandardPrice !== false,
          showSavingsBadge: p.pricing?.showSavingsBadge !== false,
        },
        features: (p.features || []).filter((f) => f && f.text),
        button: {
          text: p.button?.text || 'Book Now',
          href: p.button?.href || '',
          visible: p.button?.visible !== false,
          enabled: p.button?.enabled !== false,
        },
        displayOrder: p.displayOrder || 0,
      })),
      page: content,
    });
  } catch (err) {
    next(err);
  }
};

/* ══════════════════════════════════════════════════════════════
 * ADMIN — product CRUD
 * ══════════════════════════════════════════════════════════════ */
export const listPTEBookingProductsAdmin = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { key: rx }];
    }
    const products = await PTEBookingProduct.find(filter)
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    next(err);
  }
};

export const getPTEBookingProductAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = mongoose.Types.ObjectId.isValid(id)
      ? await PTEBookingProduct.findById(id).lean()
      : await PTEBookingProduct.findOne({ key: String(id).toLowerCase() }).lean();
    if (!product) return next(new AppError('PTE booking product not found', 404));
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const createPTEBookingProductAdmin = async (req, res, next) => {
  try {
    const payload = normalizePTEBookingPayload(req.body || {});
    const existing = await PTEBookingProduct.exists({ key: payload.key });
    if (existing) return next(new AppError(`A product with key "${payload.key}" already exists`, 409, 'KEY_EXISTS'));
    const product = new PTEBookingProduct({ ...payload, auditHistory: [] });
    await product.save();
    const admin = adminInfo(req);
    await appendAudit({ doc: product, admin, action: 'PTE_BOOKING_PRODUCT_CREATED', before: {}, after: sanitizeAuditDoc(product) });
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};
export const updatePTEBookingProductAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await PTEBookingProduct.findById(id);
    if (!product) return next(new AppError('PTE booking product not found', 404));
    const before = sanitizeAuditDoc(product);
    const payload = normalizePTEBookingPayload(req.body || {}, { partial: true });
    if (payload.key && payload.key !== product.key) {
      const clash = await PTEBookingProduct.exists({ key: payload.key, _id: { $ne: product._id } });
      if (clash) return next(new AppError(`A product with key "${payload.key}" already exists`, 409, 'KEY_EXISTS'));
    }
    Object.assign(product, payload);
    await product.save();
    const after = sanitizeAuditDoc(product);
    const admin = adminInfo(req);
    await appendAudit({ doc: product, admin, action: 'PTE_BOOKING_PRODUCT_UPDATED', before, after });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const deletePTEBookingProductAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await PTEBookingProduct.findById(id);
    if (!product) return next(new AppError('PTE booking product not found', 404));
    const admin = adminInfo(req);
    if (product.status === 'published' && product.active) {
      product.active = false;
      await product.save();
      await appendAudit({ doc: product, admin, action: 'PTE_BOOKING_PRODUCT_DEACTIVATED', before: { active: true }, after: { active: false } });
      return res.json({ success: true, data: product, deactivated: true, message: 'Live product deactivated (kept as a draft in history). Delete again to remove it.' });
    }
    const before = sanitizeAuditDoc(product);
    await PTEBookingProduct.deleteOne({ _id: product._id });
    await AuditLog.create({
      adminId: admin.adminId,
      adminEmail: admin.adminEmail,
      action: 'PTE_BOOKING_PRODUCT_DELETED',
      resourceType: 'PTEBookingProduct',
      resourceId: String(product._id),
      details: { key: product.key, name: product.name, before },
      ipAddress: admin.ipAddress,
    }).catch(() => {});
    res.json({ success: true, deleted: true, message: 'Product deleted.' });
  } catch (err) {
    next(err);
  }
};

export const reorderPTEBookingProductsAdmin = async (req, res, next) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return next(new AppError('items is required', 400, 'ITEMS_REQUIRED'));
    }
    const bulk = [];
    items.forEach((entry, index) => {
      const id = String(entry?._id || entry?.id || '');
      if (!mongoose.Types.ObjectId.isValid(id)) return;
      bulk.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $set: { displayOrder: Number(entry.displayOrder ?? index + 1) } },
        },
      });
    });
    if (bulk.length === 0) return next(new AppError('No valid items to reorder', 400, 'ITEMS_INVALID'));
    await PTEBookingProduct.bulkWrite(bulk);
    const admin = adminInfo(req);
    await AuditLog.create({
      adminId: admin.adminId,
      adminEmail: admin.adminEmail,
      action: 'PTE_BOOKING_PRODUCTS_REORDERED',
      resourceType: 'PTEBookingProduct',
      resourceId: 'all',
      details: { order: items.map((i) => String(i?._id || i?.id)) },
      ipAddress: admin.ipAddress,
    }).catch(() => {});
    res.json({ success: true, updated: bulk.length });
  } catch (err) {
    next(err);
  }
};
export const publishPTEBookingProductAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await PTEBookingProduct.findById(id);
    if (!product) return next(new AppError('PTE booking product not found', 404));
    if (!product.name || !product.pricing || !(Number(product.pricing.bookingPrice) > 0)) {
      return next(new AppError('Add a name and a special booking price before publishing', 400, 'INCOMPLETE'));
    }
    const before = { status: product.status, active: product.active };
    product.status = 'published';
    product.active = true;
    await product.save();
    const admin = adminInfo(req);
    await appendAudit({ doc: product, admin, action: 'PTE_BOOKING_PRODUCT_PUBLISHED', before, after: { status: 'published', active: true } });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const unpublishPTEBookingProductAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await PTEBookingProduct.findById(id);
    if (!product) return next(new AppError('PTE booking product not found', 404));
    const before = { status: product.status, active: product.active };
    product.status = 'draft';
    await product.save();
    const admin = adminInfo(req);
    await appendAudit({ doc: product, admin, action: 'PTE_BOOKING_PRODUCT_UNPUBLISHED', before, after: { status: 'draft', active: product.active } });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const uploadPTEBookingImageAdmin = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) return next(new AppError('No image file uploaded', 400));
    let result;
    try {
      result = await uploadImage(file.buffer, { folder: 'apex_pte_booking' });
    } catch (cloudErr) {
      console.error('[Upload] PTE booking image Cloudinary upload failed:', cloudErr.message);
      return next(new AppError('Image upload to Cloudinary failed. Please try again.', 502));
    }
    res.json({
      success: true,
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (err) {
    next(err);
  }
};

export const removePTEBookingImageAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await PTEBookingProduct.findById(id);
    if (!product) return next(new AppError('PTE booking product not found', 404));
    const publicId = product.imagePublicId;
    const before = { image: product.image, imagePublicId: product.imagePublicId };
    product.image = '';
    product.imagePublicId = '';
    await product.save();
    const admin = adminInfo(req);
    await appendAudit({ doc: product, admin, action: 'PTE_BOOKING_PRODUCT_IMAGE_REMOVED', before, after: { image: '', imagePublicId: '' } });
    if (publicId) await deleteCloudinaryAsset(publicId, 'image').catch(() => {});
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};
/* ══════════════════════════════════════════════════════════════
 * ADMIN — page-level content (single Setting doc)
 * ══════════════════════════════════════════════════════════════ */
const getConfigDoc = async () => {
  const doc = await Setting.findOne({ key: PTE_BOOKING_CONFIG_KEY }).lean();
  if (doc && doc.value && typeof doc.value === 'object' && doc.value.content) return doc;
  return {
    _id: null,
    value: { status: 'draft', content: DEFAULT_PTE_BOOKING_PAGE_CONTENT, auditHistory: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

export const getPTEBookingConfigAdmin = async (_req, res, next) => {
  try {
    const doc = await getConfigDoc();
    res.json({ success: true, data: doc.value });
  } catch (err) {
    next(err);
  }
};

const normalizeConfigContent = (content = {}) => {
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const cards = Array.isArray(content.bottomBar?.cards)
    ? content.bottomBar.cards
    : DEFAULT_PTE_BOOKING_PAGE_CONTENT.bottomBar.cards;
  return {
    brand: {
      showPearsonLogo: content.brand?.showPearsonLogo !== false,
      badgeText: s(content.brand?.badgeText) || 'PTE EXAM BOOKING',
    },
    hero: {
      heading: s(content.hero?.heading) || 'Get Your PTE Exam Booked.',
      highlight: s(content.hero?.highlight) || 'PTE Exam',
      subtitle: s(content.hero?.subtitle) || 'Simple booking. Better pricing. Zero hassle.',
    },
    notice: {
      enabled: content.notice?.enabled !== false,
      title: s(content.notice?.title) || 'BOOKING SERVICE ONLY',
      description: s(content.notice?.description) || DEFAULT_PTE_BOOKING_PAGE_CONTENT.notice.description,
    },
    bottomBar: {
      cards: cards.slice(0, 4).map((c) => ({
        title: s(c?.title),
        description: s(c?.description),
        icon: s(c?.icon) || 'ShieldCheck',
      })).filter((c) => c.title || c.description),
      button: {
        text: s(content.bottomBar?.button?.text) || 'Browse PTE Vouchers',
        href: s(content.bottomBar?.button?.href) || '/exam-vouchers',
        visible: content.bottomBar?.button?.visible !== false,
      },
    },
  };
};

export const updatePTEBookingConfigAdmin = async (req, res, next) => {
  try {
    const admin = adminInfo(req);
    if (!req.body || typeof req.body !== 'object') {
      return next(new AppError('Config payload required', 400, 'CONFIG_REQUIRED'));
    }
    const current = await getConfigDoc();
    const before = current.value.content || {};
    const content = normalizeConfigContent(req.body.content || {});
    const status = req.body.status === 'published' ? 'published' : 'draft';
    const entry = {
      action: status === 'published' ? 'PTE_BOOKING_CONFIG_PUBLISHED' : 'PTE_BOOKING_CONFIG_UPDATED_DRAFT',
      adminId: admin.adminId,
      adminEmail: admin.adminEmail,
      timestamp: new Date(),
      changes: diffFields(before, content),
    };
    const value = {
      status,
      content,
      updatedBy: admin.adminEmail,
      updatedAt: new Date(),
      auditHistory: [...(current.value.auditHistory || []), entry].slice(-100),
    };
    const saved = await Setting.findOneAndUpdate(
      { key: PTE_BOOKING_CONFIG_KEY },
      { key: PTE_BOOKING_CONFIG_KEY, value },
      { upsert: true, new: true }
    ).lean();
    await AuditLog.create({
      adminId: admin.adminId,
      adminEmail: admin.adminEmail,
      action: entry.action,
      resourceType: 'Setting',
      resourceId: PTE_BOOKING_CONFIG_KEY,
      details: { changes: entry.changes, status },
      ipAddress: admin.ipAddress,
    }).catch(() => {});
    res.json({ success: true, data: saved.value });
  } catch (err) {
    next(err);
  }
};