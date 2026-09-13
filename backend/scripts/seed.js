import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/db.js';
import { seedAdmin } from '../controllers/adminController.js';
import { Product } from '../models/Product.js';
import { VoucherCode } from '../models/VoucherCode.js';
import { hashPassword } from '../middleware/auth.js';
import { User } from '../models/User.js';

const SAMPLE_PRODUCTS = [
  {
    name: 'Pearson PTE Practice Test',
    provider: 'Pearson PTE',
    brand: 'Pearson PTE',
    category: 'Practice Test',
    description: 'Official Scored PTE Mock Test with automated AI score report. Real exam interface and scoring algorithm.',
    originalPrice: 1132.50,
    sellingPrice: 799.00,
    currency: 'INR',
    validityMonths: 3,
    badge: 'Out of stock',
    inStock: false,
    rating: 4.7,
    reviewsCount: 520,
    featured: false,
    active: true,
    displayOrder: 1,
  },
  {
    name: 'Pearson PTE Academic',
    provider: 'Pearson PTE',
    brand: 'Pearson PTE',
    category: 'Exam Voucher',
    description: 'Official voucher code for Pearson PTE Academic Exam. Save ₹3,901 instantly on your test booking fee with guaranteed official acceptance.',
    originalPrice: 18900.00,
    sellingPrice: 14999.00,
    currency: 'INR',
    validityMonths: 6,
    inclusions: [
      'Official 100% Genuine Pearson Voucher Code',
      'Instant Email + WhatsApp Delivery in 10 seconds',
      '6-Month Validity Period',
      '1-Time Reschedule Guide & Exam Prep Blueprint',
    ],
    redemptionSteps: [
      'Visit mypte.pearsonpte.com and create or log in to your account.',
      'Select your preferred test center, date, and time slot.',
      'Proceed to checkout and paste your Apex Voucher code in the Voucher / Promo Code box.',
      'Confirm your appointment at ₹0 fee.',
    ],
    badge: '🔥 Best Seller',
    rating: 4.9,
    reviewsCount: 1420,
    featured: true,
    inStock: true,
    active: true,
    displayOrder: 2,
  },
  {
    name: 'Pearson PTE Core',
    provider: 'Pearson PTE',
    brand: 'Pearson PTE',
    category: 'Exam Voucher',
    description: 'Save big on the PTE Core exam required for Canada Permanent Residency (IRCC approved). Guaranteed valid and instantly delivered.',
    originalPrice: 18900.00,
    sellingPrice: 15799.00,
    currency: 'INR',
    validityMonths: 6,
    badge: '🇨🇦 Canada PR Approved',
    rating: 4.8,
    reviewsCount: 680,
    featured: true,
    active: true,
    inStock: true,
    displayOrder: 3,
  },
  {
    name: 'ETS GRE',
    provider: 'ETS GRE',
    brand: 'ETS GRE',
    category: 'Exam Voucher',
    description: 'Discounted exam voucher code for ETS GRE General Test. Accepted by top universities worldwide.',
    originalPrice: 22500.00,
    sellingPrice: 19799.00,
    currency: 'INR',
    validityMonths: 12,
    badge: '🎓 Grad School Top Pick',
    rating: 4.9,
    reviewsCount: 910,
    featured: true,
    active: true,
    inStock: true,
    displayOrder: 4,
  },
  {
    name: 'ETS TOEFL',
    provider: 'ETS TOEFL',
    brand: 'ETS TOEFL',
    category: 'Exam Voucher',
    description: 'Save ₹4,001 on the TOEFL iBT test. Preferred by over 12,000 universities in 160+ countries.',
    originalPrice: 18000.00,
    sellingPrice: 13999.00,
    currency: 'INR',
    validityMonths: 12,
    badge: '⚡ Max Discount (22% OFF)',
    rating: 4.9,
    reviewsCount: 840,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 5,
  },
  {
    name: 'Duolingo English Test',
    provider: 'Duolingo',
    brand: 'Duolingo',
    category: 'Exam Voucher',
    description: 'Get 18% off the fast, accessible Duolingo English Test. Complete at home in 1 hour.',
    originalPrice: 6112.50,
    sellingPrice: 4999.00,
    currency: 'INR',
    validityMonths: 3,
    badge: '🚀 Fast 48h Results',
    rating: 4.8,
    reviewsCount: 1150,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 6,
  },
  {
    name: 'ACT Exam Voucher',
    provider: 'ACT',
    brand: 'ACT',
    category: 'Exam Voucher',
    description: 'Official voucher code for ACT College Readiness Assessment. Accepted by all four-year US colleges and universities.',
    originalPrice: 19800.00,
    sellingPrice: 12999.00,
    currency: 'INR',
    validityMonths: 12,
    badge: '⭐ Top Savings',
    rating: 4.8,
    reviewsCount: 380,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 7,
  },
  {
    name: 'OET Exam Voucher',
    provider: 'OET',
    brand: 'OET',
    category: 'Exam Voucher',
    description: 'Official Occupational English Test (OET) voucher for healthcare professionals (Doctors, Nurses, Dentists & Pharmacists).',
    originalPrice: 38940.00,
    sellingPrice: 30900.00,
    currency: 'INR',
    validityMonths: 12,
    badge: '🏥 Healthcare Preferred',
    rating: 4.9,
    reviewsCount: 420,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 8,
  },
  {
    name: 'IELTS Exam Voucher',
    provider: 'IELTS',
    brand: 'IELTS',
    category: 'Exam Voucher',
    description: 'IELTS official test booking assistance, high-yield prediction files, speaking cue cards and slot reservation voucher.',
    originalPrice: 99.00,
    sellingPrice: 99.00,
    currency: 'INR',
    validityMonths: 12,
    badge: '🔥 Live Prediction',
    rating: 4.9,
    reviewsCount: 2240,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 9,
  },
  {
    name: 'LanguageCert Exam Voucher',
    provider: 'LanguageCert',
    brand: 'LanguageCert',
    category: 'Exam Voucher',
    description: 'Official LanguageCert International ESOL & SELT examination voucher. Fast 3-day results with online live proctoring.',
    originalPrice: 16430.00,
    sellingPrice: 11000.00,
    currency: 'INR',
    validityMonths: 12,
    badge: '🇬🇧 UK SELT Approved',
    rating: 4.8,
    reviewsCount: 310,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 10,
  },
  {
    name: 'CELPIP Exam Voucher',
    provider: 'CELPIP',
    brand: 'CELPIP',
    category: 'Exam Voucher',
    description: 'Official CELPIP-General test voucher code for Canadian immigration (IRCC) and professional designation.',
    originalPrice: 18290.00,
    sellingPrice: 14500.00,
    currency: 'INR',
    validityMonths: 6,
    badge: '🇨🇦 Canada PR / IRCC',
    rating: 4.8,
    reviewsCount: 560,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 11,
  },
  {
    name: 'Pearson PTE Canada Voucher',
    provider: 'Pearson PTE',
    brand: 'Pearson PTE',
    category: 'Exam Voucher',
    description: 'Official Pearson PTE Canada voucher for Express Entry, Provincial Nominee Programs (PNP) and Canadian citizenship.',
    originalPrice: 28000.00,
    sellingPrice: 25799.00,
    currency: 'INR',
    validityMonths: 6,
    badge: '🇨🇦 Express Entry',
    rating: 4.9,
    reviewsCount: 780,
    featured: false,
    active: true,
    inStock: true,
    displayOrder: 12,
  },
];

const generateCode = (brand) => {
  const pre = (brand || 'APEX').replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
  const rnd = (n) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');
  return `APX-${pre}-${rnd(4)}-${rnd(3)}`;
};

export default async function seed() {
  await connectDB();
  await seedAdmin();

  const demoUserEmail = 'demo@apexvouchers.in';
  const demoUser = await User.findOne({ email: demoUserEmail });
  if (!demoUser) {
    const u = new User({
      name: 'Demo Customer',
      email: demoUserEmail,
      phone: '+919000000000',
      passwordHash: await hashPassword('Demo@123'),
      role: 'user',
      status: 'active',
    });
    await u.save();
    console.log('[seed] demo user created:', demoUserEmail, ' / Demo@123');
  }

  for (const p of SAMPLE_PRODUCTS) {
    let product = await Product.findOne({
      $or: [{ name: p.name }, { provider: p.provider, category: p.category, displayOrder: p.displayOrder }],
    });
    if (!product) {
      product = new Product(p);
      await product.save();
      console.log(`[seed] product created: ${product.name}`);
    } else {
      Object.assign(product, p);
      await product.save();
      console.log(`[seed] product updated: ${product.name}`);
    }

    if (product.inStock !== false) {
      const count = await VoucherCode.countDocuments({ productId: product._id, status: 'AVAILABLE' });
      if (count < 25) {
        const need = 25 - count;
        const docs = [];
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + (product.validityMonths || 6));
        for (let i = 0; i < need; i++) {
          docs.push({
            code: generateCode(product.brand),
            productId: product._id,
            status: 'AVAILABLE',
            expiryDate: expiry,
          });
        }
        try {
          await VoucherCode.insertMany(docs, { ordered: false });
          console.log(`[seed] +${docs.length} voucher codes for ${product.name}`);
        } catch (err) {
          console.log('[seed] vouchers insertMany skipped (dupes)');
        }
      }
    }
  }

  const SAMPLE_VIDEOS = [
    {
      title: 'How to Buy an Exam Voucher',
      category: 'Step-By-Step Guide',
      duration: '15s',
      description: 'Watch how to select your exam, apply discount promo codes, and receive your voucher code in 10 seconds.',
      thumbnail: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v1.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v1.jpg',
      videoUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/v1.mp4',
      cloudinaryPublicId: 'v1',
      cloudinaryResourceType: 'video',
      youtubeEmbed: '',
      views: 14200,
      viewsCount: 14200,
      featured: true,
      published: true,
      isActive: true,
      order: 1,
      displayOrder: 1,
      badgeColor: 'bg-amber-400 text-slate-950',
      icon: '🛒',
    },
    {
      title: 'How Does a PTE Voucher Work?',
      category: 'PTE Voucher',
      duration: '18s',
      description: 'Official Pearson PTE Academic & Core vouchers waive off registration fees instantly at checkout.',
      thumbnail: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v2.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v2.jpg',
      videoUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/v2.mp4',
      cloudinaryPublicId: 'v2',
      cloudinaryResourceType: 'video',
      youtubeEmbed: '',
      views: 22800,
      viewsCount: 22800,
      featured: false,
      published: true,
      isActive: true,
      order: 2,
      displayOrder: 2,
      badgeColor: 'bg-amber-400 text-slate-950',
      icon: '🎓',
    },
    {
      title: 'How to Redeem Your Voucher',
      category: 'Redemption Guide',
      duration: '14s',
      description: 'Paste your unique voucher code in the Promo Code field on Pearson, ETS, or Duolingo portals.',
      thumbnail: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v3.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v3.jpg',
      videoUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/v3.mp4',
      cloudinaryPublicId: 'v3',
      cloudinaryResourceType: 'video',
      youtubeEmbed: '',
      views: 18500,
      viewsCount: 18500,
      featured: false,
      published: true,
      isActive: true,
      order: 3,
      displayOrder: 3,
      badgeColor: 'bg-amber-400 text-slate-950',
      icon: '🔑',
    },
    {
      title: 'How Much Can You Save?',
      category: 'Save Money',
      duration: '16s',
      description: 'Compare regular official exam prices vs Apex bulk discounted prices for PTE, GRE, TOEFL, and Duolingo.',
      thumbnail: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v4.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v4.jpg',
      videoUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/v4.mp4',
      cloudinaryPublicId: 'v4',
      cloudinaryResourceType: 'video',
      youtubeEmbed: '',
      views: 31900,
      viewsCount: 31900,
      featured: false,
      published: true,
      isActive: true,
      order: 4,
      displayOrder: 4,
      badgeColor: 'bg-amber-400 text-slate-950',
      icon: '💰',
    },
    {
      title: 'IELTS Voucher Explained',
      category: 'IELTS',
      duration: '20s',
      description: 'Everything about IELTS Academic & General discount codes for IDP registration across India.',
      thumbnail: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v5.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/so_0/v5.jpg',
      videoUrl: 'https://res.cloudinary.com/nbcbpuql/video/upload/v5.mp4',
      cloudinaryPublicId: 'v5',
      cloudinaryResourceType: 'video',
      youtubeEmbed: '',
      views: 11700,
      viewsCount: 11700,
      featured: false,
      published: true,
      isActive: true,
      order: 5,
      displayOrder: 5,
      badgeColor: 'bg-amber-400 text-slate-950',
      icon: '🇬🇧',
    },
  ];

  const { Video } = await import('../models/Video.js');
  const videoCount = await Video.countDocuments();
  if (videoCount === 0) {
    await Video.insertMany(SAMPLE_VIDEOS);
    console.log('[seed] sample Cloudinary reels initialized (v1-v5)');
  } else {
    for (const sample of SAMPLE_VIDEOS) {
      const match = await Video.findOne({
        $or: [
          { cloudinaryPublicId: sample.cloudinaryPublicId },
          { title: sample.title },
        ],
      });
      if (match) {
        let changed = false;
        if (!match.cloudinaryPublicId || match.videoUrl.includes('sample/ForBigger')) {
          match.cloudinaryPublicId = sample.cloudinaryPublicId;
          match.videoUrl = sample.videoUrl;
          changed = true;
        }
        if (!match.thumbnailUrl || match.thumbnailUrl.includes('unsplash') || !match.thumbnail || match.thumbnail.includes('unsplash')) {
          match.thumbnailUrl = sample.thumbnailUrl;
          match.thumbnail = sample.thumbnail;
          changed = true;
        }
        if (match.order == null) {
          match.order = sample.order;
          match.displayOrder = sample.displayOrder;
          changed = true;
        }
        if (changed) {
          await match.save();
          console.log(`[seed] updated reel thumbnail and public ID: ${match.title} -> ${sample.thumbnailUrl}`);
        }
      } else {
        await new Video(sample).save();
        console.log(`[seed] inserted missing Cloudinary reel: ${sample.title}`);
      }
    }
  }

  console.log('[seed] done');
  process.exit(0);
}

if (process.argv[1]?.endsWith('seed.js')) {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
