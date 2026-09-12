export const siteConfig = {
  name: 'Apex Vouchers',
  shortName: 'Apex Vouchers',
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || 'https://apexvouchers.com').replace(/\/$/, ''),
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, ''),
  cloudinaryCloudName:
    (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim() === 'nbcbpuqlm'
      ? 'nbcbpuql'
      : (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim() || 'nbcbpuql',
  defaultTitle: 'Apex Vouchers — Book Smarter. Save More. | Discounted Exam Vouchers',
  defaultDescription:
    'Get 100% genuine discounted exam vouchers for Pearson PTE Academic, PTE Core, ETS GRE, TOEFL, and Duolingo English Test with instant email delivery.',
  twitterHandle: '@apexvouchers',
} as const;
