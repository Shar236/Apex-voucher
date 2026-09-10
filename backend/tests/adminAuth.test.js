/**
 * Admin authentication & authorization regression suite.
 *
 * Verifies the production login + admin-guard chain that gates /admin:
 *   login  ->  comparePassword (bcrypt)  ->  JWT { id, role }
 *   /api/admin/*  ->  protect (401 without/!bad token)  ->  requireRole('admin') (403 for non-admins)
 *
 * Also asserts the live admin account (admin@apexvouchers.in) is in a
 * loginable admin state and that no endpoint ever serialises `passwordHash`.
 *
 * Uses throwaway fixture accounts with a known password (a test constant, not a
 * real secret) — the real admin's rotated password is never known to this suite.
 * Runs against the configured MongoDB. No email is sent (SMTP forced off).
 *
 *   node backend/tests/adminAuth.test.js
 */
import dotenv from 'dotenv';
dotenv.config();

process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.SMTP_FROM = '';

const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../config/db.js');
const { config } = await import('../config/index.js');
const { User } = await import('../models/User.js');
const { hashPassword, signToken, protect, requireRole } = await import('../middleware/auth.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { login } = await import('../controllers/authController.js');
const { listUsers } = await import('../controllers/adminController.js');

const TAG = 'test-adminauth';
const FIXTURE_PW = 'Fixture#Admin$2026xYz';

let pass = 0;
let fail = 0;
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

// Run an express-style handler with a mock req/res, capturing next(err).
const invoke = async (handler, req) => {
  const res = mockRes();
  let err = null;
  await handler({ headers: {}, query: {}, ip: '127.0.0.1', ...req }, res, (e) => { err = e || null; });
  return { res, err, status: err?.statusCode || res.statusCode, code: err?.code || res.body?.code };
};

// Map a next(err) through the real errorHandler to get the HTTP status/code
// express would actually send (JWT errors carry no statusCode of their own).
const resolveErr = (err) => {
  const res = mockRes();
  errorHandler(err, {}, res, () => {});
  return { status: res.statusCode, code: res.body?.code };
};

// Walk the [protect, requireRole('admin')] chain the way express would.
const runAdminGuard = async (req) => {
  const chain = [protect, requireRole('admin')];
  const r = { headers: {}, query: {}, ...req };
  const res = mockRes();
  for (const mw of chain) {
    let captured = null;
    let advanced = false;
    // eslint-disable-next-line no-await-in-loop
    await mw(r, res, (e) => { if (e) captured = e; else advanced = true; });
    if (captured) return { ok: false, ...resolveErr(captured), req: r };
    if (!advanced) return { ok: false, status: res.statusCode, code: res.body?.code, req: r };
  }
  return { ok: true, req: r };
};

const cleanup = () => User.deleteMany({ email: new RegExp(`^${TAG}`, 'i') });

const runTests = async () => {
  console.log('\n================================================================');
  console.log('🧪 ADMIN AUTH & AUTHORIZATION');
  console.log('================================================================\n');
  await connectDB();
  await cleanup();

  const passwordHash = await hashPassword(FIXTURE_PW);
  const admin = await User.create({
    name: 'Fixture Admin', email: `${TAG}-admin@apex-test.local`, phone: `9${String(Date.now()).slice(-9)}`,
    passwordHash, role: 'admin', status: 'active', emailVerified: true,
  });
  const customer = await User.create({
    name: 'Fixture Customer', email: `${TAG}-cust@apex-test.local`, phone: `8${String(Date.now()).slice(-9)}`,
    passwordHash, role: 'user', status: 'active', emailVerified: true,
  });
  const disabledAdmin = await User.create({
    name: 'Fixture Disabled', email: `${TAG}-old@apex-test.local`, phone: `7${String(Date.now()).slice(-9)}`,
    passwordHash, role: 'admin', status: 'disabled', emailVerified: true,
  });

  // ── 1. login ───────────────────────────────────────────────────────────
  console.log('— login —');
  {
    const good = await invoke(login, { body: { email: admin.email, password: FIXTURE_PW } });
    ok(good.res.body?.success === true && !!good.res.body?.token, 'correct admin credentials → 200 + token');
    ok(good.res.body?.user?.role === 'admin', 'login response carries role=admin');
    ok(!JSON.stringify(good.res.body || {}).includes('passwordHash'), 'login response does NOT contain passwordHash');

    const wrong = await invoke(login, { body: { email: admin.email, password: 'wrong-password-123' } });
    ok(wrong.status === 401 && wrong.code === 'INVALID_CREDENTIALS', 'wrong password → 401 INVALID_CREDENTIALS', `got ${wrong.status}/${wrong.code}`);

    const disabled = await invoke(login, { body: { email: disabledAdmin.email, password: FIXTURE_PW } });
    ok(disabled.status === 403 && disabled.code === 'ACCOUNT_DISABLED', 'disabled admin (old account) → 403 ACCOUNT_DISABLED', `got ${disabled.status}/${disabled.code}`);

    const nouser = await invoke(login, { body: { email: `${TAG}-ghost@apex-test.local`, password: FIXTURE_PW } });
    ok(nouser.status === 401 && nouser.code === 'INVALID_CREDENTIALS', 'unknown email → 401 INVALID_CREDENTIALS');
  }

  // ── 2. protectAdmin chain ──────────────────────────────────────────────
  console.log('\n— protectAdmin (backend authoritative guard) —');
  {
    const noToken = await runAdminGuard({ headers: {} });
    ok(noToken.ok === false && noToken.status === 401 && noToken.code === 'NO_TOKEN', 'no token → 401 NO_TOKEN', `got ${noToken.status}/${noToken.code}`);

    const badToken = await runAdminGuard({ headers: { authorization: 'Bearer not.a.jwt' } });
    ok(badToken.ok === false && badToken.status === 401, 'garbage token → 401', `got ${badToken.status}`);

    const custToken = signToken({ id: customer.id, role: customer.role });
    const custTry = await runAdminGuard({ headers: { authorization: `Bearer ${custToken}` } });
    ok(custTry.ok === false && custTry.status === 403 && custTry.code === 'FORBIDDEN', 'authenticated non-admin → 403 FORBIDDEN', `got ${custTry.status}/${custTry.code}`);

    const disToken = signToken({ id: disabledAdmin.id, role: 'admin' });
    const disTry = await runAdminGuard({ headers: { authorization: `Bearer ${disToken}` } });
    ok(disTry.ok === false && disTry.status === 401, 'disabled admin token → 401 (rejected by protect)', `got ${disTry.status}/${disTry.code}`);

    const adminToken = signToken({ id: admin.id, role: admin.role });
    const adminTry = await runAdminGuard({ headers: { authorization: `Bearer ${adminToken}` } });
    ok(adminTry.ok === true && adminTry.req.user?.role === 'admin', 'valid admin token → passes, req.user.role === admin');
    ok(adminTry.req.user && adminTry.req.user.passwordHash === undefined, 'req.user has no passwordHash attached');

    // Reach a real admin controller with the resolved admin req.
    if (adminTry.ok) {
      const listed = await invoke(listUsers, { user: adminTry.req.user, query: {} });
      ok(listed.res.body?.success === true, 'admin can call a protected admin endpoint (listUsers)');
      ok(!JSON.stringify(listed.res.body || {}).includes('passwordHash'), 'admin endpoint response does NOT contain passwordHash');
    }
  }

  // ── 3. live admin account state ────────────────────────────────────────
  const targetAdminEmail = (config.admin.email || 'admin@apexvouchers.in').toLowerCase();
  console.log(`\n— live admin account (${targetAdminEmail}) —`);
  {
    const live = await User.findOne({ email: targetAdminEmail }).select('+passwordHash');
    ok(!!live, `${targetAdminEmail} exists`);
    if (live) {
      ok(live.role === 'admin', 'role === admin');
      ok(live.status === 'active', 'status === active');
      ok(live.emailVerified === true, 'emailVerified === true (login gate passes)');
      ok(/^\$2[aby]\$\d\d\$/.test(live.passwordHash || ''), 'passwordHash is a bcrypt hash');
      ok(!JSON.stringify(live.toJSON()).includes('passwordHash'), 'toJSON() strips passwordHash');
      // Ignore ephemeral test fixtures other suites may leave behind
      // (test-* / @apex-test.local). The real invariant: one production admin.
      const activeAdmins = await User.find({ role: 'admin', status: 'active' }).select('email').lean();
      const real = activeAdmins.filter(
        (a) => !/@apex-test\.local$/i.test(a.email) && !/^test-/i.test(a.email)
      );
      ok(
        real.length === 1 && real[0].email === targetAdminEmail,
        `the only non-fixture ACTIVE admin is ${targetAdminEmail}`,
        `real active admins: ${real.map((a) => a.email).join(', ') || 'none'}`
      );
    }
  }

  await cleanup();
  await mongoose.disconnect();
  console.log(`\n================================================================`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log('================================================================');
  process.exit(fail ? 1 : 0);
};

runTests().catch(async (e) => {
  console.error(e);
  try { await cleanup(); await mongoose.disconnect(); } catch {}
  process.exit(1);
});
