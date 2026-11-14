import { call } from './firebase.js';
import { login, logout, watch } from './auth.js';
const root = document.getElementById('app');
const h = (t, a = {}, ...c) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v); e.append(...c.flat().filter(x => x != null)); return e; };
const toast = m => { const t = h('div', { class: 'toast' }, m); document.body.append(t); setTimeout(() => t.remove(), 3500); };
const run = async (fn, ...a) => { try { return await call(fn, ...a); } catch (e) { toast(e.message); } };
watch(u => u ? panel() : root.replaceChildren(h('div', { class: 'home' }, h('div', { class: 'logo' }, 'Admin'), h('button', { class: 'btn primary', onclick: () => login().catch(e => toast(e.message)) }, 'GOOGLE İLƏ GİRİŞ'))));
async function panel() {
  const r = await run('adminListUsers'); if (!r) return root.replaceChildren(h('div', { class: 'home' }, h('p', {}, 'Admin icazəsi yoxdur.'), h('button', { class: 'btn', onclick: logout }, 'ÇIXIŞ')));
  const sel = (uid, cur) => { const s = h('select', {}, ['free', 'standard', 'business'].map(p => h('option', { value: p, ...(p === cur ? { selected: '' } : {}) }, p))); s.onchange = async () => { await run('adminSetPlan', { uid, plan: s.value }); toast('Plan dəyişdi'); }; return s; };
  const out = h('pre', { class: 'glass card' }, '');
  const code = h('input', { placeholder: 'SCAN-XXXXXX' });
  root.replaceChildren(h('div', { class: 'wrap' }, h('h2', {}, 'ADMİN PANEL'), h('button', { class: 'btn sm', onclick: logout }, 'ÇIXIŞ'),
    h('h3', {}, 'PLAN QİYMƏTLƏRİ / LİMİTLƏR'),
    ['free', 'standard', 'business'].map(p => { const pr = h('input', { placeholder: p + ' qiymət' }), li = h('input', { placeholder: 'limit (-1 limitsiz)' });
      return h('div', { class: 'tools' }, h('b', {}, p), pr, li, h('button', { class: 'btn sm', onclick: async () => { await run('adminSetPlanConfig', { plan: p, price: pr.value, limit: li.value }); toast('Yadda saxlandı'); } }, 'SAXLA')); }),
    h('h3', {}, 'İSTİFADƏÇİLƏR'),
    r.users.map(u => h('div', { class: 'glass row' }, h('b', {}, u.email || u.uid), sel(u.uid, u.plan), h('span', {}, 'qalıb: ' + u.remaining), u.request ? h('span', { class: 'warn' }, 'İstək: ' + u.request.plan) : null,
      h('button', { class: 'btn sm', onclick: async () => { await run('adminDisable', { uid: u.uid, disabled: !u.disabled }); toast('Yeniləndi'); panel(); } }, u.disabled ? 'AKTİV ET' : 'DEAKTİV ET'))),
    h('h3', {}, 'KOD AXTAR'), code, h('button', { class: 'btn', onclick: async () => { const d = await run('adminSearchCode', { code: code.value }); out.textContent = JSON.stringify(d, null, 2); } }, 'AXTAR'), out));
}
