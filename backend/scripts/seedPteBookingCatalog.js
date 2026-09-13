/**
 * One-time (idempotent) migration: seeds the PTE Exam Booking storefront
 * catalog + page config from the values the frontend used to hardcode
 * (web/components/pte-booking-assistance.tsx + web/lib/pte-booking-data.ts).
 *
 *   node backend/scripts/seedPteBookingCatalog.js
 *
 * Safety:
 *  - Products are only INSERTED when their `key` does not exist yet — admin
 *    edits are never overwritten by re-running this script.
 *  - The page config Setting is only created when missing.
 *  - The three existing cards (PTE Academic, PTE Core, PTE Academic UKVI) keep
 *    working with exactly the same look after migration.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { PTEBookingProduct } from '../models/PTEBookingProduct.js';
import { Setting } from '../models/Setting.js';
import { PTE_BOOKING_CONFIG_KEY, DEFAULT_PTE_BOOKING_PAGE_CONTENT } from '../controllers/pteBookingProductController.js';

const SEED_PRODUCTS = [
  {
    key: 'pte-academic',
    name: 'PTE Academic',
    slug: 'pte-academic',
    shortDescription:
      'For university study admissions, student visas & professional registrations worldwide (Australia, UK, USA, Canada, NZ).',
    serviceLabel: 'EXAM BOOKING SERVICE',
    badgeText: 'MOST POPULAR',
    badgeTint: '#005A9C',
    image: '',
    pricing: { bookingPrice: 14999, standardPrice: 18900, currency: 'INR', showStandardPrice: true, showSavingsBadge: true },
    button: { text: 'Book Now', href: '', visible: true, enabled: true },
  },
  {
    key: 'pte-core',
    name: 'PTE Core',
    slug: 'pte-core',
    shortDescription:
      'Approved by IRCC for Canadian Permanent Residency (PR), Express Entry, Provincial Nominees, and Citizenship pathways.',
    serviceLabel: 'EXAM BOOKING SERVICE',
    badgeText: 'CANADA PR',
    badgeTint: '#FF005C',
    image: '',
    pricing: { bookingPrice: 14499, standardPrice: 18900, currency: 'INR', showStandardPrice: false, showSavingsBadge: false },
    button: { text: 'Book Now', href: '', visible: true, enabled: true },
  },
  {
    key: 'pte-ukvi',
    name: 'PTE Academic UKVI',
    slug: 'pte-academic-ukvi',
    shortDescription:
      'Secure English Language Test (SELT) approved by the UK Home Office for UK work, study, and family visa applications.',
    serviceLabel: 'EXAM BOOKING SERVICE',
    badgeText: 'UK VISA (SELT)',
    badgeTint: '#6C3CE0',
    image: '',
    pricing: { bookingPrice: 14499, standardPrice: 18900, currency: 'INR', showStandardPrice: false, showSavingsBadge: false },
    button: { text: 'Book Now', href: '', visible: true, enabled: true },
  },
];

const SEED_FEATURES = [
  'Exam booking arranged for you',
  'Choose preferred test centre',
  'Choose preferred available date',
  'Booking confirmation provided',
  'Human support throughout the process',
];

const run = async () => {
  await connectDB();
  let created = 0;
  let skipped = 0;

  for (const [index, seed] of SEED_PRODUCTS.entries()) {
    const existing = await PTEBookingProduct.findOne({ key: seed.key });
    if (existing) {
      skipped += 1;
      console.log(`• ${seed.key} exists — keeping existing record (displayOrder=${existing.displayOrder || index + 1})`);
      continue;
    }
    const doc = new PTEBookingProduct({
      key: seed.key,
      name: seed.name,
      shortDescription: seed.shortDescription,
      serviceLabel: seed.serviceLabel,
      badgeText: seed.badgeText,
      badgeTint: seed.badgeTint,
      image: seed.image,
      pricing: seed.pricing,
      features: SEED_FEATURES.map((text) => ({ text, enabled: true })),
      button: seed.button,
      active: true,
      displayOrder: index + 1,
      status: 'published',
      auditHistory: [
        {
          action: 'PTE_BOOKING_PRODUCT_SEEDED',
          adminEmail: 'system@apexvouchers.in',
          changes: { note: `Migrated from hardcoded storefront values (${seed.name})` },
          timestamp: new Date(),
        },
      ],
    });
    await doc.save();
    created += 1;
    console.log(`✓ created ${seed.key} (${seed.name}) — ₹${seed.pricing.bookingPrice}`);
  }

  const cfg = await Setting.findOne({ key: PTE_BOOKING_CONFIG_KEY });
  if (cfg) {
    console.log(`• page config exists — keeping existing record (status=${cfg.value?.status})`);
  } else {
    await Setting.create({
      key: PTE_BOOKING_CONFIG_KEY,
      value: {
        status: 'published',
        content: DEFAULT_PTE_BOOKING_PAGE_CONTENT,
        updatedBy: 'system@apexvouchers.in',
        updatedAt: new Date(),
        auditHistory: [{ action: 'PTE_BOOKING_CONFIG_SEEDED', adminEmail: 'system@apexvouchers.in', timestamp: new Date(), changes: {} }],
      },
    });
    console.log('✓ created PTE booking page config (published)');
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});