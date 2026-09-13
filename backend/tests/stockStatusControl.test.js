/**
 * Stock Status & Out-of-Stock Fulfillment Control Regression Suite
 *
 * Tests:
 * 1. Product creation defaults to inStock: true.
 * 2. Public API (list & detail) returns inStock: true and stockStatus: 'IN STOCK'.
 * 3. Admin quickUpdateStock toggles product to inStock: false.
 * 4. Database persistently stores inStock: false.
 * 5. Public API returns inStock: false and stockStatus: 'OUT OF STOCK'.
 * 6. Direct purchase attempt (createPaymentOrder) is rejected with 400 'This product is currently out of stock.'.
 * 7. Admin quickUpdateStock restores product to inStock: true.
 * 8. Public API returns inStock: true and stockStatus: 'IN STOCK' again.
 * 9. Order creation (createPaymentOrder) succeeds normally.
 * 10. Admin updateProduct payload respects inStock update.
 */
import dotenv from 'dotenv';
dotenv.config();

process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.SMTP_FROM = '';

const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../config/db.js');
const { Product } = await import('../models/Product.js');
const { User } = await import('../models/User.js');
const { Order } = await import('../models/Order.js');
const { listProducts, getProduct } = await import('../controllers/productController.js');
const { quickUpdateStock, updateProduct, getAdminProduct, listAdminProducts } = await import('../controllers/adminController.js');
const { createPaymentOrder } = await import('../controllers/paymentController.js');

const TAG = 'TEST-STOCK-' + Date.now();

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const run = async (fn, req = {}) => {
  const res = mockRes();
  req.headers = req.headers || { 'x-forwarded-for': '127.0.0.1' };
  req.ip = req.ip || '127.0.0.1';
  let err = null;
  await fn(req, res, (e) => { err = e; });
  if (err) return { status: err.statusCode || 500, code: err.code, message: err.message, err };
  return { status: res.statusCode, body: res.body, res };
};

const main = async () => {
  console.log('================================================================');
  console.log('🧪 STOCK STATUS & FULFILLMENT CONTROL REGRESSION TEST');
  console.log('================================================================\n');

  await connectDB();

  // Test admin and user
  const adminUser = { id: new mongoose.Types.ObjectId(), _id: new mongoose.Types.ObjectId(), role: 'admin', email: 'admin@apexvouchers.in' };
  const customerUser = await User.create({
    name: 'Stock Test User',
    email: `${TAG.toLowerCase()}@apexvouchers.test`,
    phone: '+919876543210',
    passwordHash: 'dummy_hash_for_test_purposes',
    role: 'user',
  });

  const cleanup = async () => {
    await Product.deleteMany({ name: new RegExp(TAG, 'i') });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Order.deleteMany({ 'billingDetails.email': new RegExp(TAG, 'i') });
  };

  try {
    // 1. Create test product
    const product = await Product.create({
      name: `${TAG} Exam Voucher`,
      slug: `${TAG.toLowerCase()}-voucher`,
      provider: 'Pearson',
      brand: 'Pearson PTE',
      category: 'English Language Test',
      sellingPrice: 15000,
      originalPrice: 18000,
      active: true,
      stockType: 'LIMITED',
    });

    ok(product.inStock === true, '1. New product defaults to inStock: true in DB');

    // 2. Public API reports IN STOCK
    const publicDetail = await run(getProduct, { params: { id: product.slug } });
    ok(publicDetail.status === 200 && publicDetail.body?.data?.inStock === true, '2a. Public getProduct reports inStock: true');
    ok(publicDetail.body?.data?.stockStatus === 'IN STOCK', '2b. Public getProduct reports stockStatus: "IN STOCK"');

    const publicList = await run(listProducts, { query: { search: TAG } });
    const foundInList = (publicList.body?.data || []).find((p) => String(p._id) === String(product._id));
    ok(foundInList?.inStock === true && foundInList?.stockStatus === 'IN STOCK', '2c. Public listProducts reports inStock: true & "IN STOCK"');

    // 3. Admin marks product Out of Stock via quickUpdateStock
    const quickRes = await run(quickUpdateStock, {
      user: adminUser,
      params: { id: String(product._id) },
      body: { inStock: false },
    });
    ok(quickRes.status === 200 && quickRes.body?.data?.inStock === false, '3. quickUpdateStock marks product inStock: false');

    // 4. Verify DB persistence
    const reloaded = await Product.findById(product._id);
    ok(reloaded.inStock === false, '4. DB document has inStock: false persistently saved');

    // 5. Public API reports OUT OF STOCK
    const publicDetailOos = await run(getProduct, { params: { id: product.slug } });
    ok(publicDetailOos.status === 200 && publicDetailOos.body?.data?.inStock === false, '5a. Public getProduct reports inStock: false');
    ok(publicDetailOos.body?.data?.stockStatus === 'OUT OF STOCK', '5b. Public getProduct reports stockStatus: "OUT OF STOCK"');

    const publicListOos = await run(listProducts, { query: { search: TAG } });
    const foundInListOos = (publicListOos.body?.data || []).find((p) => String(p._id) === String(product._id));
    ok(foundInListOos?.inStock === false && foundInListOos?.stockStatus === 'OUT OF STOCK', '5c. Public listProducts reports inStock: false & "OUT OF STOCK"');

    // 6. Direct purchase attempt is rejected by backend
    const buyAttempt = await run(createPaymentOrder, {
      user: { id: customerUser._id, role: 'customer' },
      body: {
        items: [{ productId: String(product._id), quantity: 1 }],
        paymentMethod: 'upi',
        billing: { name: customerUser.name, email: customerUser.email, phone: customerUser.phone },
      },
    });
    ok(buyAttempt.status === 400, '6a. Purchase attempt rejected with HTTP 400', `got ${buyAttempt.status}`);
    ok(buyAttempt.code === 'PRODUCT_OUT_OF_STOCK', '6b. Error code is PRODUCT_OUT_OF_STOCK', `got ${buyAttempt.code}`);
    ok(buyAttempt.message === 'This product is currently out of stock.', '6c. Error message is "This product is currently out of stock."', buyAttempt.message);

    // 7. Admin restores product to In Stock
    const restoreRes = await run(quickUpdateStock, {
      user: adminUser,
      params: { id: String(product._id) },
      body: { inStock: true },
    });
    ok(restoreRes.status === 200 && restoreRes.body?.data?.inStock === true, '7. quickUpdateStock restores product inStock: true');

    // 8. Public API reports IN STOCK again
    const publicDetailRestored = await run(getProduct, { params: { id: product.slug } });
    ok(publicDetailRestored.body?.data?.inStock === true && publicDetailRestored.body?.data?.stockStatus === 'IN STOCK', '8. Public API reports inStock: true & "IN STOCK" after restore');

    // 9. Purchasing works normally again
    // Mock Razorpay order creation for createPaymentOrder
    const realFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (String(url).includes('api.razorpay.com/v1/orders')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `order_${TAG}_1`, amount: 1500000, currency: 'INR', status: 'created' }),
        };
      }
      return realFetch(url, opts);
    };

    const buyAllowed = await run(createPaymentOrder, {
      user: { id: customerUser._id, _id: customerUser._id, role: 'user' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: {
        items: [{ productId: String(product._id), quantity: 1 }],
        paymentMethod: 'upi',
        billing: { name: customerUser.name, email: customerUser.email, phone: customerUser.phone },
      },
    });
    ok((buyAllowed.status === 200 || buyAllowed.status === 201) && buyAllowed.body?.success === true, '9. Purchase attempt succeeds when product is back in stock', buyAllowed.message || JSON.stringify(buyAllowed.body || {}));
    global.fetch = realFetch;

    // 10. Admin updateProduct also updates inStock
    const updateRes = await run(updateProduct, {
      user: adminUser,
      params: { id: String(product._id) },
      body: { inStock: false },
    });
    ok(updateRes.status === 200 && updateRes.body?.data?.inStock === false, '10. updateProduct persists inStock: false');

    const adminCheck = await run(getAdminProduct, { user: adminUser, params: { id: String(product._id) } });
    ok(adminCheck.body?.data?.inStock === false && adminCheck.body?.data?.stockStatus === 'OUT OF STOCK', '11. getAdminProduct reports inStock: false & "OUT OF STOCK"');

    const adminList = await run(listAdminProducts, { user: adminUser, query: { status: 'out_of_stock' } });
    const inOosList = (adminList.body?.data || []).some((p) => String(p._id) === String(product._id));
    ok(inOosList, '12. listAdminProducts with status=out_of_stock includes the manually out-of-stock product');

    // 13. Restore back to inStock: true (with 0 voucher inventory)
    await run(quickUpdateStock, {
      user: adminUser,
      params: { id: String(product._id) },
      body: { inStock: true },
    });
    const adminCheckInStock = await run(getAdminProduct, { user: adminUser, params: { id: String(product._id) } });
    ok(adminCheckInStock.body?.data?.inStock === true && adminCheckInStock.body?.data?.stockStatus === 'IN STOCK', '13. getAdminProduct reports inStock: true & "IN STOCK" even with 0 voucher codes');

    const adminListAll = await run(listAdminProducts, { user: adminUser, query: { search: TAG } });
    const foundInAdminList = (adminListAll.body?.data || []).find((p) => String(p._id) === String(product._id));
    ok(foundInAdminList?.inStock === true && foundInAdminList?.stockStatus === 'IN STOCK', '14. listAdminProducts reports inStock: true & "IN STOCK" even with 0 voucher codes');
    ok(foundInAdminList?.availableVouchers === 0, '15. availableVouchers is 0 but does not force out of stock');

  } finally {
    await cleanup();
    await mongoose.disconnect();
  }

  console.log(`\n================================================================`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log('================================================================');
  process.exit(fail ? 1 : 0);
};

main().catch((e) => {
  console.error('Test runner failed:', e);
  process.exit(1);
});
