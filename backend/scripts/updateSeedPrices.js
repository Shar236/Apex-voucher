import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/db.js';
import { PTEBookingProduct } from '../models/PTEBookingProduct.js';

const run = async () => {
  await connectDB();
  const items = await PTEBookingProduct.find({}).lean();
  console.log('Current items:', items.map(i => ({ key: i.key, price: i.pricing?.bookingPrice, standard: i.pricing?.standardPrice })));
  
  // Set initial prices matching prompt:
  // PTE Academic — ₹14,999 (Standard ₹18,900)
  // PTE Core — ₹14,999 (Standard ₹18,900)
  // PTE Academic UKVI — ₹14,499 (Standard 0 / not shown)
  await PTEBookingProduct.updateOne(
    { key: 'pte-academic' },
    {
      $set: {
        'pricing.bookingPrice': 14999,
        'pricing.standardPrice': 18900,
        'pricing.showStandardPrice': true,
        'pricing.showSavingsBadge': true,
        status: 'published',
        active: true,
      }
    }
  );

  await PTEBookingProduct.updateOne(
    { key: 'pte-core' },
    {
      $set: {
        'pricing.bookingPrice': 14999,
        'pricing.standardPrice': 18900,
        'pricing.showStandardPrice': true,
        'pricing.showSavingsBadge': true,
        status: 'published',
        active: true,
      }
    }
  );

  await PTEBookingProduct.updateOne(
    { key: 'pte-ukvi' },
    {
      $set: {
        'pricing.bookingPrice': 14499,
        'pricing.standardPrice': 0,
        'pricing.showStandardPrice': false,
        'pricing.showSavingsBadge': false,
        status: 'published',
        active: true,
      }
    }
  );

  const updated = await PTEBookingProduct.find({}).lean();
  console.log('Updated items:', updated.map(i => ({ key: i.key, price: i.pricing?.bookingPrice, standard: i.pricing?.standardPrice })));
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
