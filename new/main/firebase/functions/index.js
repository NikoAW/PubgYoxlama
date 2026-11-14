const admin = require('firebase-admin');
admin.initializeApp();
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { RULES, evaluate } = require('./risk');

const db = () => admin.database();
const TTL = 60 * 60 * 1000;
const DEFAULT_PLANS = {
  free: { name: 'PULSUZ', limit: 2, price: 0 },
  standard: { name: 'STANDART', limit: 15, price: 0 },
  business: { name: 'BİZNES', limit: -1, price: 0 }
};
const E = (c, m) => new HttpsError(c, m);
const uidOf = r => { if (!r.auth) throw E('unauthenticated', 'Giriş tələb olunur'); return r.auth.uid; };
const isGoogle = r => r.auth.token.firebase.sign_in_provider === 'google.com';
const isAdmin = async uid => (await db().ref('admins/' + uid).get()).val() === true;
const adminOnly = async r => { if (!(await isAdmin(uidOf(r)))) throw E('permission-denied', 'Admin icazəsi yoxdur'); };
const getPlans = async () => (await db().ref('plans').get()).val() || DEFAULT_PLANS;

async function ensureUser(r) {
  const uid = uidOf(r);
  const plans = await getPlans();
  const t = await db().ref('users/' + uid).transaction(u => u || {
    email: r.auth.token.email || null, plan: 'free', remaining: plans.free.limit,
    planChosen: false, disabled: false, createdAt: Date.now()
  });
  return t.snapshot.val();
}

async function notify(owner, code, status) {
  const text = status === 'COMPLETED' ? `${code}: SCAN TAMAMLANDI` : `${code}: İSTİFADƏÇİ SCAN-DAN YAYINIR`;
  await db().ref('notifications/' + owner).push({ code, status, text, ts: Date.now() });
  try {
    const tok = (await db().ref('users/' + owner + '/fcmToken').get()).val();
    if (tok) await admin.messaging().send({ token: tok, notification: { title: 'SafeCheck', body: text } });
  } catch (e) { /* bildiriş çatmasa da panelə yazılıb */ }
}

exports.ensureUser = onCall(async r => {
  if (!(await db().ref('plans').get()).exists()) await db().ref('plans').set(DEFAULT_PLANS);
  const u = await ensureUser(r);
  return { plan: u.plan };
});

exports.choosePlan = onCall(async r => {
  const uid = uidOf(r); const plan = r.data.plan;
  const u = await ensureUser(r);
  if (u.disabled) throw E('permission-denied', 'Hesab deaktivdir');
  if (!['free', 'standard', 'business'].includes(plan)) throw E('invalid-argument', 'Plan səhvdir');
  if (plan === 'free') await db().ref('users/' + uid + '/planChosen').set(true);
  else await db().ref('planRequests/' + uid).set({ plan, email: u.email || null, ts: Date.now() });
  return { ok: true, needsAdmin: plan !== 'free' };
});

exports.createScan = onCall(async r => {
  const uid = uidOf(r);
  if (!isGoogle(r)) throw E('permission-denied', 'Google ilə giriş lazımdır');
  const u = await ensureUser(r);
  if (u.disabled) throw E('permission-denied', 'Hesab deaktivdir');
  const dec = await db().ref('users/' + uid + '/remaining').transaction(v => (v === -1 ? v : v > 0 ? v - 1 : undefined));
  if (!dec.committed) throw E('resource-exhausted', 'Scan limitiniz bitib. Planınızı yüksəldin.');
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = null;
  for (let i = 0; i < 25 && !code; i++) {
    const c = 'SCAN-' + Array.from({ length: 6 }, () => A[Math.floor(Math.random() * 26)]).join('');
    const now = Date.now();
    const t = await db().ref('scanCodes/' + c).transaction(x => (x === null ? { owner: uid, status: 'WAITING', createdAt: now, expiresAt: now + TTL } : undefined));
    if (t.committed) { code = c; await db().ref('userCodes/' + uid + '/' + c).set({ status: 'WAITING', createdAt: now, expiresAt: now + TTL }); }
  }
  if (!code) { await db().ref('users/' + uid + '/remaining').transaction(v => (v === -1 ? v : (v || 0) + 1)); throw E('internal', 'Kod yaradıla bilmədi'); }
  return { code };
});

exports.joinScan = onCall(async r => {
  const uid = uidOf(r);
  const code = String(r.data.code || '').trim().toUpperCase();
  if (!/^SCAN-[A-Z]{6}$/.test(code)) throw E('invalid-argument', 'Kod formatı səhvdir');
  const ref = db().ref('scanCodes/' + code);
  if (!(await ref.get()).exists()) throw E('not-found', 'Kod mövcud deyil');
  let reason = null;
  const t = await ref.transaction(c => {
    reason = null;
    if (c === null) return null;
    const now = Date.now();
    if (c.joiner) {
      if (c.joiner !== uid) { reason = 'Kod artıq istifadə olunub'; return; }
      if (c.status === 'COMPLETED') { reason = 'Bu scan artıq tamamlanıb'; return; }
      return c;
    }
    if (c.status === 'EXPIRED' || c.expiresAt < now) { reason = 'Kodun müddəti bitib'; c.status = 'EXPIRED'; return c; }
    c.joiner = uid; c.status = 'STARTED'; c.startedAt = now;
    return c;
  });
  const c = t.snapshot.val();
  if (reason) {
    if (c && c.status === 'EXPIRED') await db().ref('userCodes/' + c.owner + '/' + code + '/status').set('EXPIRED');
    throw E('failed-precondition', reason);
  }
  await db().ref('userCodes/' + c.owner + '/' + code + '/status').set(c.status);
  return { ok: true };
});

exports.submitResult = onCall(async r => {
  const uid = uidOf(r);
  const { code, results, complete, device } = r.data || {};
  const c = (await db().ref('scanCodes/' + code).get()).val();
  if (!c || c.joiner !== uid) throw E('permission-denied', 'Bu koda icazəniz yoxdur');
  if (c.status === 'COMPLETED') throw E('failed-precondition', 'Scan artıq tamamlanıb');
  const clean = {};
  for (const k of Object.keys(RULES)) clean[k] = typeof (results || {})[k] === 'boolean' ? results[k] : null;
  const ev = evaluate(clean, !!complete);
  const status = complete ? 'COMPLETED' : 'INCOMPLETE';
  const now = Date.now();
  await db().ref().update({
    ['scans/' + code]: { owner: c.owner, device: String(device || '').slice(0, 80) || null, results: clean, complete: !!complete,
      score: ev.score, level: ev.level || null, warn: ev.warn || null, reasons: ev.reasons, finishedAt: now },
    ['scanCodes/' + code + '/status']: status,
    ['userCodes/' + c.owner + '/' + code + '/status']: status,
    ['userCodes/' + c.owner + '/' + code + '/score']: ev.score,
    ['deviceRecords/' + code]: { device: String(device || '').slice(0, 80) || null, owner: c.owner, ts: now }
  });
  await notify(c.owner, code, status);
  return { status, score: ev.score };
});

exports.reportAbandon = onCall(async r => {
  const uid = uidOf(r); const code = String(r.data.code || '');
  const c = (await db().ref('scanCodes/' + code).get()).val();
  if (!c || c.joiner !== uid || !['STARTED', 'TRANSFERRING'].includes(c.status)) return { ok: false };
  await db().ref().update({ ['scanCodes/' + code + '/status']: 'INCOMPLETE', ['userCodes/' + c.owner + '/' + code + '/status']: 'INCOMPLETE' });
  await notify(c.owner, code, 'INCOMPLETE');
  return { ok: true };
});

exports.expireCodes = onSchedule('every 5 minutes', async () => {
  const s = await db().ref('scanCodes').orderByChild('status').equalTo('WAITING').get();
  const now = Date.now(), up = {};
  s.forEach(x => { const c = x.val(); if (c.expiresAt < now) { up['scanCodes/' + x.key + '/status'] = 'EXPIRED'; up['userCodes/' + c.owner + '/' + x.key + '/status'] = 'EXPIRED'; } });
  if (Object.keys(up).length) await db().ref().update(up);
});

exports.adminListUsers = onCall(async r => { await adminOnly(r);
  const u = (await db().ref('users').get()).val() || {};
  const req = (await db().ref('planRequests').get()).val() || {};
  return { users: Object.entries(u).map(([uid, v]) => ({ uid, ...v, request: req[uid] || null })) };
});
exports.adminSetPlan = onCall(async r => { await adminOnly(r);
  const { uid, plan } = r.data; const plans = await getPlans();
  if (!plans[plan]) throw E('invalid-argument', 'Plan yoxdur');
  await db().ref('users/' + uid).update({ plan, remaining: plans[plan].limit, planChosen: true });
  await db().ref('planRequests/' + uid).remove();
  return { ok: true };
});
exports.adminSetPlanConfig = onCall(async r => { await adminOnly(r);
  const { plan, price, limit } = r.data; const plans = await getPlans();
  if (!plans[plan]) throw E('invalid-argument', 'Plan yoxdur');
  await db().ref('plans/' + plan).update({ price: Number(price) || 0, limit: Number(limit) });
  return { ok: true };
});
exports.adminDisable = onCall(async r => { await adminOnly(r);
  await db().ref('users/' + r.data.uid + '/disabled').set(!!r.data.disabled); return { ok: true };
});
exports.adminSearchCode = onCall(async r => { await adminOnly(r);
  const code = String(r.data.code || '').toUpperCase();
  return { code: (await db().ref('scanCodes/' + code).get()).val(), scan: (await db().ref('scans/' + code).get()).val() };
});
