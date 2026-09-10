import fs from 'fs';
import { User, Order, Product, VoucherCode, Promotion, AuditLog, Video, Reel, Setting, Campaign, PTEBookingRequest, VoucherRequest, VOUCHER_REQUEST_STATUSES, FulfillmentRequest, ORDER_STATUSES, PAYMENT_STATUSES } from '../models/index.js';
import { normalizeVoucherType } from '../services/voucherAllocation.js';
import {
  deleteVouchers,
  previewVoucherDeletion,
  setVoucherStatuses,
  updateVoucherFields,
  maskVoucherCode,
} from '../services/voucherInventory.js';
import {
  listVoucherRequests,
  getVoucherRequestById,
  updateVoucherRequest as updateVoucherRequestService,
  getVoucherRequestStats,
} from '../services/voucherRequestService.js';
import { AppError } from '../middleware/errorHandler.js';
import { hashPassword, comparePassword } from '../middleware/auth.js';
import { isValidObjectId } from '../config/db.js';
import { escapeRegex } from '../utils/index.js';
import { sendOrderConfirmation, sendEmail, emailConfigStatus } from '../services/email.js';
import {
  buildDirectVideoUrl,
  buildVideoThumbnailUrl,
  extractPublicId,
  uploadBufferToCloudinary,
  deleteCloudinaryAsset,
  buildOptimizedImageUrl,
  uploadImage,
  isCloudinaryUrl,
} from '../services/cloudinaryService.js';
import { sanitizeRichHtml } from '../utils/richText.js';


const PAID_ORDER_STATUSES = ['PAID', 'FULFILLED'];

const toId = (id) => (id ? id.toString() : '');
const emptyVoucherStats = () => ({
  available: 0,
  reserved: 0,
  sold: 0,
  assigned: 0,
  used: 0,
  expired: 0,
  total: 0,
});

const countMap = (rows) =>
  new Map(rows.map((row) => [toId(row._id), row.count || row.total || 0]));

const productMap = (rows) =>
  new Map(rows.map((row) => [toId(row._id), row]));

const searchRegex = (search) => new RegExp(escapeRegex(search), 'i');

const aggregateVoucherStatsByProduct = async (productIds = []) => {
  const ids = productIds.filter(Boolean);
  if (!ids.length) return new Map();

  const rows = await VoucherCode.aggregate([
    { $match: { productId: { $in: ids } } },
    {
      $group: {
        _id: '$productId',
        available: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, 1, 0] } },
        reserved: { $sum: { $cond: [{ $eq: ['$status', 'RESERVED'] }, 1, 0] } },
        sold: { $sum: { $cond: [{ $in: ['$status', ['SOLD', 'ASSIGNED', 'USED']] }, 1, 0] } },
        assigned: { $sum: { $cond: [{ $eq: ['$status', 'ASSIGNED'] }, 1, 0] } },
        used: { $sum: { $cond: [{ $eq: ['$status', 'USED'] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
  ]);

  return new Map(rows.map((row) => [toId(row._id), row]));
};

const getVoucherStats = (statsByProduct, productId) =>
  statsByProduct.get(toId(productId)) || emptyVoucherStats();

const isValidHttpUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeGuideScreenshot = (shot) => {
  const s = shot && typeof shot === 'object' ? shot : {};
  return {
    url: String(s.url || '').trim(),
    publicId: String(s.publicId || '').trim(),
    alt: String(s.alt || '').trim(),
    caption: String(s.caption || '').trim(),
    width: Number(s.width) > 0 ? Number(s.width) : undefined,
    height: Number(s.height) > 0 ? Number(s.height) : undefined,
  };
};

/**
 * Normalise + validate a product's redemption CMS block. Full-replace semantics
 * (whatever the admin sends replaces the stored guide). Empty steps are dropped;
 * partial steps are kept (an admin may save before finishing — spec §19). URLs
 * are hard-validated. `order` is re-derived from array position so drag/move in
 * the editor is the single source of truth for ordering.
 */
const normalizeRedemptionGuide = (guide) => {
  if (guide === null || typeof guide !== 'object') {
    return { enabled: false, providerLabel: '', officialUrl: '', buttonText: '', introduction: '', steps: [], warnings: [] };
  }
  const rawSteps = Array.isArray(guide.steps) ? guide.steps : [];
  const steps = rawSteps
    .map((s, i) => {
      if (!s || typeof s !== 'object') return null;
      const title = String(s.title || '').trim();
      const description = String(s.description || '').trim();
      const importantNote = String(s.importantNote || '').trim();
      const videoUrl = String(s.videoUrl || '').trim();
      const screenshot = normalizeGuideScreenshot(s.screenshot);
      const isEmpty = !title && !description && !importantNote && !videoUrl && !screenshot.url;
      if (isEmpty) return null;
      if (videoUrl && !isValidHttpUrl(videoUrl)) {
        throw new AppError(`Redemption step ${i + 1} video URL is not a valid URL`, 400, 'VALIDATION_ERROR');
      }
      return { title, description, screenshot, importantNote, videoUrl };
    })
    .filter(Boolean)
    .map((s, i) => ({ ...s, order: i + 1 }));

  const officialUrl = String(guide.officialUrl || '').trim();
  if (officialUrl && !isValidHttpUrl(officialUrl)) {
    throw new AppError('Redemption guide official URL is not a valid URL', 400, 'VALIDATION_ERROR');
  }
  const warnings = Array.isArray(guide.warnings)
    ? guide.warnings.map((w) => String(w || '').trim()).filter(Boolean)
    : [];

  return {
    enabled: !!guide.enabled,
    providerLabel: String(guide.providerLabel || '').trim(),
    officialUrl,
    buttonText: String(guide.buttonText || '').trim(),
    introduction: String(guide.introduction || '').trim(),
    steps,
    warnings,
    lastUpdated: steps.length > 0 || guide.enabled ? new Date() : undefined,
  };
};

/**
 * Normalise + validate a product's "How to Purchase" CMS block. Same
 * full-replace / partial-step-keeping semantics as normalizeRedemptionGuide.
 */
const normalizePurchaseGuide = (guide) => {
  if (guide === null || typeof guide !== 'object') {
    return { enabled: false, eyebrow: '', title: '', description: '', steps: [] };
  }
  const rawSteps = Array.isArray(guide.steps) ? guide.steps : [];
  const steps = rawSteps
    .map((s, i) => {
      if (!s || typeof s !== 'object') return null;
      const title = String(s.title || '').trim();
      const description = String(s.description || '').trim();
      const ctaText = String(s.ctaText || '').trim();
      const ctaUrl = String(s.ctaUrl || '').trim();
      const screenshot = normalizeGuideScreenshot(s.screenshot);
      const isEmpty = !title && !description && !ctaText && !ctaUrl && !screenshot.url;
      if (isEmpty) return null;
      if (ctaUrl && !isValidHttpUrl(ctaUrl)) {
        throw new AppError(`Purchase step ${i + 1} CTA URL is not a valid URL`, 400, 'VALIDATION_ERROR');
      }
      return { title, description, screenshot, ctaText, ctaUrl };
    })
    .filter(Boolean)
    .map((s, i) => ({ ...s, order: i + 1 }));

  return {
    enabled: !!guide.enabled,
    eyebrow: String(guide.eyebrow || '').trim(),
    title: String(guide.title || '').trim(),
    description: String(guide.description || '').trim(),
    steps,
    lastUpdated: steps.length > 0 || guide.enabled ? new Date() : undefined,
  };
};

/** Non-blocking pre-publish checks surfaced to the admin after a save (spec §19). */
const collectRedemptionWarnings = (product) => {
  const warnings = [];
  const g = product?.redemptionGuide;
  if (!product?.active || !g?.enabled) return warnings;
  if (!g.steps || g.steps.length === 0) {
    warnings.push('Redemption guide is enabled but has no steps yet.');
  } else {
    g.steps.forEach((s, i) => {
      if (!s.title || !s.description) warnings.push(`Redemption step ${i + 1} is missing a title or description.`);
    });
  }
  if (!g.officialUrl && !product.officialWebsiteUrl && !product.officialProductUrl) {
    warnings.push('Redemption guide has no official / redemption URL set.');
  }
  return warnings;
};

const normalizeProductPayload = (body, { selfId } = {}) => {
  const payload = { ...body };
  if (typeof payload.badges === 'string') {
    payload.badges = payload.badges.split(',').map((b) => b.trim()).filter(Boolean);
  }
  // Duration variants — normalize to the schema shape { key, label, sellingPrice, originalPrice, validityDays, enabled }.
  if (payload.durationOptions !== undefined) {
    if (!Array.isArray(payload.durationOptions)) {
      throw new AppError('durationOptions must be an array', 400, 'VALIDATION_ERROR');
    }
    const VALID_KEYS = ['1-week', '1-month', '3-months'];
    payload.durationOptions = payload.durationOptions
      .map((o) => {
        if (!o || typeof o !== 'object') return null;
        const key = String(o.key || '').toLowerCase().trim();
        if (!VALID_KEYS.includes(key)) return null;
        const sellingPrice = Number(o.sellingPrice);
        const originalPrice = Number(o.originalPrice);
        if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return null;
        if (!Number.isFinite(originalPrice) || originalPrice < 0) return null;
        if (sellingPrice > originalPrice) {
          throw new AppError(`Selling price for duration ${key} cannot exceed its original price`, 400, 'VALIDATION_ERROR');
        }
        return {
          key,
          label: String(o.label || key).trim() || key,
          sellingPrice,
          originalPrice,
          validityDays: Number.isFinite(Number(o.validityDays)) && Number(o.validityDays) > 0 ? Number(o.validityDays) : 7,
          enabled: o.enabled !== false,
        };
      })
      .filter(Boolean);
  }
  if (payload.displayOrder !== undefined && payload.displayOrder !== null && payload.displayOrder !== '') {
    if (Number.isNaN(Number(payload.displayOrder))) {
      throw new AppError('Display order must be numeric', 400, 'VALIDATION_ERROR');
    }
    payload.displayOrder = Number(payload.displayOrder);
  }
  if (!isValidHttpUrl(payload.officialWebsiteUrl)) {
    throw new AppError('Official website URL is not a valid URL', 400, 'VALIDATION_ERROR');
  }
  if (!isValidHttpUrl(payload.officialProductUrl)) {
    throw new AppError('Official product URL is not a valid URL', 400, 'VALIDATION_ERROR');
  }

  // ── Guide CMS blocks ─────────────────────────────────────────────────────
  if (payload.redemptionGuide !== undefined) {
    payload.redemptionGuide = normalizeRedemptionGuide(payload.redemptionGuide);
  }
  if (payload.purchaseGuide !== undefined) {
    payload.purchaseGuide = normalizePurchaseGuide(payload.purchaseGuide);
  }
  if (payload.productContent !== undefined) {
    const pc = payload.productContent && typeof payload.productContent === 'object' ? payload.productContent : {};
    payload.productContent = {
      enabled: !!pc.enabled,
      heading: String(pc.heading || '').trim(),
      content: sanitizeRichHtml(pc.content || ''),
    };
  }
  if (payload.importantInfo !== undefined) {
    payload.importantInfo = (Array.isArray(payload.importantInfo) ? payload.importantInfo : [])
      .map((r) => ({ label: String(r?.label || '').trim(), value: String(r?.value || '').trim() }))
      .filter((r) => r.label || r.value);
  }
  if (payload.importantNotes !== undefined) {
    payload.importantNotes = (Array.isArray(payload.importantNotes) ? payload.importantNotes : [])
      .map((n) => String(n || '').trim())
      .filter(Boolean);
  }
  if (payload.faqs !== undefined) {
    payload.faqs = (Array.isArray(payload.faqs) ? payload.faqs : [])
      .map((f) => ({ question: String(f?.question || '').trim(), answer: String(f?.answer || '').trim() }))
      .filter((f) => f.question && f.answer);
  }
  if (payload.relatedProducts !== undefined) {
    const seen = new Set();
    payload.relatedProducts = (Array.isArray(payload.relatedProducts) ? payload.relatedProducts : [])
      .map((r) => (r && typeof r === 'object' && r._id ? String(r._id) : String(r || '')))
      .filter((rid) => {
        if (!isValidObjectId(rid) || seen.has(rid)) return false;
        if (selfId && rid === String(selfId)) return false;
        seen.add(rid);
        return true;
      });
  }

  return payload;
};

const recordAudit = async (req, action, resourceType, resourceId, details) => {
  try {
    if (req?.user) {
      await AuditLog.create({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action,
        resourceType,
        resourceId: resourceId ? String(resourceId) : null,
        details: details || {},
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      });
    }
  } catch (err) {
    console.error('[audit] log error:', err.message);
  }
};

export const dashboardOverview = async (req, res, next) => {
  try {
    const { period = '30d', startDate, endDate } = req.query;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    let daysCount = 30;
    if (period === '7d') daysCount = 7;
    if (period === '90d') daysCount = 90;
    if (period === 'today') daysCount = 1;

    const rangeStart = period === 'today'
      ? todayStart
      : new Date(now.getTime() - daysCount * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalProducts,
      totalVouchers,
      availableVouchers,
      soldVouchers,
      usedVouchers,
      totalOrdersCount,
      pendingOrdersCount,
      activePromosCount,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments({ active: true }),
      VoucherCode.countDocuments(),
      VoucherCode.countDocuments({ status: 'AVAILABLE' }),
      VoucherCode.countDocuments({ status: { $in: ['SOLD', 'ASSIGNED'] } }),
      VoucherCode.countDocuments({ status: 'USED' }),
      Order.countDocuments({ orderStatus: { $ne: 'CANCELLED' } }),
      Order.countDocuments({
        orderStatus: {
          $in: ['PENDING', 'PAYMENT_PENDING', 'PROCESSING', 'PAYMENT_RECEIVED_NEEDS_ALLOCATION'],
        },
      }),
      Promotion.countDocuments({
        active: true,
        startAt: { $lte: now },
        endAt: { $gte: now },
      }),
    ]);

    // Explicit Net Revenue: SUM(Paid/Fulfilled Total) - SUM(Refunded Orders).
    // CURRENCY-AWARE: ₹ and $ totals are NEVER summed together. The headline
    // revenue numbers are INR-only; `revenueByCurrency` carries the split.
    const [paidByCurrencyAgg, refundByCurrencyAgg, periodPaidByCurrencyAgg, periodRefundByCurrencyAgg] = await Promise.all([
      Order.aggregate([
        { $match: { orderStatus: { $in: PAID_ORDER_STATUSES } } },
        { $group: { _id: { $ifNull: ['$currency', 'INR'] }, sum: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { orderStatus: 'REFUNDED' } },
        { $group: { _id: { $ifNull: ['$currency', 'INR'] }, sum: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { orderStatus: { $in: PAID_ORDER_STATUSES }, createdAt: { $gte: rangeStart } } },
        { $group: { _id: { $ifNull: ['$currency', 'INR'] }, sum: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { orderStatus: 'REFUNDED', createdAt: { $gte: rangeStart } } },
        { $group: { _id: { $ifNull: ['$currency', 'INR'] }, sum: { $sum: '$total' } } },
      ]),
    ]);

    const sumWhere = (rows, currency) =>
      rows.filter((r) => String(r._id || 'INR').toUpperCase() === currency)
        .reduce((s, r) => s + (r.sum || 0), 0);
    const mapByCurrency = (rows) =>
      Object.fromEntries(rows.map((r) => [String(r._id || 'INR').toUpperCase(), Math.round((r.sum || 0) * 100) / 100]));

    // INR-only headline revenue (legacy semantics preserved).
    const grossRevenue = sumWhere(paidByCurrencyAgg, 'INR');
    const refundedAmount = sumWhere(refundByCurrencyAgg, 'INR');
    const lifetimeRevenue = Math.max(0, grossRevenue - refundedAmount);
    const lifetimeNetRevenue = lifetimeRevenue;

    const periodGross = sumWhere(periodPaidByCurrencyAgg, 'INR');
    const periodOrdersCount = periodPaidByCurrencyAgg.reduce((s, r) => s + (r.count || 0), 0);
    const periodRefunded = sumWhere(periodRefundByCurrencyAgg, 'INR');
    const periodNetRevenue = Math.max(0, periodGross - periodRefunded);

    // Per-currency splits (lifetime + period) for auditable reporting.
    const revenueByCurrency = mapByCurrency(paidByCurrencyAgg);
    const periodRevenueByCurrency = mapByCurrency(periodPaidByCurrencyAgg);

    // If period is all time, use lifetime; otherwise use period-specific
    const netRevenue = periodNetRevenue;

    // Today's Net Revenue vs Yesterday's Net Revenue (INR-only; USD orders are
    // reported separately via revenueByCurrency — never mixed currencies).
    const todayAgg = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: PAID_ORDER_STATUSES },
          createdAt: { $gte: todayStart },
        },
      },
      { $group: { _id: { $ifNull: ['$currency', 'INR'] }, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]);
    const todayRevenue = todayAgg.filter((r) => String(r._id || 'INR') === 'INR').reduce((s, r) => s + (r.total || 0), 0);
    const todayOrders = todayAgg.reduce((s, r) => s + (r.count || 0), 0);
    const todayRevenueByCurrency = Object.fromEntries(todayAgg.map((r) => [String(r._id || 'INR'), Math.round((r.total || 0) * 100) / 100]));

    const yesterdayAgg = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: PAID_ORDER_STATUSES },
          createdAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
        },
      },
      { $group: { _id: { $ifNull: ['$currency', 'INR'] }, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]);
    const yesterdayRevenue = yesterdayAgg.filter((r) => String(r._id || 'INR') === 'INR').reduce((s, r) => s + (r.total || 0), 0);
    const yesterdayOrders = yesterdayAgg.reduce((s, r) => s + (r.count || 0), 0);

    const revenueGrowth =
      yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10
        : todayRevenue > 0
        ? 100
        : 0;

    const ordersGrowth =
      yesterdayOrders > 0
        ? Math.round(((todayOrders - yesterdayOrders) / yesterdayOrders) * 1000) / 10
        : todayOrders > 0
        ? 100
        : 0;

    // Total products sold (period vs lifetime)
    const [unitsSoldAgg, periodUnitsAgg] = await Promise.all([
      Order.aggregate([
        { $match: { orderStatus: { $in: PAID_ORDER_STATUSES } } },
        { $unwind: '$items' },
        { $group: { _id: null, totalUnits: { $sum: '$items.quantity' } } },
      ]),
      Order.aggregate([
        { $match: { orderStatus: { $in: PAID_ORDER_STATUSES }, createdAt: { $gte: rangeStart } } },
        { $unwind: '$items' },
        { $group: { _id: null, totalUnits: { $sum: '$items.quantity' } } },
      ]),
    ]);
    const lifetimeProductsSold = unitsSoldAgg[0]?.totalUnits || 0;
    const periodProductsSold = periodUnitsAgg[0]?.totalUnits || 0;
    const totalProductsSold = periodProductsSold;

    // Best-Selling Products Table
    const bestSellers = await Order.aggregate([
      { $match: { orderStatus: { $in: PAID_ORDER_STATUSES } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.productName' },
          unitsSold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: 5 },
    ]);

    // Attach current stock to best sellers without per-row count queries.
    const bestSellerProductIds = bestSellers.map((bs) => bs._id).filter(Boolean);
    const [bestSellerStockByProduct, bestSellerProducts] = await Promise.all([
      aggregateVoucherStatsByProduct(bestSellerProductIds),
      bestSellerProductIds.length
        ? Product.find({ _id: { $in: bestSellerProductIds } }).select('sellingPrice').lean()
        : [],
    ]);
    const bestSellerProductsById = productMap(bestSellerProducts);
    const enrichedBestSellers = bestSellers.map((bs) => {
      const stock = getVoucherStats(bestSellerStockByProduct, bs._id).available;
      const product = bestSellerProductsById.get(toId(bs._id));
      return {
        id: bs._id,
        name: bs.name,
        unitsSold: bs.unitsSold,
        revenue: bs.revenue,
        stock,
        sellingPrice: product?.sellingPrice || 0,
      };
    });

    // Low Stock Alert Products
    const allProducts = await Product.find({ active: true })
      .select('name brand sellingPrice lowStockThreshold')
      .lean();
    const allStockByProduct = await aggregateVoucherStatsByProduct(allProducts.map((p) => p._id));
    const lowStockProducts = allProducts
      .map((p) => ({
        id: p._id,
        name: p.name,
        brand: p.brand,
        availableStock: getVoucherStats(allStockByProduct, p._id).available,
        sellingPrice: p.sellingPrice,
        lowStockThreshold: p.lowStockThreshold || 10,
      }))
      .filter((p) => p.availableStock < p.lowStockThreshold);

    // Time-Series Charts Data (Daily Revenue, Orders, Vouchers Sold, Customers)
    const timeSeriesAgg = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: rangeStart },
          orderStatus: { $in: PAID_ORDER_STATUSES },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const vouchersSoldAgg = await VoucherCode.aggregate([
      {
        $match: {
          assignedAt: { $gte: rangeStart },
          status: { $in: ['SOLD', 'ASSIGNED', 'USED'] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$assignedAt' } },
          vouchers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const customersAgg = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: rangeStart },
          role: 'user',
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          customers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Active & Expiring Promotions
    const expiringSoonPromos = await Promotion.find({
      active: true,
      endAt: { $gte: now, $lte: new Date(Date.now() + 48 * 60 * 60 * 1000) },
    }).lean();

    const activePromotionsList = await Promotion.find({
      active: true,
      startAt: { $lte: now },
      endAt: { $gte: now },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email')
      .lean();

    const failedPaymentsCount = await Order.countDocuments({ paymentStatus: 'FAILED' });
    const refundsCount = await Order.countDocuments({
      $or: [{ orderStatus: 'REFUNDED' }, { paymentStatus: 'REFUNDED' }],
    });

    const newPTEBookingRequestsCount = await PTEBookingRequest.countDocuments({ status: 'New' });
    const recentPTEBookingRequests = await PTEBookingRequest.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const openVoucherRequestsCount = await VoucherRequest.countDocuments({
      status: { $in: ['PENDING', 'PROCESSING'] },
    });
    const recentVoucherRequests = await VoucherRequest.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      data: {
        kpi: {
          netRevenue,
          lifetimeRevenue,
          grossRevenue,
          refundedAmount,
          todayRevenue,
          yesterdayRevenue,
          // Currency-aware reporting split (never mixes ₹ + $ into one total).
          revenueByCurrency,
          periodRevenueByCurrency,
          todayRevenueByCurrency,
          revenueGrowth,
          totalOrders: periodOrdersCount,
          lifetimeOrders: totalOrdersCount,
          todayOrders,
          yesterdayOrders,
          ordersGrowth,
          totalProductsSold,
          lifetimeProductsSold,
          totalCustomers: totalUsers,
          availableVouchers,
          activePromotions: activePromosCount,
          pendingOrders: pendingOrdersCount,
          refunds: refundsCount,
          failedPayments: failedPaymentsCount,
          newPTEBookingRequests: newPTEBookingRequestsCount,
          newVoucherRequests: openVoucherRequestsCount,
        },
        charts: {
          dailyRevenue: timeSeriesAgg,
          dailyVouchersSold: vouchersSoldAgg,
          dailyNewCustomers: customersAgg,
        },
        tables: {
          bestSellers: enrichedBestSellers,
          lowStockProducts,
          recentOrders,
          activePromotions: activePromotionsList,
          recentPTEBookingRequests,
          recentVoucherRequests,
        },
        alerts: {
          lowStockCount: lowStockProducts.length,
          failedPaymentsCount,
          pendingOrdersCount,
          expiringPromosCount: expiringSoonPromos.length,
          newPTEBookingRequestsCount,
          openVoucherRequestsCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const filter = { role: 'user' };
    if (status) filter.status = status;
    if (search) {
      const s = searchRegex(search);
      filter.$or = [{ name: s }, { email: s }, { phone: s }];
    }
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (p - 1) * l;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      User.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id);
    const [orderCountRows, voucherCountRows] = userIds.length
      ? await Promise.all([
          Order.aggregate([
            { $match: { userId: { $in: userIds } } },
            { $group: { _id: '$userId', count: { $sum: 1 } } },
          ]),
          VoucherCode.aggregate([
            { $match: { userId: { $in: userIds } } },
            { $group: { _id: '$userId', count: { $sum: 1 } } },
          ]),
        ])
      : [[], []];

    const orderCounts = countMap(orderCountRows);
    const voucherCounts = countMap(voucherCountRows);
    const withCounts = users.map((u) => ({
      ...u,
      orderCount: orderCounts.get(toId(u._id)) || 0,
      voucherCount: voucherCounts.get(toId(u._id)) || 0,
    }));

    res.json({
      success: true,
      count: withCounts.length,
      total,
      page: p,
      pages: Math.ceil(total / l),
      data: withCounts,
    });
  } catch (err) {
    next(err);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = isValidObjectId(id)
      ? await User.findById(id).lean()
      : await User.findOne({ email: id }).lean();
    if (!user) return next(new AppError('User not found', 404));
    const orders = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).lean();
    const vouchers = await VoucherCode.find({ userId: user._id }).populate('productId', 'name brand').lean();
    res.json({ success: true, data: user, orders, vouchers });
  } catch (err) {
    next(err);
  }
};

export const setUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'disabled'].includes(status)) return next(new AppError('Invalid status', 400));
    const user = await User.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!user) return next(new AppError('User not found', 404));

    await recordAudit(req, 'CUSTOMER_STATUS_CHANGED', 'User', user._id, {
      userEmail: user.email,
      newStatus: status,
    });

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const listAdminProducts = async (req, res, next) => {
  try {
    const { search, status, category, provider, sort, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status === 'active') {
      filter.active = true;
      filter.archived = { $ne: true };
    } else if (status === 'inactive') {
      filter.active = false;
    } else if (status === 'featured') {
      filter.featured = true;
      filter.archived = { $ne: true };
    } else if (status === 'archived') {
      filter.archived = true;
    } else {
      filter.archived = { $ne: true };
    }
    if (category) filter.category = category;
    if (provider) filter.provider = provider;

    if (search) {
      const s = searchRegex(search);
      filter.$or = [{ name: s }, { provider: s }, { brand: s }, { category: s }, { slug: s }];
    }

    const sortOption = sort === 'displayOrder' ? { displayOrder: 1, createdAt: -1 } : { createdAt: -1 };
    const rawProducts = await Product.find(filter).sort(sortOption).lean();
    const stockByProduct = await aggregateVoucherStatsByProduct(rawProducts.map((p) => p._id));

    const products = rawProducts.map((p) => {
      const stock = getVoucherStats(stockByProduct, p._id);
      const { available, reserved, sold, total } = stock;
      const threshold = p.lowStockThreshold || 10;
      const isUnlimited = p.stockType === 'UNLIMITED';

      let stockStatus;
      let inStock;
      if (p.comingSoon) {
        stockStatus = 'COMING SOON';
        inStock = false;
      } else if (isUnlimited) {
        stockStatus = 'IN STOCK';
        inStock = true;
      } else {
        stockStatus = available > threshold ? 'IN STOCK' : available > 0 ? 'LOW STOCK' : 'OUT OF STOCK';
        inStock = available > 0;
      }

      return {
        ...p,
        availableVouchers: isUnlimited ? null : available,
        reservedVouchers: reserved,
        soldVouchers: sold,
        totalVouchers: total,
        stockStatus,
        inStock,
      };
    });

    let filtered = products;
    if (status === 'out_of_stock') {
      filtered = products.filter((p) => p.availableVouchers === 0);
    } else if (status === 'low_stock') {
      filtered = products.filter((p) => p.availableVouchers > 0 && p.availableVouchers <= (p.lowStockThreshold || 10));
    }

    const allProducts = await Product.find().select('_id active archived featured lowStockThreshold stockType').lean();
    const allStockByProduct = await aggregateVoucherStatsByProduct(allProducts.map((p) => p._id));
    let totalCount = allProducts.length;
    let activeCount = 0;
    let inactiveCount = 0;
    let archivedCount = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let featuredCount = 0;

    for (const p of allProducts) {
      if (p.archived) archivedCount++;
      if (p.active) activeCount++;
      else inactiveCount++;
      if (p.featured) featuredCount++;
      if (p.stockType === 'UNLIMITED') continue;
      const avail = getVoucherStats(allStockByProduct, p._id).available;
      if (avail === 0) outOfStockCount++;
      else if (avail <= (p.lowStockThreshold || 10)) lowStockCount++;
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const totalFiltered = filtered.length;
    const pages = Math.max(1, Math.ceil(totalFiltered / l));
    const paginated = filtered.slice((p - 1) * l, (p - 1) * l + l);

    res.json({
      success: true,
      count: paginated.length,
      total: totalFiltered,
      page: p,
      pages,
      kpis: {
        totalProducts: totalCount,
        activeProducts: activeCount,
        inactiveProducts: inactiveCount,
        archivedProducts: archivedCount,
        outOfStockProducts: outOfStockCount,
        lowStockProducts: lowStockCount,
        featuredProducts: featuredCount,
      },
      data: paginated,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = isValidObjectId(id)
      ? await Product.findById(id).lean()
      : await Product.findOne({ slug: String(id).toLowerCase() }).lean();
    if (!product) return next(new AppError('Product not found', 404));

    const stockByProduct = await aggregateVoucherStatsByProduct([product._id]);
    const { available, reserved, sold, total } = getVoucherStats(stockByProduct, product._id);

    res.json({
      success: true,
      data: {
        ...product,
        availableVouchers: available,
        reservedVouchers: reserved,
        soldVouchers: sold,
        totalVouchers: total,
        stockStatus: available > (product.lowStockThreshold || 10) ? 'IN STOCK' : available > 0 ? 'LOW STOCK' : 'OUT OF STOCK',
        inStock: available > 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const { originalPrice, sellingPrice, name, provider, brand } = req.body;
    if (sellingPrice != null && originalPrice != null && Number(sellingPrice) > Number(originalPrice)) {
      return next(new AppError('Selling price cannot be greater than original price', 400));
    }
    const payload = {
      ...normalizeProductPayload(req.body),
      provider: provider || brand || 'Pearson',
      brand: brand || provider || 'Pearson PTE',
    };
    const product = new Product(payload);
    await product.save();

    await recordAudit(req, 'PRODUCT_CREATED', 'Product', product._id, {
      name: product.name,
      sellingPrice: product.sellingPrice,
      originalPrice: product.originalPrice,
    });

    res.status(201).json({ success: true, data: product, warnings: collectRedemptionWarnings(product) });
  } catch (err) {
    next(err);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const oldProduct = await Product.findById(id).lean();
    if (!oldProduct) return next(new AppError('Product not found', 404));

    const origPrice = req.body.originalPrice !== undefined ? Number(req.body.originalPrice) : oldProduct.originalPrice;
    const sellPrice = req.body.sellingPrice !== undefined ? Number(req.body.sellingPrice) : oldProduct.sellingPrice;

    if (sellPrice > origPrice) {
      return next(new AppError('Selling price cannot exceed original price', 400));
    }

    const updatePayload = normalizeProductPayload(req.body, { selfId: id });
    // Derived/computed fields are owned by the server, never the client: the
    // edit form round-trips stale list-row snapshots, and findByIdAndUpdate
    // (unlike save()) skips the pre-save hook that recomputes them. Writing a
    // client snapshot would persist a stale discount/stock view of the product.
    delete updatePayload.inStock;
    delete updatePayload.discountPercent;
    delete updatePayload.availableVouchers;
    delete updatePayload.reservedVouchers;
    delete updatePayload.soldVouchers;
    delete updatePayload.totalVouchers;
    delete updatePayload.stockStatus;
    // Recompute the discount from the effective prices, mirroring the pre-save hook.
    if (origPrice > 0 && sellPrice >= 0) {
      updatePayload.discountPercent = Math.max(0, Math.min(100, Math.round(((origPrice - sellPrice) / origPrice) * 100)));
    }
    const product = await Product.findByIdAndUpdate(id, updatePayload, { new: true, runValidators: true });

    // If the primary image was swapped for a different Cloudinary asset, clean up
    // the previous one (only when no other product still points at it).
    const oldImagePublicId = oldProduct.imagePublicId;
    if (
      oldImagePublicId &&
      isCloudinaryUrl(oldProduct.image || '') &&
      product.imagePublicId !== oldImagePublicId
    ) {
      await deleteProductImageIfUnused(oldImagePublicId, product._id);
    }

    // Guide screenshots that were removed / replaced during this edit:
    // best-effort delete from Cloudinary when nothing else references them.
    const screenshotIds = (steps) =>
      new Set((steps || []).map((s) => s?.screenshot?.publicId).filter(Boolean));
    const oldGuideScreens = new Set([
      ...screenshotIds(oldProduct.redemptionGuide?.steps),
      ...screenshotIds(oldProduct.purchaseGuide?.steps),
    ]);
    const newGuideScreens = new Set([
      ...screenshotIds(product.redemptionGuide?.steps),
      ...screenshotIds(product.purchaseGuide?.steps),
    ]);
    for (const pid of oldGuideScreens) {
      if (!newGuideScreens.has(pid)) await deleteGuideScreenshotIfUnused(pid, product._id);
    }

    const diffs = {};
    if (oldProduct.sellingPrice !== product.sellingPrice) {
      diffs.oldPrice = oldProduct.sellingPrice;
      diffs.newPrice = product.sellingPrice;
    }
    if (oldProduct.active !== product.active) {
      diffs.oldActive = oldProduct.active;
      diffs.newActive = product.active;
    }

    await recordAudit(req, 'PRODUCT_UPDATED', 'Product', product._id, {
      name: product.name,
      diffs,
    });

    res.json({ success: true, data: product, warnings: collectRedemptionWarnings(product) });
  } catch (err) {
    next(err);
  }
};

export const quickUpdatePrice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sellingPrice, originalPrice } = req.body;
    const product = await Product.findById(id);
    if (!product) return next(new AppError('Product not found', 404));

    const orig = originalPrice != null ? Number(originalPrice) : product.originalPrice;
    const sell = sellingPrice != null ? Number(sellingPrice) : product.sellingPrice;

    if (sell < 0 || orig < 0) {
      return next(new AppError('Prices must be non-negative', 400));
    }
    if (sell > orig) {
      return next(new AppError('Selling price cannot exceed original price', 400));
    }

    const oldPrice = product.sellingPrice;
    product.originalPrice = orig;
    product.sellingPrice = sell;
    await product.save();

    await recordAudit(req, 'PRICE_UPDATED', 'Product', product._id, {
      name: product.name,
      oldPrice,
      newPrice: sell,
      originalPrice: orig,
    });

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const quickUpdateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    const product = await Product.findByIdAndUpdate(id, { active: !!active }, { new: true });
    if (!product) return next(new AppError('Product not found', 404));

    await recordAudit(req, 'PRODUCT_STATUS_CHANGED', 'Product', product._id, {
      name: product.name,
      active: product.active,
    });

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const quickUpdateFeatured = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;
    const product = await Product.findByIdAndUpdate(id, { featured: !!featured }, { new: true });
    if (!product) return next(new AppError('Product not found', 404));

    await recordAudit(req, 'PRODUCT_FEATURED_CHANGED', 'Product', product._id, {
      name: product.name,
      featured: product.featured,
    });

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return next(new AppError('Product not found', 404));

    const [hasOrders, hasVouchers] = await Promise.all([
      Order.exists({ 'items.productId': id }),
      VoucherCode.exists({ productId: id }),
    ]);

    if (hasOrders || hasVouchers) {
      product.active = false;
      product.archived = true;
      await product.save();

      await recordAudit(req, 'PRODUCT_DEACTIVATED', 'Product', product._id, {
        name: product.name,
        reason: 'Preserved order/voucher historical records',
      });

      return res.json({
        success: true,
        deactivated: true,
        deleted: false,
        message: 'Product has historical orders/vouchers. Archived to preserve historical purchase data.',
        data: product,
      });
    }

    await Product.findByIdAndDelete(id);

    await recordAudit(req, 'PRODUCT_DELETED', 'Product', id, { name: product.name });

    res.json({ success: true, deleted: true, message: 'Product permanently deleted.' });
  } catch (err) {
    next(err);
  }
};

export const duplicateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const source = await Product.findById(id).lean();
    if (!source) return next(new AppError('Product not found', 404));

    const clone = { ...source };
    delete clone._id;
    delete clone.createdAt;
    delete clone.updatedAt;
    delete clone.__v;
    clone.name = `${source.name} (Copy)`;
    clone.slug = `${source.slug || 'product'}-copy-${Date.now().toString(36)}`;
    clone.active = false;
    clone.featured = false;
    clone.archived = false;
    if (clone.seo) clone.seo = { ...clone.seo, slug: clone.slug };

    const duplicate = new Product(clone);
    await duplicate.save();

    await recordAudit(req, 'PRODUCT_DUPLICATED', 'Product', duplicate._id, {
      name: duplicate.name,
      sourceProductId: id,
    });

    res.status(201).json({ success: true, data: duplicate });
  } catch (err) {
    next(err);
  }
};

export const archiveProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { archived: true, active: false },
      { new: true }
    );
    if (!product) return next(new AppError('Product not found', 404));

    await recordAudit(req, 'PRODUCT_ARCHIVED', 'Product', product._id, { name: product.name });

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const restoreProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { archived: false, active: true },
      { new: true }
    );
    if (!product) return next(new AppError('Product not found', 404));

    await recordAudit(req, 'PRODUCT_RESTORED', 'Product', product._id, { name: product.name });

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const uploadProductLogo = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return next(new AppError('No logo file uploaded', 400));

    let url = '';
    try {
      const buffer = fs.readFileSync(file.path);
      const cloudRes = await uploadBufferToCloudinary(buffer, {
        resource_type: 'image',
        folder: 'apex_products/logos',
      });
      if (cloudRes && cloudRes.secure_url) {
        url = buildOptimizedImageUrl(cloudRes.secure_url);
        try { fs.unlinkSync(file.path); } catch {}
      }
    } catch (cloudErr) {
      console.warn('[Upload] Product logo Cloudinary fallback to local storage:', cloudErr.message);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      url = `${baseUrl}/uploads/product-logos/${file.filename}`;
    }

    if (!url) return next(new AppError('Logo upload failed', 500));

    res.json({ success: true, url });
  } catch (err) {
    next(err);
  }
};

/**
 * Upload a product's primary image straight to Cloudinary (apex_products/images).
 * Unlike the logo endpoint there is no local-disk fallback — the primary image
 * must be an authoritative CDN asset, so a Cloudinary failure returns 502 and the
 * admin keeps the previous image.
 */
export const uploadProductImage = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) return next(new AppError('No image file uploaded', 400));

    let result;
    try {
      result = await uploadImage(file.buffer, { folder: 'apex_products/images' });
    } catch (cloudErr) {
      console.error('[Upload] Product image Cloudinary upload failed:', cloudErr.message);
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

/**
 * Best-effort delete a product image from Cloudinary, but only when no other
 * product still references the same public_id. Never throws.
 */
const deleteProductImageIfUnused = async (publicId, exceptProductId) => {
  try {
    if (!publicId) return;
    const stillUsed = await Product.exists({
      _id: { $ne: exceptProductId },
      imagePublicId: publicId,
    });
    if (stillUsed) return;
    await deleteCloudinaryAsset(publicId, 'image');
  } catch (err) {
    console.warn(`[Cloudinary] Product image cleanup skipped for ${publicId}:`, err.message);
  }
};

/**
 * Upload a single guide-step screenshot (Purchase or Redemption guide) to
 * Cloudinary (apex_products/guides). Same 502-on-failure contract as
 * uploadProductImage — the admin keeps the previous screenshot rather than
 * persisting a broken ref.
 */
export const uploadProductScreenshot = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) return next(new AppError('No screenshot file uploaded', 400));

    let result;
    try {
      result = await uploadImage(file.buffer, { folder: 'apex_products/guides' });
    } catch (cloudErr) {
      console.error('[Upload] Product screenshot Cloudinary upload failed:', cloudErr.message);
      return next(new AppError('Screenshot upload to Cloudinary failed. Please try again.', 502));
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

/**
 * Best-effort delete a guide screenshot from Cloudinary, but only when no
 * other product's purchase/redemption step references the same public_id and
 * it is not in use as any product's primary image. Never throws.
 */
const deleteGuideScreenshotIfUnused = async (publicId, exceptProductId) => {
  try {
    if (!publicId) return;
    const [usedInRedemption, usedInPurchase, usedAsImage] = await Promise.all([
      Product.exists({
        _id: { $ne: exceptProductId },
        'redemptionGuide.steps.screenshot.publicId': publicId,
      }),
      Product.exists({
        _id: { $ne: exceptProductId },
        'purchaseGuide.steps.screenshot.publicId': publicId,
      }),
      Product.exists({ imagePublicId: publicId }),
    ]);
    if (usedInRedemption || usedInPurchase || usedAsImage) return;
    await deleteCloudinaryAsset(publicId, 'image');
  } catch (err) {
    console.warn(`[Cloudinary] Guide screenshot cleanup skipped for ${publicId}:`, err.message);
  }
};

export const reorderProducts = async (req, res, next) => {
  try {
    const { items } = req.body; // Array of { id, order }
    if (!Array.isArray(items)) {
      return next(new AppError('Items array is required for bulk reordering', 400));
    }

    const updates = items.map((item, index) => {
      const orderNum = Number(item.order) || index + 1;
      return Product.findByIdAndUpdate(item.id || item._id, { displayOrder: orderNum });
    });
    await Promise.all(updates);

    await recordAudit(req, 'PRODUCTS_REORDERED', 'Product', null, { count: items.length });

    res.json({ success: true, message: 'Product order updated successfully.' });
  } catch (err) {
    next(err);
  }
};

export const getProductInventory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).lean();
    if (!product) return next(new AppError('Product not found', 404));

    const stockByProduct = await aggregateVoucherStatsByProduct([product._id]);
    const { available, reserved, sold, assigned, used, expired, total } =
      getVoucherStats(stockByProduct, product._id);

    const recentCodes = await VoucherCode.find({ productId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Masked like every other admin inventory surface — raw codes only leave
    // the server through the audited /vouchers/:id/reveal endpoint.
    const maskedCodes = recentCodes.map((v) => ({
      _id: v._id,
      codeDisplay: maskVoucherCode(v.code),
      isMasked: true,
      status: v.status,
      soldTo: v.soldTo || null,
      soldAt: v.soldAt || null,
      expiryDate: v.expiryDate || null,
      createdAt: v.createdAt,
    }));

    res.json({
      success: true,
      data: {
        product: { id: product._id, name: product.name, brand: product.brand },
        counts: { available, reserved, sold, assigned, used, expired, total },
        codes: maskedCodes,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listVouchers = async (req, res, next) => {
  try {
    const { status, productId, voucherType, search, unmasked, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (productId) filter.productId = productId;
    if (voucherType) filter.voucherType = voucherType.toUpperCase();
    if (search) {
      const s = searchRegex(search);
      filter.$or = [{ code: s }, { soldTo: s }];
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (p - 1) * l;

    const [vouchers, total] = await Promise.all([
      VoucherCode.find(filter)
        .populate('productId', 'name brand provider voucherType')
        .populate('userId', 'name email')
        .populate('orderId', 'orderNo total orderStatus')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .lean(),
      VoucherCode.countDocuments(filter),
    ]);

    // Mask voucher codes by default unless unmasked=true is explicitly requested.
    // The raw `code` is REMOVED from the payload when masked — previously it was
    // spread into the response alongside `codeDisplay`, so every full code was
    // sitting in the JSON and the audited /reveal endpoint could be bypassed by
    // just reading the list response.
    const isMasked = unmasked !== 'true';
    if (!isMasked) {
      // Bulk reveal is as sensitive as the per-code /reveal endpoint, so it
      // leaves the same audit trail rather than being a silent bypass.
      await recordAudit(req, 'VOUCHER_LIST_UNMASKED', 'VoucherCode', null, {
        count: vouchers.length,
        filter: { status: status || null, productId: productId || null, voucherType: voucherType || null },
      });
    }
    const processedVouchers = vouchers.map((v) => {
      if (!isMasked) return { ...v, codeDisplay: v.code, isMasked: false };

      const { code, ...rest } = v;
      return { ...rest, codeDisplay: maskVoucherCode(code), isMasked: true };
    });

    res.json({
      success: true,
      count: processedVouchers.length,
      total,
      page: p,
      pages: Math.ceil(total / l),
      data: processedVouchers,
    });
  } catch (err) {
    next(err);
  }
};

export const getVoucherInventoryByProduct = async (req, res, next) => {
  try {
    const products = await Product.find({}).sort({ displayOrder: 1, name: 1 }).lean();
    const productIds = products.map((p) => p._id);
    const stockStats = await aggregateVoucherStatsByProduct(productIds);

    const summary = products.map((p) => {
      const stats = getVoucherStats(stockStats, p._id);
      const isLowStock = stats.available <= (p.lowStockThreshold || 10) && stats.available > 0;
      const isOutOfStock = stats.available === 0;
      return {
        product: {
          _id: p._id,
          name: p.name,
          brand: p.brand,
          provider: p.provider,
          voucherType: p.voucherType || normalizeVoucherType(p.voucherType, p),
          sellingPrice: p.sellingPrice,
          originalPrice: p.originalPrice,
          active: p.active,
          lowStockThreshold: p.lowStockThreshold || 10,
        },
        counts: stats,
        isLowStock,
        isOutOfStock,
      };
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

export const getVoucherCodeUnmasked = async (req, res, next) => {
  try {
    const { id } = req.params;
    const voucher = await VoucherCode.findById(id).populate('productId', 'name brand voucherType').lean();
    if (!voucher) return next(new AppError('Voucher not found', 404));

    await recordAudit(req, 'VOUCHER_VIEW_CODE', 'VoucherCode', voucher._id, {
      codeMasked: `${voucher.code.slice(0, 4)}-****-${voucher.code.slice(-4)}`,
      productId: voucher.productId?._id || voucher.productId,
      productName: voucher.productId?.name || '',
      voucherType: voucher.voucherType,
    });

    res.json({
      success: true,
      data: {
        _id: voucher._id,
        code: voucher.code,
        voucherType: voucher.voucherType,
        status: voucher.status,
        expiryDate: voucher.expiryDate,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminNotifications = async (req, res, next) => {
  try {
    // 1. Recently Sold Vouchers (Last 20)
    const recentlySold = await VoucherCode.find({ status: { $in: ['SOLD', 'ASSIGNED'] } })
      .populate('productId', 'name brand voucherType')
      .populate('orderId', 'orderNo total')
      .populate('userId', 'name email')
      .sort({ updatedAt: -1, assignedAt: -1, soldAt: -1 })
      .limit(15)
      .lean();

    // 2. Mismatch Alerts / Failures from AuditLog
    const mismatchLogs = await AuditLog.find({
      action: { $in: ['VOUCHER_MISMATCH_BLOCKED', 'ORDER_ALLOCATION_FAILED', 'PAID_ORDER_NOT_COLLECTABLE'] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 2b. Open voucher requests (customer asked for an out-of-stock voucher)
    const openVoucherRequests = await VoucherRequest.find({ status: { $in: ['PENDING', 'PROCESSING'] } })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    // 2c. Paid orders awaiting a manually sourced code. These are the most
    // urgent items in the console — the customer's money is already taken — but
    // they previously only reached the admin by email.
    const pendingFulfillments = await FulfillmentRequest.find({ status: 'PROCESSING' })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean();

    // 3. Low stock and out-of-stock products
    const products = await Product.find({ active: true }).lean();
    const productIds = products.map((p) => p._id);
    const stockStats = await aggregateVoucherStatsByProduct(productIds);

    const stockAlerts = [];
    for (const p of products) {
      const stats = getVoucherStats(stockStats, p._id);
      const threshold = p.lowStockThreshold || 10;
      if (stats.available === 0) {
        stockAlerts.push({
          id: `oos_${p._id}`,
          type: 'OUT_OF_STOCK',
          severity: 'error',
          title: '🔴 Out of Stock Alert',
          message: `${p.name} is completely OUT OF STOCK!`,
          product: { _id: p._id, name: p.name, voucherType: p.voucherType },
          available: 0,
          timestamp: new Date(),
        });
      } else if (stats.available <= threshold) {
        stockAlerts.push({
          id: `low_${p._id}`,
          type: 'LOW_STOCK',
          severity: 'warning',
          title: '⚠️ Low Inventory Warning',
          message: `${p.name} has only ${stats.available} voucher(s) remaining (Threshold: ${threshold}).`,
          product: { _id: p._id, name: p.name, voucherType: p.voucherType },
          available: stats.available,
          timestamp: new Date(),
        });
      }
    }

    const notifications = [
      ...mismatchLogs.map((log) => {
        if (log.action === 'PAID_ORDER_NOT_COLLECTABLE') {
          return {
            id: log._id,
            type: 'PAID_ORDER_NOT_COLLECTABLE',
            severity: 'critical',
            title: '🚨 Paid order not fulfilled',
            message: `Order #${log.details?.orderNo}: a captured Razorpay payment exists but the order is ${log.details?.orderPaymentStatus}/${log.details?.orderStatus}. Refund the customer or re-open + fulfil.`,
            timestamp: log.createdAt,
            details: log.details,
          };
        }
        if (log.action === 'ORDER_ALLOCATION_FAILED') {
          return {
            id: log._id,
            type: 'ALLOCATION_FAILED',
            severity: 'error',
            title: '⚠️ Voucher allocation failed',
            message: `Order #${log.details?.orderNo || 'Unknown'}: ${log.details?.error || 'no available voucher'}. Payment is held — add stock, then re-fulfil.`,
            timestamp: log.createdAt,
            details: log.details,
          };
        }
        return {
          id: log._id,
          type: 'MISMATCH_BLOCKED',
          severity: 'critical',
          title: '🚨 Voucher Product Mismatch Blocked',
          message: `Order #${log.details?.orderNo || 'Unknown'}: Expected ${log.details?.expectedVoucherType || 'N/A'}, Received ${log.details?.actualVoucherType || 'N/A'}. Delivery blocked.`,
          timestamp: log.createdAt,
          details: log.details,
        };
      }),
      ...pendingFulfillments.map((r) => ({
        id: `fr_${r._id}`,
        type: 'FULFILLMENT_REQUEST',
        severity: 'critical',
        title: '💳 Paid — voucher needed',
        message: `${r.customerName} paid ${r.currency === 'USD' ? '$' : '₹'}${r.amountPaid} for ${r.productName} (Order #${r.orderNo}). Assign a code to complete delivery.`,
        tab: 'fulfillments',
        product: { _id: r.productId, name: r.productName, voucherType: r.voucherType },
        timestamp: r.createdAt,
        data: {
          requestId: r.requestId,
          fulfillmentId: String(r._id),
          orderNo: r.orderNo,
          productName: r.productName,
          voucherType: r.voucherType,
          customerEmail: r.customerEmail,
          amountPaid: r.amountPaid,
          currency: r.currency,
          status: r.status,
        },
      })),
      ...stockAlerts,
      ...openVoucherRequests.map((r) => ({
        id: `vr_${r._id}`,
        type: 'VOUCHER_REQUEST',
        severity: 'warning',
        title: '🎟️ Voucher Request',
        message: `${r.customerName} requested ${r.productName} (${r.voucherType}) — currently out of stock. Source a code and mark it ready for payment.`,
        product: { _id: r.productId, name: r.productName, voucherType: r.voucherType },
        timestamp: r.createdAt,
        data: {
          requestId: r.requestId,
          productName: r.productName,
          voucherType: r.voucherType,
          customerEmail: r.customerEmail,
          status: r.status,
        },
      })),
      ...recentlySold.map((v) => ({
        id: v._id,
        type: 'VOUCHER_SOLD',
        severity: 'success',
        title: '🔔 Voucher Sold',
        message: `${v.productId?.name || 'Voucher'} (${v.voucherType || 'EXAM'}) sold for Order #${v.orderId?.orderNo || 'Direct'}`,
        timestamp: v.soldAt || v.assignedAt || v.updatedAt,
        data: {
          codeMasked: `${v.code.slice(0, 4)}-****-${v.code.slice(-4)}`,
          productName: v.productId?.name,
          voucherType: v.voucherType,
          orderNo: v.orderId?.orderNo,
          customerEmail: v.soldTo || v.userId?.email || 'Customer',
          soldAt: v.soldAt || v.assignedAt || v.updatedAt,
          status: v.status,
        },
      })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: notifications,
      counts: {
        total: notifications.length,
        critical: notifications.filter((n) => n.severity === 'critical' || n.severity === 'error').length,
        sales: recentlySold.length,
        stockAlerts: stockAlerts.length,
        voucherRequests: openVoucherRequests.length,
        pendingFulfillments: pendingFulfillments.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const addVouchers = async (req, res, next) => {
  try {
    const { productId, codes, expiryDate } = req.body || {};
    if (!productId || !Array.isArray(codes) || codes.length === 0 || !expiryDate) {
      return next(new AppError('productId, codes[], and expiryDate required', 400));
    }
    const product = await Product.findById(productId).lean();
    if (!product) {
      return next(new AppError('Product not found', 404));
    }
    const voucherType = normalizeVoucherType(product.voucherType, product);

    const docs = codes
      .filter((c) => typeof c === 'string' && c.trim().length > 0)
      .map((c) => ({
        code: c.trim().toUpperCase(),
        productId: product._id,
        voucherType,
        status: 'AVAILABLE',
        expiryDate: new Date(expiryDate),
      }));

    const inserted = await VoucherCode.insertMany(docs, { ordered: false }).catch((err) => {
      return err.insertedDocs || [];
    });

    await recordAudit(req, 'VOUCHERS_ADDED', 'VoucherCode', productId, {
      countAdded: inserted.length || 0,
      voucherType,
      productName: product.name,
      expiryDate,
    });

    res.status(201).json({
      success: true,
      added: inserted.length || 0,
      product: { _id: product._id, name: product.name, voucherType },
    });
  } catch (err) {
    next(err);
  }
};

/* ── Voucher inventory writes ────────────────────────────────────────────────
 * All of these delegate to services/voucherInventory.js, which owns the rules
 * about what may be deleted or re-statused. The controller only unpacks the
 * request and shapes the response.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Admin identity for the service's audit trail (includes the request IP). */
const auditActor = (req) => ({ _id: req.user?._id, email: req.user?.email, ip: req.ip || null });

export const updateVoucher = async (req, res, next) => {
  try {
    const voucher = await updateVoucherFields({ id: req.params.id, patch: req.body || {}, admin: auditActor(req) });
    res.json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/admin/vouchers/:id — remove a single inventory row. */
export const deleteVoucher = async (req, res, next) => {
  try {
    const result = await deleteVouchers({ ids: [req.params.id], admin: auditActor(req) });
    if (result.deleted === 0) {
      return next(
        new AppError(
          result.skipped[0]?.reason || 'This voucher could not be deleted',
          409,
          'VOUCHER_NOT_DELETABLE'
        )
      );
    }
    res.json({ success: true, message: 'Voucher deleted', ...result });
  } catch (err) {
    next(err);
  }
};

/** POST /api/admin/vouchers/bulk-delete — remove many; delivered codes are kept. */
export const bulkDeleteVouchers = async (req, res, next) => {
  try {
    const result = await deleteVouchers({ ids: req.body?.ids, admin: auditActor(req) });
    res.json({
      success: true,
      message: `${result.deleted} voucher${result.deleted === 1 ? '' : 's'} deleted`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/admin/vouchers/delete-preview — what a delete would actually do. */
export const previewVoucherDelete = async (req, res, next) => {
  try {
    const result = await previewVoucherDeletion(req.body?.ids);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/admin/vouchers/status — mark codes EXPIRED / INVALID / CANCELLED / AVAILABLE. */
export const bulkSetVoucherStatus = async (req, res, next) => {
  try {
    const result = await setVoucherStatuses({
      ids: req.body?.ids,
      status: req.body?.status,
      admin: auditActor(req),
    });
    res.json({
      success: true,
      message: `${result.modified} voucher${result.modified === 1 ? '' : 's'} marked ${result.status}`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const listOrdersAdmin = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (status) filter.orderStatus = status;
    if (search) {
      const s = searchRegex(search);
      filter.$or = [{ orderNo: s }];
    }
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (p - 1) * l;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, count: orders.length, total, page: p, pages: Math.ceil(total / l), data: orders });
  } catch (err) {
    next(err);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    // Enum whitelist (matches the Order model) so a typo'd payload is a 400,
    // not a Mongoose ValidationError 500.
    if (orderStatus && !ORDER_STATUSES.includes(orderStatus)) {
      return next(new AppError(`Invalid orderStatus "${orderStatus}"`, 400, 'INVALID_ORDER_STATUS'));
    }
    if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
      return next(new AppError(`Invalid paymentStatus "${paymentStatus}"`, 400, 'INVALID_PAYMENT_STATUS'));
    }

    const order = await Order.findById(id);
    if (!order) return next(new AppError('Order not found', 404));

    // FULFILLED means voucher codes were delivered. Never let the panel mark an
    // unverified or code-less order fulfilled — that state strands the customer
    // (no codes, resend-email refuses) and fakes success. Paid orders without
    // inventory must be fulfilled through the Fulfillment Requests queue, which
    // allocates a code and emails it.
    if (orderStatus === 'FULFILLED') {
      if (order.paymentStatus !== 'PAID' && paymentStatus !== 'PAID') {
        return next(new AppError(
          'Cannot fulfil an order whose payment is not verified. Verify the payment first, or fulfil it from the Fulfillment Requests queue.',
          409,
          'PAYMENT_NOT_VERIFIED'
        ));
      }
      const hasAllocated = await VoucherCode.exists({
        orderId: order._id,
        status: { $in: ['SOLD', 'ASSIGNED', 'USED'] },
      });
      if (!hasAllocated) {
        return next(new AppError(
          'This order has no allocated voucher codes. Fulfil it from the Fulfillment Requests queue so a code is assigned and emailed.',
          409,
          'NO_ALLOCATED_CODES'
        ));
      }
    }

    // A paid order cannot silently vanish: cancelling it must go through the
    // refund path (which records REFUNDED and preserves the money trail).
    if (orderStatus === 'CANCELLED' && order.paymentStatus === 'PAID' && paymentStatus !== 'REFUNDED') {
      return next(new AppError(
        'A paid order cannot be cancelled. Record a refund instead (Refund action).',
        409,
        'PAID_ORDER_CANCEL_BLOCKED'
      ));
    }

    const oldStatus = order.orderStatus;
    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    await order.save();

    await recordAudit(req, 'ORDER_STATUS_CHANGED', 'Order', order._id, {
      orderNo: order.orderNo,
      oldStatus,
      newOrderStatus: order.orderStatus,
      newPaymentStatus: order.paymentStatus,
    });

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

export const listPromotions = async (_req, res, next) => {
  try {
    const promos = await Promotion.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: promos.length, data: promos });
  } catch (err) {
    next(err);
  }
};

export const createPromotion = async (req, res, next) => {
  try {
    const { startAt, endAt } = req.body || {};
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      return next(new AppError('Promotion end date must be after the start date', 400, 'INVALID_DATE_RANGE'));
    }
    const promo = new Promotion(req.body);
    await promo.save();

    await recordAudit(req, 'PROMOTION_CREATED', 'Promotion', promo._id, {
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    });

    res.status(201).json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
};

export const updatePromotion = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Validate the merged date range, not just the posted fields — a PATCH that
    // moves only one boundary can silently invert the window and kill the code.
    const current = await Promotion.findById(id).lean();
    if (!current) return next(new AppError('Promotion not found', 404));
    const startAt = req.body?.startAt ?? current.startAt;
    const endAt = req.body?.endAt ?? current.endAt;
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      return next(new AppError('Promotion end date must be after the start date', 400, 'INVALID_DATE_RANGE'));
    }
    // The 0–100 schema validator cannot bind discountType during update
    // validators, so a PATCH sending only discountValue would bypass it.
    // Validate the merged (posted-or-current) pair here.
    const effType = req.body?.discountType ?? current.discountType;
    const effValue = req.body?.discountValue ?? current.discountValue;
    if (effType === 'percentage' && (Number(effValue) < 0 || Number(effValue) > 100)) {
      return next(new AppError('Percentage discount must be between 0 and 100', 400, 'INVALID_DISCOUNT_VALUE'));
    }
    const promo = await Promotion.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!promo) return next(new AppError('Promotion not found', 404));

    await recordAudit(req, 'PROMOTION_UPDATED', 'Promotion', promo._id, {
      code: promo.code,
      active: promo.active,
    });

    res.json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
};

export const deletePromotion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const promo = await Promotion.findByIdAndDelete(id);
    if (!promo) return next(new AppError('Promotion not found', 404));

    await recordAudit(req, 'PROMOTION_DELETED', 'Promotion', id, { code: promo.code });

    res.json({ success: true, deleted: true });
  } catch (err) {
    next(err);
  }
};

export const listAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action, resourceType } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (resourceType) filter.resourceType = resourceType;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (p - 1) * l;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, count: logs.length, total, page: p, pages: Math.ceil(total / l), data: logs });
  } catch (err) {
    next(err);
  }
};

export const exportCSV = async (req, res, next) => {
  try {
    const { resource } = req.params;
    const { unmasked = false } = req.query;

    let csvContent = '';
    let filename = `apex_${resource}_export.csv`;

    if (resource === 'orders') {
      const orders = await Order.find().populate('userId', 'name email').sort({ createdAt: -1 }).lean();
      const headers = ['Order No', 'Customer Name', 'Customer Email', 'Subtotal', 'Discount', 'Total', 'Payment Status', 'Order Status', 'Created At'];
      const rows = orders.map((o) => [
        o.orderNo,
        `"${o.userId?.name || 'Guest'}"`,
        `"${o.userId?.email || o.customerSnapshot?.email || ''}"`,
        o.subtotal,
        o.discountAmount,
        o.total,
        o.paymentStatus,
        o.orderStatus,
        new Date(o.createdAt).toISOString(),
      ]);
      csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else if (resource === 'customers') {
      const users = await User.find({ role: 'user' }).sort({ createdAt: -1 }).lean();
      const headers = ['User ID', 'Name', 'Email', 'Phone', 'Status', 'Created At'];
      const rows = users.map((u) => [
        u._id,
        `"${u.name}"`,
        `"${u.email}"`,
        `"${u.phone || ''}"`,
        u.status,
        new Date(u.createdAt).toISOString(),
      ]);
      csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else if (resource === 'vouchers') {
      const vouchers = await VoucherCode.find().populate('productId', 'name').populate('userId', 'email').sort({ createdAt: -1 }).lean();
      const headers = ['Voucher Code', 'Product Name', 'Status', 'Assigned Email', 'Expiry Date', 'Assigned At'];
      const rows = vouchers.map((v) => {
        let codeDisplay = v.code;
        if (!unmasked || unmasked !== 'true') {
          codeDisplay = `${v.code.slice(0, 4)}-XXXX-XXXX-XXXX`;
        }
        return [
          codeDisplay,
          `"${v.productId?.name || ''}"`,
          v.status,
          `"${v.userId?.email || ''}"`,
          new Date(v.expiryDate).toISOString().slice(0, 10),
          v.assignedAt ? new Date(v.assignedAt).toISOString() : '',
        ];
      });
      csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else if (resource === 'sales') {
      const sales = await Order.aggregate([
        { $match: { orderStatus: { $in: ['PAID', 'FULFILLED', 'REFUNDED'] } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            grossSales: { $sum: '$subtotal' },
            discounts: { $sum: '$discountAmount' },
            netTotal: { $sum: '$total' },
            ordersCount: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
      ]);
      const headers = ['Date', 'Orders Count', 'Gross Subtotal', 'Total Discounts', 'Net Revenue'];
      const rows = sales.map((s) => [s._id, s.ordersCount, s.grossSales, s.discounts, s.netTotal]);
      csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else if (resource === 'pte-bookings') {
      const { status, examType, search, dateFrom, dateTo } = req.query;
      const filter = {};
      if (status && status !== 'All') filter.status = status;
      if (examType && examType !== 'All') filter.examType = examType;
      if (search) {
        const s = searchRegex(search);
        filter.$or = [{ fullName: s }, { email: s }, { phone: s }, { requestId: s }, { preferredCity: s }];
      }
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }
      const bookings = await PTEBookingRequest.find(filter).sort({ createdAt: -1 }).lean();
      const headers = [
        'Request ID',
        'Customer Name',
        'Email',
        'Phone',
        'Exam Type',
        'City',
        'Test Centre',
        'Preferred Date',
        'Preferred Time',
        'Status',
        'Admin Notes',
        'Confirmed Booking Ref',
        'Confirmed Centre',
        'Confirmed Date',
        'Confirmed Time',
        'Created At'
      ];
      const rows = bookings.map((b) => [
        b.requestId,
        `"${(b.fullName || '').replace(/"/g, '""')}"`,
        `"${(b.email || '').replace(/"/g, '""')}"`,
        `"${(b.phone || '').replace(/"/g, '""')}"`,
        `"${(b.examType || '').replace(/"/g, '""')}"`,
        `"${(b.preferredCity || '').replace(/"/g, '""')}"`,
        `"${(b.preferredTestCentre || '').replace(/"/g, '""')}"`,
        b.preferredDate ? new Date(b.preferredDate).toISOString().slice(0, 10) : '',
        `"${(b.preferredTime || 'Any Time').replace(/"/g, '""')}"`,
        b.status,
        `"${(b.adminNotes || '').replace(/"/g, '""')}"`,
        `"${(b.confirmationDetails?.bookingReference || '').replace(/"/g, '""')}"`,
        `"${(b.confirmationDetails?.confirmedCentre || '').replace(/"/g, '""')}"`,
        b.confirmationDetails?.confirmedDate ? new Date(b.confirmationDetails.confirmedDate).toISOString().slice(0, 10) : '',
        `"${(b.confirmationDetails?.confirmedTime || '').replace(/"/g, '""')}"`,
        new Date(b.createdAt).toISOString(),
      ]);
      csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else if (resource === 'voucher-requests') {
      const { status, search, dateFrom, dateTo } = req.query;
      const filter = {};
      if (status && status !== 'All') filter.status = status;
      if (search) {
        const s = searchRegex(search);
        filter.$or = [{ requestId: s }, { customerName: s }, { customerEmail: s }, { productName: s }];
      }
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }
      const requests = await VoucherRequest.find(filter).sort({ createdAt: -1 }).lean();
      const headers = [
        'Request ID', 'Customer Name', 'Email', 'Voucher', 'Voucher Type', 'Category',
        'Status', 'Admin Notes', 'Order No', 'Requested At', 'Ready At', 'Fulfilled At',
      ];
      const rows = requests.map((r) => [
        r.requestId,
        `"${(r.customerName || '').replace(/"/g, '""')}"`,
        `"${(r.customerEmail || '').replace(/"/g, '""')}"`,
        `"${(r.productName || '').replace(/"/g, '""')}"`,
        `"${(r.voucherType || '').replace(/"/g, '""')}"`,
        `"${(r.category || '').replace(/"/g, '""')}"`,
        r.status,
        `"${(r.adminNotes || '').replace(/"/g, '""')}"`,
        r.orderId ? String(r.orderId) : '',
        new Date(r.createdAt).toISOString(),
        r.readyForPaymentAt ? new Date(r.readyForPaymentAt).toISOString() : '',
        r.fulfilledAt ? new Date(r.fulfilledAt).toISOString() : '',
      ]);
      csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else if (resource === 'fulfillments') {
      const { status, search, dateFrom, dateTo } = req.query;
      const filter = {};
      if (status && status !== 'All') filter.status = status;
      if (search) {
        const s = searchRegex(search);
        filter.$or = [
          { requestId: s },
          { orderNo: s },
          { customerName: s },
          { customerEmail: s },
          { productName: s },
          { voucherType: s },
          { voucherCode: s },
        ];
      }
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }
      const requests = await FulfillmentRequest.find(filter).sort({ createdAt: -1 }).lean();
      const headers = [
        'Request ID', 'Order No', 'Order ID', 'Customer Name', 'Customer Email',
        'Product', 'Voucher Type', 'Quantity', 'Amount Paid', 'Currency',
        'Payment ID', 'Status', 'Voucher Code', 'Email Status', 'Requested At', 'Delivered At',
      ];
      const rows = requests.map((r) => [
        r.requestId,
        `"${(r.orderNo || '').replace(/"/g, '""')}"`,
        r.orderId ? String(r.orderId) : '',
        `"${(r.customerName || '').replace(/"/g, '""')}"`,
        `"${(r.customerEmail || '').replace(/"/g, '""')}"`,
        `"${(r.productName || '').replace(/"/g, '""')}"`,
        `"${(r.voucherType || '').replace(/"/g, '""')}"`,
        r.quantity || 1,
        r.amountPaid ?? '',
        `"${(r.currency || 'INR').replace(/"/g, '""')}"`,
        `"${(r.razorpayPaymentId || '').replace(/"/g, '""')}"`,
        r.status,
        `"${(r.voucherCode || '').replace(/"/g, '""')}"`,
        `"${(r.emailStatus || '').replace(/"/g, '""')}"`,
        new Date(r.createdAt).toISOString(),
        r.deliveredAt ? new Date(r.deliveredAt).toISOString() : '',
      ]);
      csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else {
      return next(new AppError('Invalid export resource type', 400));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
 * VOUCHER REQUESTS (out-of-stock "Request Voucher" flow)
 * ══════════════════════════════════════════════════════════════════════════ */

export const listVoucherRequestsAdmin = async (req, res, next) => {
  try {
    const [{ rows, total, page, pages }, stats] = await Promise.all([
      listVoucherRequests(req.query),
      getVoucherRequestStats(),
    ]);
    res.json({ success: true, count: rows.length, total, page, pages, stats, data: rows });
  } catch (err) {
    next(err);
  }
};

export const getVoucherRequestAdmin = async (req, res, next) => {
  try {
    const request = await getVoucherRequestById(req.params.id);
    if (!request) return next(new AppError('Voucher request not found', 404, 'NOT_FOUND'));
    res.json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};

export const updateVoucherRequestAdmin = async (req, res, next) => {
  try {
    const { status, adminNotes } = req.body || {};
    if (status && !VOUCHER_REQUEST_STATUSES.includes(status)) {
      return next(new AppError('Invalid status value', 400, 'VALIDATION_ERROR'));
    }
    const { request, oldStatus } = await updateVoucherRequestService(req.params.id, {
      status,
      adminNotes,
      adminUser: req.user,
    });

    await recordAudit(req, 'VOUCHER_REQUEST_UPDATED', 'VoucherRequest', request._id, {
      requestId: request.requestId,
      oldStatus,
      newStatus: request.status,
      productName: request.productName,
    });

    res.json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};

export const seedAdmin = async () => {
  const { config } = await import('../config/index.js');

  try {
    const productsToFix = await Product.find({
      $or: [{ provider: { $exists: false } }, { provider: '' }, { provider: null }],
    });
    for (const p of productsToFix) {
      p.provider = p.brand || 'Duolingo';
      await p.save();
    }
  } catch (e) {
    // Ignore error if schema validation issue on old docs
  }

  const targetEmail = (config.admin.email || 'info@apexvouchers.com').toLowerCase().trim();

  let admin = await User.findOne({ email: targetEmail }).select('+passwordHash');
  if (!admin) {
    admin = await User.findOne({ role: 'admin' }).select('+passwordHash');
  }

  if (admin) {
    let changed = false;
    if (admin.email !== targetEmail) {
      const conflict = await User.findOne({ email: targetEmail });
      if (!conflict) {
        console.log(`[seed] updating admin email from ${admin.email} to ${targetEmail}`);
        admin.email = targetEmail;
        changed = true;
      }
    }
    if (config.admin.name && admin.name !== config.admin.name) {
      admin.name = config.admin.name;
      changed = true;
    }
    if (admin.role !== 'admin') {
      admin.role = 'admin';
      changed = true;
    }
    if (admin.status !== 'active') {
      admin.status = 'active';
      changed = true;
    }
    if (!admin.emailVerified) {
      admin.emailVerified = true;
      changed = true;
    }
    if (config.admin.password) {
      const match = await comparePassword(config.admin.password, admin.passwordHash);
      if (!match) {
        admin.passwordHash = await hashPassword(config.admin.password);
        changed = true;
        console.log(`[seed] admin password synchronized with config for: ${admin.email}`);
      }
    }
    if (changed) {
      await admin.save();
    }
    return admin;
  }

  // Backfill: pre-existing users created before email verification existed have
  // no `emailVerified` field; treat them as verified so the login gate doesn't
  // lock them out. Users created through the new flow always set the field.
  try {
    await User.updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true } });
  } catch (e) {
    // Non-fatal: only affects legacy accounts that never went through verification.
  }

  const newAdmin = new User({
    name: config.admin.name,
    email: config.admin.email.toLowerCase(),
    passwordHash: await hashPassword(config.admin.password),
    role: 'admin',
    status: 'active',
    emailVerified: true,
  });
  await newAdmin.save();
  console.log(`[seed] admin created: ${newAdmin.email}`);
  return newAdmin;
};

const formatYoutubeEmbed = (url) => {
  if (!url) return '';
  if (!url) return '';
  if (url.includes('embed/')) return url;
  const ytReg = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = String(url).match(ytReg);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=0`;
  }
  return url;
};

export const listAdminVideos = async (req, res, next) => {
  try {
    const { search, category, status } = req.query;
    const filter = {};
    if (status === 'published' || status === 'active') {
      filter.$or = [{ published: true }, { isActive: true }];
    } else if (status === 'draft' || status === 'inactive') {
      filter.$and = [{ published: { $ne: true } }, { isActive: { $ne: true } }];
    } else if (status === 'featured') {
      filter.featured = true;
    }
    if (category) filter.category = category;

    if (search) {
      const s = searchRegex(search);
      const searchConditions = [{ title: s }, { description: s }, { category: s }, { cloudinaryPublicId: s }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const videos = await Video.find(filter).sort({ order: 1, displayOrder: 1, createdAt: -1 }).lean();
    const allVideos = await Video.find().lean();

    let totalVideos = allVideos.length;
    let publishedVideos = 0;
    let draftVideos = 0;
    let featuredVideos = 0;
    let totalViews = 0;

    for (const v of allVideos) {
      if (v.published || v.isActive) publishedVideos++;
      else draftVideos++;
      if (v.featured) featuredVideos++;
      totalViews += v.viewsCount || v.views || 0;
    }

    const [sectionSetting, modeSetting] = await Promise.all([
      Setting.findOne({ key: 'videoSectionEnabled' }).lean(),
      Setting.findOne({ key: 'movieReelModeEnabled' }).lean(),
    ]);

    const formatted = videos.map((v, index) => ({
      ...v,
      order: v.order ?? v.displayOrder ?? index + 1,
      displayOrder: v.displayOrder ?? v.order ?? index + 1,
      isActive: v.isActive ?? v.published ?? true,
      published: v.published ?? v.isActive ?? true,
      views: v.views ?? v.viewsCount ?? 0,
      viewsCount: v.viewsCount ?? v.views ?? 0,
      thumbnailUrl: v.thumbnailUrl || v.thumbnail || '',
    }));

    res.json({
      success: true,
      count: formatted.length,
      kpis: {
        totalVideos,
        publishedVideos,
        draftVideos,
        featuredVideos,
        totalViews,
      },
      settings: {
        videoSectionEnabled: sectionSetting?.value !== false,
        movieReelModeEnabled: modeSetting?.value !== false,
      },
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await Video.findById(id).lean();
    if (!video) return next(new AppError('Video/Reel not found', 404));

    res.json({
      success: true,
      data: {
        ...video,
        order: video.order ?? video.displayOrder ?? 0,
        displayOrder: video.displayOrder ?? video.order ?? 0,
        isActive: video.isActive ?? video.published ?? true,
        published: video.published ?? video.isActive ?? true,
        thumbnailUrl: video.thumbnailUrl || video.thumbnail || '',
      },
    });
  } catch (err) {
    next(err);
  }
};

export const createVideo = async (req, res, next) => {
  try {
    let {
      title,
      description,
      videoUrl,
      cloudinaryPublicId,
      cloudinaryResourceType = 'video',
      thumbnailUrl,
      thumbnail,
      category,
      duration = '15s',
      badgeColor,
      icon,
      views = 0,
      viewsCount,
      order,
      displayOrder,
      isActive = true,
      published,
      featured = false,
      youtubeEmbed,
      instagramUrl,
    } = req.body;

    if (!title) {
      return next(new AppError('Reel title is required', 400));
    }

    // Auto-resolve Cloudinary public ID and delivery URLs
    if (cloudinaryPublicId) {
      if (!videoUrl) videoUrl = buildDirectVideoUrl(cloudinaryPublicId);
      if (!thumbnailUrl && !thumbnail) thumbnailUrl = buildVideoThumbnailUrl(cloudinaryPublicId);
    } else if (videoUrl && videoUrl.includes('cloudinary.com')) {
      cloudinaryPublicId = extractPublicId(videoUrl);
      if (!thumbnailUrl && !thumbnail) thumbnailUrl = buildVideoThumbnailUrl(cloudinaryPublicId);
    }

    if (!videoUrl && !cloudinaryPublicId) {
      return next(new AppError('Video URL or Cloudinary Public ID is required', 400));
    }

    if (featured) {
      await Video.updateMany({}, { featured: false });
    }

    const resolvedOrder = Number(order ?? displayOrder) || (await Video.countDocuments()) + 1;
    const resolvedViews = Number(views ?? viewsCount) || 0;
    const resolvedActive = isActive !== undefined ? !!isActive : published !== undefined ? !!published : true;

    const payload = {
      title: title.trim(),
      description: (description || '').trim(),
      videoUrl: (videoUrl || '').trim(),
      cloudinaryPublicId: (cloudinaryPublicId || '').trim(),
      cloudinaryResourceType,
      thumbnailUrl: (thumbnailUrl || thumbnail || '').trim(),
      thumbnail: (thumbnail || thumbnailUrl || '').trim(),
      category: (category || 'Step-By-Step Guide').trim(),
      duration: (duration || '15s').trim(),
      badgeColor: badgeColor || 'bg-amber-400 text-slate-950',
      icon: icon || '🎬',
      views: resolvedViews,
      viewsCount: resolvedViews,
      order: resolvedOrder,
      displayOrder: resolvedOrder,
      isActive: resolvedActive,
      published: resolvedActive,
      featured: !!featured,
      youtubeEmbed: youtubeEmbed ? formatYoutubeEmbed(youtubeEmbed) : '',
      instagramUrl: (instagramUrl || '').trim(),
    };

    const video = new Video(payload);
    await video.save();

    await recordAudit(req, 'REEL_CREATED', 'Video', video._id, {
      title: video.title,
      cloudinaryPublicId: video.cloudinaryPublicId,
      featured: video.featured,
      isActive: video.isActive,
    });

    res.status(201).json({ success: true, data: video });
  } catch (err) {
    next(err);
  }
};

export const updateVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const oldVideo = await Video.findById(id).lean();
    if (!oldVideo) return next(new AppError('Video/Reel not found', 404));

    if (req.body.featured) {
      await Video.updateMany({ _id: { $ne: id } }, { featured: false });
    }

    const payload = { ...req.body };

    // Auto-resolve Cloudinary public ID and delivery URLs
    if (payload.cloudinaryPublicId) {
      if (!payload.videoUrl || payload.videoUrl.includes('sample/ForBigger')) {
        payload.videoUrl = buildDirectVideoUrl(payload.cloudinaryPublicId);
      }
      if (!payload.thumbnailUrl && !payload.thumbnail) {
        payload.thumbnailUrl = buildVideoThumbnailUrl(payload.cloudinaryPublicId);
      }
    } else if (payload.videoUrl && payload.videoUrl.includes('cloudinary.com')) {
      payload.cloudinaryPublicId = extractPublicId(payload.videoUrl);
    }

    if (payload.thumbnailUrl) payload.thumbnail = payload.thumbnailUrl;
    if (payload.thumbnail && !payload.thumbnailUrl) payload.thumbnailUrl = payload.thumbnail;
    if (payload.order !== undefined) payload.displayOrder = Number(payload.order);
    if (payload.displayOrder !== undefined && payload.order === undefined) payload.order = Number(payload.displayOrder);
    if (payload.isActive !== undefined) payload.published = !!payload.isActive;
    if (payload.published !== undefined && payload.isActive === undefined) payload.isActive = !!payload.published;
    if (payload.views !== undefined) payload.viewsCount = Number(payload.views);
    if (payload.viewsCount !== undefined && payload.views === undefined) payload.views = Number(payload.viewsCount);
    if (payload.youtubeEmbed) payload.youtubeEmbed = formatYoutubeEmbed(payload.youtubeEmbed);

    const video = await Video.findByIdAndUpdate(id, payload, { new: true, runValidators: true });

    // Clean up old Cloudinary asset if replaced with a new one
    if (
      oldVideo.cloudinaryPublicId &&
      payload.cloudinaryPublicId &&
      oldVideo.cloudinaryPublicId !== payload.cloudinaryPublicId &&
      !['v1', 'v2', 'v3', 'v4', 'v5'].includes(oldVideo.cloudinaryPublicId)
    ) {
      deleteCloudinaryAsset(oldVideo.cloudinaryPublicId, 'video').catch(() => {});
    }

    await recordAudit(req, 'REEL_UPDATED', 'Video', video._id, {
      title: video.title,
      cloudinaryPublicId: video.cloudinaryPublicId,
      diffs: {
        oldFeatured: oldVideo.featured,
        newFeatured: video.featured,
        oldActive: oldVideo.isActive ?? oldVideo.published,
        newActive: video.isActive ?? video.published,
      },
    });

    res.json({ success: true, data: video });
  } catch (err) {
    next(err);
  }
};

export const quickToggleFeaturedVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    if (featured) {
      await Video.updateMany({ _id: { $ne: id } }, { featured: false });
    }

    const video = await Video.findByIdAndUpdate(id, { featured: !!featured }, { new: true });
    if (!video) return next(new AppError('Video/Reel not found', 404));

    await recordAudit(req, 'REEL_FEATURED_CHANGED', 'Video', video._id, {
      title: video.title,
      featured: video.featured,
    });

    res.json({ success: true, data: video });
  } catch (err) {
    next(err);
  }
};

export const quickTogglePublishVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isPub = req.body.published !== undefined ? !!req.body.published : !!req.body.isActive;
    const video = await Video.findByIdAndUpdate(
      id,
      { published: isPub, isActive: isPub },
      { new: true }
    );
    if (!video) return next(new AppError('Video/Reel not found', 404));

    await recordAudit(req, 'REEL_STATUS_CHANGED', 'Video', video._id, {
      title: video.title,
      published: video.published,
      isActive: video.isActive,
    });

    res.json({ success: true, data: video });
  } catch (err) {
    next(err);
  }
};

export const quickUpdateOrderVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orderNum = Number(req.body.order ?? req.body.displayOrder) || 0;
    const video = await Video.findByIdAndUpdate(
      id,
      { order: orderNum, displayOrder: orderNum },
      { new: true }
    );
    if (!video) return next(new AppError('Video/Reel not found', 404));

    res.json({ success: true, data: video });
  } catch (err) {
    next(err);
  }
};

export const bulkReorderVideos = async (req, res, next) => {
  try {
    const { items } = req.body; // Array of { id, order }
    if (!Array.isArray(items)) {
      return next(new AppError('Items array is required for bulk reordering', 400));
    }

    const updates = items.map((item, index) => {
      const orderNum = Number(item.order) || index + 1;
      return Video.findByIdAndUpdate(item.id || item._id, {
        order: orderNum,
        displayOrder: orderNum,
      });
    });

    await Promise.all(updates);

    await recordAudit(req, 'REELS_BULK_REORDERED', 'Video', null, { count: items.length });

    res.json({ success: true, message: 'Reels order updated successfully.' });
  } catch (err) {
    next(err);
  }
};

export const deleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await Video.findByIdAndDelete(id);
    if (!video) return next(new AppError('Video/Reel not found', 404));

    if (
      video.cloudinaryPublicId &&
      !['v1', 'v2', 'v3', 'v4', 'v5'].includes(video.cloudinaryPublicId)
    ) {
      deleteCloudinaryAsset(video.cloudinaryPublicId, 'video').catch(() => {});
    }

    await recordAudit(req, 'REEL_DELETED', 'Video', id, { title: video.title });

    res.json({ success: true, deleted: true, message: 'Reel permanently deleted.' });
  } catch (err) {
    next(err);
  }
};

export const updateVideoSettings = async (req, res, next) => {
  try {
    const { videoSectionEnabled, movieReelModeEnabled } = req.body;

    if (videoSectionEnabled !== undefined) {
      await Setting.findOneAndUpdate(
        { key: 'videoSectionEnabled' },
        { key: 'videoSectionEnabled', value: !!videoSectionEnabled },
        { upsert: true, new: true }
      );
    }

    if (movieReelModeEnabled !== undefined) {
      await Setting.findOneAndUpdate(
        { key: 'movieReelModeEnabled' },
        { key: 'movieReelModeEnabled', value: !!movieReelModeEnabled },
        { upsert: true, new: true }
      );
    }

    await recordAudit(req, 'REEL_SETTINGS_UPDATED', 'Setting', null, {
      videoSectionEnabled,
      movieReelModeEnabled,
    });

    res.json({
      success: true,
      message: 'Video settings updated successfully.',
      settings: {
        videoSectionEnabled: !!videoSectionEnabled,
        movieReelModeEnabled: !!movieReelModeEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle Media File Upload (Video & Thumbnail)
 * Supports direct Cloudinary streaming upload with local fallback
 * POST /api/admin/videos/upload or POST /api/admin/reels/upload
 */
export const uploadMedia = async (req, res, next) => {
  try {
    const files = req.files || {};
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let videoUrl = '';
    let thumbnailUrl = '';
    let cloudinaryPublicId = '';
    let resourceType = 'video';
    let duration = '';

    // Handle Video File Upload
    if (files.video && files.video[0]) {
      const videoFile = files.video[0];
      try {
        const buffer = fs.readFileSync(videoFile.path);
        const cloudRes = await uploadBufferToCloudinary(buffer, {
          resource_type: 'video',
          folder: 'apex_reels',
        });
        if (cloudRes && cloudRes.secure_url) {
          videoUrl = cloudRes.secure_url;
          cloudinaryPublicId = cloudRes.public_id;
          resourceType = cloudRes.resource_type || 'video';
          thumbnailUrl = buildVideoThumbnailUrl(cloudRes.public_id);
          if (cloudRes.duration) {
            duration = `${Math.round(cloudRes.duration)}s`;
          }
          // Clean up local disk file after upload to Cloudinary
          try { fs.unlinkSync(videoFile.path); } catch {}
        }
      } catch (cloudErr) {
        console.warn('[Upload] Cloudinary upload fallback to local storage:', cloudErr.message);
        videoUrl = `${baseUrl}/uploads/videos/${videoFile.filename}`;
      }
    }

    // Handle Thumbnail Image Upload
    if (files.thumbnail && files.thumbnail[0]) {
      const thumbFile = files.thumbnail[0];
      try {
        const buffer = fs.readFileSync(thumbFile.path);
        const cloudRes = await uploadBufferToCloudinary(buffer, {
          resource_type: 'image',
          folder: 'apex_reels/thumbnails',
        });
        if (cloudRes && cloudRes.secure_url) {
          thumbnailUrl = cloudRes.secure_url;
          try { fs.unlinkSync(thumbFile.path); } catch {}
        }
      } catch (cloudErr) {
        console.warn('[Upload] Thumbnail Cloudinary fallback to local storage:', cloudErr.message);
        thumbnailUrl = `${baseUrl}/uploads/thumbnails/${thumbFile.filename}`;
      }
    }

    if (!videoUrl && !thumbnailUrl) {
      return next(new AppError('No valid file uploaded', 400));
    }

    res.json({
      success: true,
      message: 'Media uploaded successfully',
      videoUrl,
      thumbnailUrl,
      cloudinaryPublicId,
      resourceType,
      duration,
      fileInfo: {
        video: files.video ? files.video[0] : null,
        thumbnail: files.thumbnail ? files.thumbnail[0] : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// NOTE: the /api/admin/reels routes are wired directly to the *Video handlers
// in adminRoutes.js — "reels" and "videos" are the same resource. The parallel
// `export const createReel = createVideo` alias block that used to sit here had
// no importers and only made the module look like it had two implementations.


/**
 * Admin email-delivery test. Sends a real diagnostic message and returns the
 * provider's response — the actual send path (same transporter as OTP + voucher
 * emails), not a fake success. Never sends or reveals an OTP.
 * POST /api/admin/email/test  { to?: string }
 */
export const sendTestEmail = async (req, res, next) => {
  try {
    const status = emailConfigStatus();
    const to = String(req.body?.to || '').trim() || req.user?.email;
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return next(new AppError('A valid recipient email is required', 400, 'INVALID_RECIPIENT'));
    }
    const stamp = new Date().toISOString();
    const result = await sendEmail({
      to,
      tag: 'admin-test',
      subject: `Apex Vouchers — email delivery test (${stamp})`,
      text: `This is a diagnostic email from the Apex Vouchers admin console.\nIf you received it, transactional email delivery is working.\nSent: ${stamp}`,
      html: `<p>This is a diagnostic email from the <b>Apex Vouchers</b> admin console.</p><p>If you received it, transactional email delivery is working.</p><p style="color:#888">Sent: ${stamp}</p>`,
    });
    return res.json({
      success: result.sent,
      providerConfigured: status.providerReady,
      senderConfigured: status.senderReady,
      gmailFromMismatch: status.gmailMismatch,
      accepted: result.sent,
      messageId: result.messageId || null,
      providerResponse: result.info?.response || null,
      error: result.sent ? null : result.error || 'Send failed',
      note: result.sent
        ? 'Accepted by the mail provider. This is NOT proof of inbox delivery — check the recipient inbox and spam folder.'
        : 'The mail provider did not accept the message. See `error`.',
    });
  } catch (err) {
    next(err);
  }
};

export const resendOrderEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const q = isValidObjectId(id) ? { _id: id } : { orderNo: id };
    const order = await Order.findOne(q).populate('userId');

    if (!order) return next(new AppError('Order not found', 404));

    if (order.paymentStatus !== 'PAID') {
      return next(new AppError('Cannot send confirmation email for unpaid order', 400));
    }

    const vouchers = await VoucherCode.find({ orderId: order._id })
      .populate('productId', 'name brand')
      .lean();

    if (!vouchers || vouchers.length === 0) {
      return next(
        new AppError(
          'No voucher codes have been assigned to this order yet. Please allocate a voucher first.',
          400
        )
      );
    }

    const enriched = vouchers.map((v) => {
      const match = order.items.find(
        (it) => it.productId.toString() === (v.productId?._id || v.productId).toString()
      );
      return {
        code: v.code,
        expiryDate: v.expiryDate,
        productName: match?.productName || v.productId?.name || 'Exam Voucher',
        slug: v.productId?.slug || match?.slug || '',
      };
    });

    const targetUser = order.userId || {
      name: order.customerSnapshot?.name || order.billingDetails?.name || 'Customer',
      email: order.customerSnapshot?.email || order.billingDetails?.email,
    };

    const mailRes = await sendOrderConfirmation(targetUser, order, enriched);

    if (mailRes && mailRes.sent !== false) {
      order.emailStatus = 'SENT';
      order.emailSentAt = new Date();
      order.emailError = null;
    } else {
      order.emailStatus = 'FAILED';
      order.emailError = mailRes?.error || 'Email delivery stubbed or failed';
    }
    await order.save();

    await recordAudit(req, 'ADMIN_EMAIL_RESENT', 'Order', order._id, {
      orderNo: order.orderNo,
      emailStatus: order.emailStatus,
      recipient: targetUser.email,
    });

    res.json({
      success: true,
      emailStatus: order.emailStatus,
      message:
        order.emailStatus === 'SENT'
          ? `Confirmation email resent successfully to ${targetUser.email}.`
          : `Attempted resend to ${targetUser.email}, status: ${order.emailStatus}.`,
    });
  } catch (err) {
    next(err);
  }
};

export const listCampaigns = async (req, res, next) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ priority: -1, createdAt: -1 })
      .populate('applicableProducts', 'name brand sellingPrice originalPrice')
      .lean();
    res.json({ success: true, count: campaigns.length, data: campaigns });
  } catch (err) {
    next(err);
  }
};

export const createCampaign = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.startDate || !body.endDate || body.discountValue === undefined) {
      return next(new AppError('Name, start date, end date, and discount value are required', 400));
    }

    const campaign = new Campaign({
      ...body,
      createdBy: req.user._id,
    });
    await campaign.save();

    await recordAudit(req, 'CAMPAIGN_CREATED', 'Campaign', campaign._id, {
      name: campaign.name,
      status: campaign.status,
      discountValue: campaign.discountValue,
    });

    res.status(201).json({ success: true, data: campaign.toObject() });
  } catch (err) {
    next(err);
  }
};

export const updateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);
    if (!campaign) return next(new AppError('Campaign not found', 404));

    Object.assign(campaign, req.body);
    await campaign.save();

    await recordAudit(req, 'CAMPAIGN_UPDATED', 'Campaign', campaign._id, {
      name: campaign.name,
      status: campaign.status,
    });

    res.json({ success: true, data: campaign.toObject() });
  } catch (err) {
    next(err);
  }
};

export const deleteCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findByIdAndDelete(id);
    if (!campaign) return next(new AppError('Campaign not found', 404));

    await recordAudit(req, 'CAMPAIGN_DELETED', 'Campaign', id, { name: campaign.name });

    res.json({ success: true, message: 'Campaign deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

export const toggleCampaignStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);
    if (!campaign) return next(new AppError('Campaign not found', 404));

    campaign.status = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    await campaign.save();

    await recordAudit(req, 'CAMPAIGN_STATUS_TOGGLED', 'Campaign', campaign._id, {
      name: campaign.name,
      status: campaign.status,
    });

    res.json({ success: true, status: campaign.status, data: campaign.toObject() });
  } catch (err) {
    next(err);
  }
};

/** The CMS setting groups the website reads. Anything else is not persisted. */
const WEBSITE_SETTING_KEYS = [
  'heroSettings',
  'announcementSettings',
  'benefitCards',
  'footerSettings',
  'policySettings',
];

export const getWebsiteSettings = async (req, res, next) => {
  try {
    // One round trip instead of five sequential findOne calls.
    const rows = await Setting.find({ key: { $in: WEBSITE_SETTING_KEYS } }).lean();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const data = Object.fromEntries(WEBSITE_SETTING_KEYS.map((k) => [k, byKey.get(k) ?? null]));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const updateWebsiteSettings = async (req, res, next) => {
  try {
    const body = req.body || {};
    const updates = WEBSITE_SETTING_KEYS.filter((key) => body[key] !== undefined && body[key] !== null);

    // Previously this returned "updated successfully" no matter what was sent,
    // so a payload with a typo'd or unsupported key reported success while
    // storing nothing. Say so instead.
    if (!updates.length) {
      return next(
        new AppError(
          `No recognised settings in the request. Expected one of: ${WEBSITE_SETTING_KEYS.join(', ')}`,
          400,
          'NO_SETTINGS_SUPPLIED'
        )
      );
    }

    await Promise.all(
      updates.map((key) =>
        Setting.findOneAndUpdate({ key }, { key, value: body[key] }, { upsert: true })
      )
    );

    await recordAudit(req, 'WEBSITE_SETTINGS_UPDATED', 'Setting', null, { updatedKeys: updates });

    res.json({
      success: true,
      message: `Updated ${updates.length} setting group${updates.length === 1 ? '' : 's'}.`,
      updated: updates,
    });
  } catch (err) {
    next(err);
  }
};
