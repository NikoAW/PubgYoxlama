import { db, auth, call } from './firebase.js';
import { login, logout, watch } from './auth.js';
import { analyze } from './analysis.js';
import { ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const root = document.getElementById('app');
const WA = '994703193444';
const ST = { WAITING: 'KOD GÖZLƏYİR', STARTED: 'SCAN BAŞLADI', TRANSFERRING: 'MƏLUMATLAR ÖTÜRÜLÜR', INCOMPLETE: 'MƏLUMATLAR TAM ÖTÜRÜLMƏYİB', COMPLETED: 'SCAN TAMAMLANDI', EXPIRED: 'MÜDDƏTİ BİTDİ' };
const DEF_PLANS = { free: { name: 'PULSUZ', limit: 2, price: 0 }, standard: { name: 'STANDART', limit: 15, price: 0 }, business: { name: 'BİZNES', limit: -1, price: 0 } };
const h = (t, a = {}, ...c) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v); e.append(...c.flat().filter(x => x != null)); return e; };
const show = (...n) => root.replaceChildren(...n);
const toast = m => { const t = h('div', { class: 'toast' }, m); document.body.append(t); setTimeout(() => t.remove(), 3800); };
const go = v => { location.hash = v; };
const wa = t => `https://wa.me/${WA}?text=${encodeURIComponent(t)}`;
const err = e => toast(e?.message?.replace(/^.*?:\s*/, '') || 'Xəta baş verdi');
const loading = () => show(h('div', { class: 'center' }, h('div', { class: 'spin' }), h('p', {}, 'YÜKLƏNİR...')));
let user = null, subs = [], q = '', flt = '', asc = false;
const clear = () => { subs.forEach(f => f()); subs = []; };
const listen = (path, cb) => subs.push(onValue(ref(db, path), s => cb(s.val()), e => err(e)));

watch(u => { user = u; render(); });
window.addEventListener('hashchange', render);

function render() {
  clear();
  const [v, arg] = (location.hash.slice(1) || 'home').split('/');
  if (v === 'join') return joinView();
  if (['dash', 'plans', 'detail'].includes(v) && !user) return go('login');
  ({ home: homeView, login: loginView, plans: plansView, dash: dashView, detail: () => detailView(arg) }[v] || homeView)();
}

function homeView() {
  show(h('div', { class: 'home' },
    h('div', { class: 'glass contact' }, h('b', {}, 'ƏLAQƏ / WHATSAPP'), h('span', {}, 'Suallarınızın cavabı üçün:'), h('a', { href: wa('Salam'), target: '_blank' }, '+994 70 319 34 44')),
    h('div', { class: 'logo' }, 'SafeCheck'),
    h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => go('join') }, "SCAN'A QOŞUL"), h('button', { class: 'btn primary', onclick: () => go(user ? 'dash' : 'login') }, 'SCAN YARAT')),
    h('div', { class: 'foot' }, 'Developed by NB Dev')));
}

function joinView() {
  show(h('div', { class: 'home' }, h('div', { class: 'glass card' },
    h('h2', {}, 'SCAN KODUNU DAXİL EDİN'),
    h('p', {}, 'Cihaz yoxlaması yalnız SafeCheck Android tətbiqində aparılır. Kodu tətbiqdə daxil edin.'),
    h('a', { class: 'btn primary', href: 'https://github.com/NikoAW/PubgYoxlama/actions', target: '_blank' }, 'ANDROID TƏTBİQİNİ YÜKLƏ'),
    h('button', { class: 'btn', onclick: () => go('home') }, 'GERİ'))));
}

function loginView() {
  show(h('div', { class: 'home' }, h('div', { class: 'glass card' },
    h('h2', {}, 'Google ilə 1 kliklə giriş edin.'), h('p', {}, 'Hesab məlumatlarınız təhlükəsiz saxlanılır.'),
    h('button', { class: 'btn primary', onclick: () => login().then(() => go('dash')).catch(err) }, 'GOOGLE İLƏ GİRİŞ'),
    h('button', { class: 'btn', onclick: () => go('home') }, 'GERİ'))));
}

async function plansView() {
  loading();
  try { await call('ensureUser'); } catch (e) { return err(e); }
  listen('plans', p => {
    const plans = p || DEF_PLANS;
    show(h('div', { class: 'wrap' }, h('h2', {}, 'PLAN SEÇİN'),
      h('div', { class: 'grid' }, Object.entries(plans).map(([k, v]) => h('div', { class: 'glass card' },
        h('h3', {}, v.name), h('div', { class: 'big' }, v.limit === -1 ? 'LİMİTSİZ' : v.limit + ' SCAN'),
        h('p', {}, k === 'business' ? 'Alıcı cihazı aldıqdan sonra satıcı eyni cihazı yenidən yoxlaya bilər.' : ' '),
        h('p', {}, v.price ? v.price + ' AZN' : (k === 'free' ? 'PULSUZ' : 'Qiymət üçün əlaqə')),
        h('button', { class: 'btn primary', onclick: async () => {
          try { const r = await call('choosePlan', { plan: k });
            if (r.needsAdmin) { window.open(wa(`Salam, ${v.name} planı istəyirəm.`), '_blank'); toast('Plan admin təsdiqindən sonra aktiv olacaq.'); }
            go('dash'); } catch (e) { err(e); } } }, 'ƏLDƏ ET')))),
      h('button', { class: 'btn', onclick: () => go('dash') }, 'GERİ')));
  });
}

function dashView() {
  loading();
  call('ensureUser').then(() => {
    const uid = user.uid;
    let u = null, codes = {}, notes = {};
    const draw = () => {
      if (!u) return;
      if (!u.planChosen) return go('plans');
      const now = Date.now();
      const active = Object.entries(codes).filter(([, c]) => ['STARTED', 'TRANSFERRING'].includes(c.status) || (c.status === 'WAITING' && c.expiresAt > now));
      let hist = Object.entries(codes).filter(([k, c]) => k.includes(q.toUpperCase()) && (!flt || c.status === flt));
      hist.sort((a, b) => asc ? a[1].createdAt - b[1].createdAt : b[1].createdAt - a[1].createdAt);
      const note = Object.values(notes).sort((a, b) => b.ts - a.ts).slice(0, 3);
      show(h('div', { class: 'wrap' },
        h('div', { class: 'glass hero' }, h('b', {}, 'PLAN: ' + u.plan.toUpperCase()), h('div', { class: 'big' }, u.remaining === -1 ? 'LİMİTSİZ YOXLAMA' : `${u.remaining} SCAN QALIB`),
          u.plan === 'free' ? h('button', { class: 'btn primary', onclick: () => go('plans') }, 'PLANINI YÜKSƏLT') : null,
          h('button', { class: 'btn', onclick: () => logout().then(() => go('home')) }, 'ÇIXIŞ')),
        u.disabled ? h('div', { class: 'warn' }, 'HESABINIZ DEAKTİV EDİLİB') : null,
        h('div', { class: 'warn' }, 'YARADILAN KODLARI BİR NƏFƏRƏ GÖNDƏRİN. QARIŞIQLIQ OLMASIN. KODU GÖNDƏRMƏZDƏN ƏVVƏL TELEFON MARKASINI SORUŞUN.'),
        note.map(n => h('div', { class: 'glass note' }, n.text)),
        h('button', { class: 'btn primary big-btn', onclick: () => call('createScan').then(r => toast('Yeni kod: ' + r.code)).catch(err) }, 'YENİ SCAN YARAT'),
        h('h3', {}, 'AKTİV KODLAR'),
        active.length ? active.map(([k, c]) => h('div', { class: 'glass row' }, h('b', {}, k), h('span', {}, ST[c.status]),
          c.status === 'WAITING' ? h('span', {}, 'Bitir: ' + new Date(c.expiresAt).toLocaleTimeString()) : null,
          h('button', { class: 'btn sm', onclick: () => navigator.clipboard.writeText(k).then(() => toast('Kopyalandı')) }, 'KOPYALA'))) : h('p', { class: 'muted' }, 'Aktiv kod yoxdur.'),
        h('h3', {}, 'ƏVVƏLKİ SCANLAR'),
        h('div', { class: 'tools' },
          h('input', { placeholder: 'Kod axtar', value: q, oninput: e => { q = e.target.value; draw(); } }),
          h('select', { onchange: e => { flt = e.target.value; draw(); } }, h('option', { value: '' }, 'Bütün statuslar'), Object.entries(ST).map(([k, v]) => h('option', { value: k, ...(flt === k ? { selected: '' } : {}) }, v))),
          h('button', { class: 'btn sm', onclick: () => { asc = !asc; draw(); } }, asc ? 'TARİX ↑' : 'TARİX ↓')),
        hist.map(([k, c]) => h('div', { class: 'glass row' }, h('b', {}, 'KOD: ' + k),
          h('span', {}, (c.status === 'COMPLETED' ? '✓ ' : '') + (c.status === 'INCOMPLETE' ? 'İSTİFADƏÇİ SCAN-DAN YAYINIR' : ST[c.status])),
          h('button', { class: 'btn sm', onclick: () => go('detail/' + k) }, 'ƏTRAFLI BAX')))));
    };
    listen('users/' + uid, v => { u = v; draw(); });
    listen('userCodes/' + uid, v => { codes = v || {}; draw(); });
    listen('notifications/' + uid, v => { notes = v || {}; draw(); });
  }).catch(err);
}

async function detailView(code) {
  loading();
  try {
    const s = (await get(ref(db, 'scans/' + code))).val();
    const back = h('button', { class: 'btn', onclick: () => go('dash') }, 'GERİ');
    if (!s) return show(h('div', { class: 'wrap' }, h('h2', {}, 'KOD: ' + code), h('p', {}, 'Bu kod üçün hələ nəticə yoxdur.'), back));
    const dev = h('div', { class: 'glass card hidden' }, h('p', {}, s.device || 'Dəqiq cihaz modeli müəyyən edilmədi.'));
    const head = [h('h2', {}, 'KOD: ' + code), h('p', { class: 'big' }, 'Cihaz: ' + (s.device || 'Dəqiq cihaz modeli müəyyən edilmədi.')),
      h('button', { class: 'btn', onclick: () => dev.classList.toggle('hidden') }, 'CİHAZ MƏLUMATLARINA BAX'), dev];
    if (!s.complete) return show(h('div', { class: 'wrap' }, head, h('div', { class: 'warn' }, 'İSTİFADƏÇİ SCAN-DAN YAYINIR'), h('p', {}, 'İstifadəçi məlumatları tam ötürməyib. Yoxlama nəticəsi etibarlı hesab edilə bilməz. Risk skoru hesablanmadı.'), back));
    show(h('div', { class: 'wrap' }, head,
      h('div', { class: 'glass hero' }, h('div', { class: 'big' }, `RİSK SKORU: ${s.score} / 100`), h('div', { class: 'bar' }, h('i', { style: `width:${s.score}%` })), h('b', {}, s.level),
        s.warn ? h('div', { class: 'warn' }, s.warn) : null),
      h('p', {}, analyze(s, code)),
      h('h3', {}, 'SƏBƏBLƏR'),
      s.reasons.map(r => h('div', { class: 'glass row' + (r.state === 'aşkarlandı' ? ' hit' : '') }, h('b', {}, r.label), h('span', {}, r.state === 'aşkarlandı' ? `+${r.pts}` : r.state.charAt(0).toUpperCase() + r.state.slice(1)))),
      h('p', { class: 'muted' }, 'Risk göstəriciləri cheat istifadəsinin qəti sübutu deyil.'), back));
  } catch (e) { err(e); go('dash'); }
      }
