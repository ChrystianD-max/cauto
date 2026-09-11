/* C-AUTO SPA — v8 Interface Administrative Complète */
'use strict';

const S = { token: localStorage.getItem('token') || null, user: JSON.parse(localStorage.getItem('user') || 'null') };
let _refreshPromise = null;
const $app = document.getElementById('app');

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function money(c) { return Math.round((Number(c) || 0) / 100).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ') + ' FCFA'; }

/* ====== TOAST ====== */
function toast(msg, type = 'info') {
  const icons = { success: 'check-circle', error: 'alert-circle', warn: 'alert-triangle', info: 'info' };
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.innerHTML = `<i data-lucide="${icons[type]}" class="toast-icon"></i><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 380); }, 4000);
}
function showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

/* ====== API ====== */
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  let res;
  try {
    res = await fetch('/api' + path, { ...opts, body, headers });
  } catch (netErr) {
    if (window.offlineError) throw window.offlineError();
    const e = new Error('Impossible de joindre le serveur. Vérifiez votre connexion.');
    e.isOffline = true; throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && S.token && path !== '/auth/login' && path !== '/auth/refresh' && !opts._refreshed) {
      const got = await tryRefreshToken();
      if (got) return api(path, { ...opts, _refreshed: true });
      forceLogout(401);
    }
    const e = new Error(errFromHttp(data) || ('HTTP ' + res.status));
    e.status = res.status;
    e.code = (data && data.error && typeof data.error === 'object' && data.error.code) || data.code;
    throw e;
  }
  return data;
}
async function tryRefreshToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const r = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.token) return false;
      S.token = d.token;
      localStorage.setItem('token', d.token);
      if (d.user) {
        S.user = { ...(S.user || {}), ...d.user };
        localStorage.setItem('user', JSON.stringify(S.user));
        document.body.setAttribute('data-role', d.user.role || S.user.role || 'CLIENT');
      }
      return true;
    } catch (e) { return false; }
    finally { _refreshPromise = null; }
  })();
  return _refreshPromise;
}
function forceLogout(status) {
  if (status === 401 && S.user) {
    try { fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token } }).catch(() => {}); } catch (e) {}
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  S.token = null; S.user = null;
  document.body.removeAttribute('data-role');
  location.hash = '#/login';
}
function setSession(token, user) { S.token = token; S.user = user; localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); document.body.setAttribute('data-role', user.role || 'CLIENT'); }
function logout() { localStorage.clear(); S.token = null; S.user = null; document.body.removeAttribute('data-role'); location.hash = '#/login'; }

/* ====== HELPERS ====== */
function I(name, cls) { return `<i data-lucide="${name}" class="${cls || ''}"></i>`; }

function certBadge() {
  return `<span class="cert-badge" title="Certifié par C-AUTO"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--cert-blue, #1877F2)"/><circle cx="12" cy="12" r="10.1" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.9"/><path d="M7.4 12.5l3 3.1 6.2-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}
function renderIcons() { if (window.lucide) lucide.createIcons(); }
function statusBadge(s) { return `<span class="status-badge status-${esc(s)}">${esc(s.replace(/_/g,' '))}</span>`; }
function severityBadge(s) { const m={HAUTE:'ko',MOYENNE:'warn',BASSE:'ok'}; return `<span class="badge badge-${m[s]||'muted'}">${esc(s)}</span>`; }
function err(e) { return window.UX ? UX.autoError(e) : (`<div class="alert alert-ko">${I('alert-circle')}<span>${esc(e && e.message || 'Erreur')}</span></div>`); }
/* Extrait le message lisible depuis une réponse d'erreur structurée (module 69) :
   error peut être un objet {code,message} (nouveau format) ou une string (ancien). */
function errFromHttp(data) { return (data && data.error && typeof data.error === 'object' && data.error.message) || (data && data.error) || ''; }
/* Squelette de page pendant le chargement (LOADING) — remplace le voile global. */
function loadingShell(kind) {
  document.querySelector('header').classList.add('hidden');
  document.querySelector('footer').classList.add('hidden');
  $app.innerHTML = `<div class="app-layout">${renderSidebar()}<main class="app-main">${window.UX ? UX.skeleton(kind || 'list') : '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div>'}</main></div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function scoreRing(score) { const cls=score>=80?'score-high':score>=50?'score-mid':'score-low'; return `<div class="score-ring ${cls}">${score}</div>`; }
const FUEL_LABELS = { ESSENCE:'Essence', DIESEL:'Diesel', HYBRIDE:'Hybride', ELECTRIQUE:'Électrique', GPL:'GPL' };
const GEAR_LABELS = { MANUELLE:'Manuelle', AUTOMATIQUE:'Automatique', SEMI_AUTO:'Semi-auto' };
const TRANS_LABELS = { TWD:'Traction', FWD:'Traction avant', RWD:'Propulsion', AWD:'4 roues motrices' };
const CAT_ICONS = { moteur:'settings', boite:'cog', embrayage:'disc', freinage:'octagon-alert', direction:'compass', suspension:'move-vertical', climatisation:'thermometer-snowflake', batterie:'battery', electricite:'zap', pneus:'circle-dot', voyant:'triangle-alert', bruit:'volume-2', autre:'help-circle' };

/* ====== SIDEBAR NAV ====== */
const APP_VERSION = 'v10.9';
const CLIENT_NAV = [
  { label: 'Pilotage', items: [
    { hash:'#/app', icon:'layout-dashboard', label:'Accueil' },
  ]},
  { label: 'Messagerie', items: [
    { hash:'#/chat', icon:'message-square', label:'Messages' },
  ]},
  { label: 'Véhicules', items: [
    { hash:'#/vehicles', icon:'car', label:'Mes vehicules' },
    { hash:'#/maintenance', icon:'wrench', label:'Entretien' },
    { hash:'#/fleet', icon:'truck', label:'Flotte' },
  ]},
  { label: 'Diagnostic & devis', items: [
    { hash:'#/diagnostic', icon:'stethoscope', label:'Diagnostic' },
    { hash:'#/fault-codes', icon:'hash', label:'Codes defaut' },
    { hash:'#/quotes', icon:'file-text', label:'Devis' },
  ]},
  { label: 'Interventions', items: [
    { hash:'#/service-requests', icon:'clipboard-list', label:'Demandes' },
    { hash:'#/repairs', icon:'settings', label:'Reparations' },
    { hash:'#/appointments', icon:'calendar', label:'Rendez-vous' },
  ]},
  { label: 'Réseau', items: [
    { hash:'#/professionals', icon:'users', label:'Pros' },
    { hash:'#/parts', icon:'package', label:'Pieces' },
  ]},
  { label: 'Garanties & support', items: [
    { hash:'#/warranties', icon:'shield', label:'Garanties' },
    { hash:'#/disputes', icon:'alert-triangle', label:'Litiges' },
  ]},
  { label: 'Innovations', items: [
    { hash:'#/innovations', icon:'sparkles', label:'Hub Innovations' },
    { hash:'#/innovations/avis', icon:'camera', label:'Avis photo/vidéo' },
    { hash:'#/innovations/rappel', icon:'bell-ring', label:'Rappels entretien' },
    { hash:'#/innovations/sos', icon:'siren', label:'SOS dépannage' },
    { hash:'#/innovations/forfaits', icon:'shield-check', label:'Forfaits & garantie' },
    { hash:'#/innovations/passeport', icon:'qr-code', label:'Passeport QR' },
    { hash:'#/innovations/ev', icon:'zap', label:'Recharge & vert' },
    { hash:'#/innovations/valeur', icon:'trending-up', label:'Valeur de revente' },
  ]},
  { label: 'Compte', items: [
    { hash:'#/notifications', icon:'bell', label:'Notifs' },
    { hash:'#/profile', icon:'user', label:'Profil' },
  ]},
];

const PRO_NAV = [
  { label: 'Pilotage', items: [
    { hash:'#/pro/dashboard', icon:'layout-dashboard', label:'Tableau de bord' },
  ]},
  { label: 'Messagerie', items: [
    { hash:'#/chat', icon:'message-square', label:'Messages' },
  ]},
  { label: 'Atelier', items: [
    { hash:'#/pro/service-requests', icon:'clipboard-list', label:'Demandes entrantes' },
    { hash:'#/pro/repairs', icon:'settings', label:'Interventions' },
    { hash:'#/pro/quotes', icon:'file-text', label:'Mes devis' },
    { hash:'#/pro/appointments', icon:'calendar', label:'Agenda' },
  ]},
  { label: 'Qualité', items: [
    { hash:'#/pro/warranties', icon:'shield', label:'Garanties' },
    { hash:'#/pro/ratings', icon:'star', label:'Avis clients' },
  ]},
  { label: 'Gestion', items: [
    { hash:'#/pro/disputes', icon:'alert-triangle', label:'Litiges' },
    { hash:'#/pro/profile', icon:'building', label:'Mon profil pro' },
  ]},
  { label: 'Outils', items: [
    { hash:'#/mobile', icon:'smartphone', label:'Mobile' },
    { hash:'#/profile', icon:'user', label:'Mon compte' },
  ]},
];

const SUPPLIER_NAV = [
  { label: 'Pilotage', items: [
    { hash:'#/supplier/dashboard', icon:'layout-dashboard', label:'Tableau de bord' },
  ]},
  { label: 'Messagerie', items: [
    { hash:'#/chat', icon:'message-square', label:'Messages' },
  ]},
  { label: 'Catalogue', items: [
    { hash:'#/supplier/products', icon:'package', label:'Produits' },
    { hash:'#/supplier/orders', icon:'shopping-cart', label:'Commandes' },
    { hash:'#/supplier/inventory', icon:'layers', label:'Inventaire' },
  ]},
  { label: 'Compte', items: [
    { hash:'#/supplier/profile', icon:'building-2', label:'Mon espace' },
    { hash:'#/profile', icon:'user', label:'Mon compte' },
  ]},
];

const ADMIN_NAV = [
  { label: 'Pilotage', items: [
    { hash:'#/admin/dashboard', icon:'layout-dashboard', label:'Tableau de bord' },
  ]},
  { label: 'Messagerie', items: [
    { hash:'#/chat', icon:'message-square', label:'Messages' },
  ]},
  { label: 'Utilisateurs', items: [
    { hash:'#/admin/users', icon:'users', label:'Utilisateurs' },
    { hash:'#/admin/vehicles', icon:'car', label:'Véhicules' },
  ]},
  { label: 'Réseau', items: [
    { hash:'#/admin/professionals', icon:'badge-check', label:'Professionnels' },
    { hash:'#/admin/garages', icon:'building-2', label:'Garages' },
    { hash:'#/admin/technicians', icon:'wrench', label:'Techniciens' },
    { hash:'#/admin/experts', icon:'award', label:'Experts' },
    { hash:'#/admin/suppliers', icon:'truck', label:'Fournisseurs' },
  ]},
  { label: 'Opérations', items: [
    { hash:'#/admin/service-requests', icon:'clipboard-list', label:'Demandes de service' },
    { hash:'#/admin/appointments', icon:'calendar', label:'Rendez-vous' },
    { hash:'#/admin/diagnostics', icon:'stethoscope', label:'Diagnostics' },
    { hash:'#/admin/quotes', icon:'file-text', label:'Devis' },
    { hash:'#/admin/repairs', icon:'settings', label:'Réparations' },
    { hash:'#/admin/warranties', icon:'shield', label:'Garanties' },
    { hash:'#/admin/disputes', icon:'alert-triangle', label:'Litiges' },
    { hash:'#/admin/reviews', icon:'star', label:'Avis clients' },
  ]},
  { label: 'Finances', items: [
    { hash:'#/admin/payments', icon:'wallet', label:'Paiements' },
    { hash:'#/admin/transactions', icon:'arrow-left-right', label:'Transactions' },
    { hash:'#/admin/commissions', icon:'percent', label:'Commissions' },
  ]},
  { label: 'Pièces & stock', items: [
    { hash:'#/admin/parts', icon:'package', label:'Pièces' },
    { hash:'#/admin/orders', icon:'shopping-cart', label:'Commandes pièces' },
  ]},
  { label: 'Référentiels', items: [
    { hash:'#/admin/maintenance-programs', icon:'file-cog', label:'Prog. entretien' },
    { hash:'#/admin/fault-codes', icon:'hash', label:'Codes défaut' },
    { hash:'#/admin/geography', icon:'map-pin', label:'Géographie' },
  ]},
  { label: 'Plateforme', items: [
    { hash:'#/admin/notifications', icon:'bell', label:'Notifications' },
    { hash:'#/admin/settings', icon:'sliders-horizontal', label:'Paramètres' },
    { hash:'#/admin/audit-logs', icon:'scroll-text', label:'Journal d\'audit' },
  ]},
];

/* Barre de navigation mobile (téléphone uniquement) : 5 raccourcis fixes
   dont une action centrale « Menu » qui ouvre le tiroir de navigation complet. */
const PRO_TABS = [
  { hash: '#/pro/dashboard', icon: 'layout-dashboard', label: 'Accueil' },
  { hash: '#/pro/service-requests', icon: 'clipboard-list', label: 'Demandes' },
  null,
  { hash: '#/pro/quotes', icon: 'file-text', label: 'Devis' },
  { hash: '#/pro/profile', icon: 'building', label: 'Atelier' },
];
const MOBILE_TABS = {
  CLIENT: [
    { hash: '#/app', icon: 'layout-dashboard', label: 'Accueil' },
    { hash: '#/vehicles', icon: 'car', label: 'Véhicules' },
    null,
    { hash: '#/maintenance', icon: 'wrench', label: 'Entretien' },
    { hash: '#/profile', icon: 'user', label: 'Profil' },
  ],
  GARAGE: PRO_TABS,
  MECANICIEN: PRO_TABS,
  EXPERT: PRO_TABS,
  SUPPLIER: [
    { hash: '#/supplier/dashboard', icon: 'layout-dashboard', label: 'Accueil' },
    { hash: '#/supplier/products', icon: 'package', label: 'Produits' },
    null,
    { hash: '#/supplier/orders', icon: 'shopping-cart', label: 'Commandes' },
    { hash: '#/profile', icon: 'user', label: 'Profil' },
  ],
  ADMIN: [
    { hash: '#/admin/dashboard', icon: 'layout-dashboard', label: 'Accueil' },
    { hash: '#/admin/users', icon: 'users', label: 'Utilisateurs' },
    null,
    { hash: '#/admin/professionals', icon: 'badge-check', label: 'Pros' },
    { hash: '#/profile', icon: 'user', label: 'Profil' },
  ],
  SUPER_ADMIN: [
    { hash: '#/admin/dashboard', icon: 'layout-dashboard', label: 'Accueil' },
    { hash: '#/admin/users', icon: 'users', label: 'Utilisateurs' },
    null,
    { hash: '#/admin/professionals', icon: 'badge-check', label: 'Pros' },
    { hash: '#/profile', icon: 'user', label: 'Profil' },
  ],
};

function renderTabbar() {
  if (!S.user) return '';
  const h = location.hash || '#/';
  const tabs = MOBILE_TABS[S.user.role] || MOBILE_TABS.CLIENT;
  const isActive = (hash) => h === hash || h.startsWith(hash + '/');
  const item = (t) => (t === null || t === undefined)
    ? `<button type="button" class="tabbar-btn tabbar-menu" id="tabbar-menu" aria-label="Ouvrir le menu complet">${I('menu')}<span>Menu</span></button>`
    : `<a href="${t.hash}" class="tabbar-btn ${isActive(t.hash) ? 'active' : ''}" aria-current="${isActive(t.hash) ? 'page' : ''}">${I(t.icon)}<span>${esc(t.label)}</span></a>`;
  return `<nav class="tabbar" aria-label="Navigation principale">${tabs.map(item).join('')}</nav>`;
}

const isAdmin = () => S.user && ['ADMIN','SUPER_ADMIN'].includes(S.user.role);
const isPro = () => S.user && ['GARAGE','MECANICIEN','EXPERT'].includes(S.user.role);
const isSupplier = () => S.user && S.user.role === 'SUPPLIER';
const currentNav = () => isAdmin() ? ADMIN_NAV : (isPro() ? PRO_NAV : (isSupplier() ? SUPPLIER_NAV : CLIENT_NAV));

let _sidebarOpen = false;
let _sidebarLastTap = 0;
function menuBtn() {
  return `<button type="button" id="app-menu-btn" class="app-menu-btn" aria-label="Menu">${I('menu')}</button>`;
}
function setSidebar(state) {
  _sidebarOpen = !!state;
  document.querySelector('.app-layout')?.classList.toggle('sidebar-open', _sidebarOpen);
  const hb = document.getElementById('hamburger');
  if (hb) hb.classList.toggle('open', _sidebarOpen);
}
function renderSidebar() {
  if (!S.user) return '';
  const h = location.hash || '#/';
  const nav = currentNav();
  const collapsed = new Set(JSON.parse(localStorage.getItem('cauto-nav-collapsed') || '[]'));
  const initials = (S.user.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const link = n => `<a href="${n.hash}" class="sidebar-link ${(h === n.hash || h.startsWith(n.hash + '/'))?'active':''}">
    ${I(n.icon)}<span>${n.label}</span>${n.hash === '#/chat' ? '<span class="chat-unread-badge hidden" id="chat-unread"></span>':''}</a>`;
  const navHtml = `<nav class="sidebar-nav">${nav.map(g => {
    const key = S.user.role + String.fromCharCode(58) + g.label;
    const isCollapsed = collapsed.has(key);
    return `<div class="nav-group ${isCollapsed ? 'collapsed' : ''}">
      <button type="button" class="nav-group-title" data-nav-group="${esc(key)}">
        <span>${esc(g.label)}</span><i data-lucide="chevron-down" class="nav-chevron"></i>
      </button>
      <div class="nav-group-body"><div class="nav-group-inner">${g.items.map(link).join('')}</div></div>
    </div>`;
  }).join('')}</nav>`;
  return `<aside class="sidebar">
    <div class="sidebar-brand"><svg width="30" height="30" viewBox="0 0 100 100"><defs><linearGradient id="cl2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect x="4" y="4" width="92" height="92" rx="24" fill="url(#cl2)"/><path d="M29 62 h42 a5 5 0 0 0 4.6-3 l2.6-7.6 a10 10 0 0 0-8.6-6.9 l-7.4-.6-6.6-7.6 a7 7 0 0 0-5.4-2.6 h-9.2 a8 8 0 0 0-7 4 l-5.2 8.6 a5 5 0 0 0-1.2 3.3 v9.6 a5 5 0 0 0 5 5 z" fill="#fff"/><circle cx="34" cy="66" r="6" fill="url(#cl2)"/><circle cx="67" cy="66" r="6" fill="url(#cl2)"/><path d="M46 62 h8" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg><span>C-AUTO${isAdmin() ? ' Admin' : (isPro() ? ' Pro' : '')}</span></div>
    ${navHtml}
    <div class="sidebar-footer">
      <a href="#/profile" class="sidebar-link"><span class="avatar-sm">${initials}</span><span>${esc(S.user.name)}${S.user.is_certified ? certBadge() : ''}</span></a>
      <button class="sidebar-link" id="btn-logout">${I('log-out')}<span>Déconnexion</span></button>
      <div id="app-version-line" style="text-align:center;font-size:0.6rem;color:var(--muted);padding:0.3rem 0">${APP_VERSION}</div>
    </div>
  </aside>`;
}

function layoutApp(html) {
  if (!S.user) { location.hash = '#/login'; return; }
  document.querySelector('header').classList.add('hidden');
  document.querySelector('footer').classList.add('hidden');
  $app.innerHTML = `<div class="app-layout">${renderSidebar()}<main class="app-main">${menuBtn()}${html}</main>${renderTabbar()}</div>`;
  if (_sidebarOpen) document.querySelector('.app-layout')?.classList.add('sidebar-open');
  document.getElementById('btn-logout').onclick = logout;
  const tabbarMenu = document.getElementById('tabbar-menu');
  if (tabbarMenu) tabbarMenu.onclick = () => setSidebar(true);
  renderIcons(); if (window.cautoI18n && window.cautoI18n.apply) window.cautoI18n.apply();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  Array.from($app.querySelector('.app-main').children).forEach((c, i) => {
    c.classList.add('rise');
    c.style.animationDelay = Math.min(60 + i * 45, 480) + 'ms';
  });
  document.querySelectorAll('.nav-group-title').forEach(btn => btn.onclick = () => {
    const group = btn.parentElement;
    const set = new Set(JSON.parse(localStorage.getItem('cauto-nav-collapsed') || '[]'));
    group.classList.toggle('collapsed');
    if (group.classList.contains('collapsed')) set.add(btn.dataset.navGroup); else set.delete(btn.dataset.navGroup);
    localStorage.setItem('cauto-nav-collapsed', JSON.stringify([...set]));
  });
  updateChatUnread();
}

/* ====== AUTH ====== */
function viewLogin(msg='') {
  document.querySelector('header').classList.remove('hidden');
  document.querySelector('footer').classList.remove('hidden');
  $app.innerHTML = `<div class="auth-page login-bg"><div class="auth-card card">
    <div class="logo-big"><svg width="36" height="36" viewBox="0 0 100 100"><rect rx="18" width="100" height="100" fill="var(--accent)"/><text x="50" y="68" font-size="50" font-weight="bold" text-anchor="middle" fill="white" font-family="system-ui">CA</text></svg> C-AUTO</div>
    <p class="subtitle">La confiance au coeur de l'automobile</p>
    ${msg ? `<div class="alert alert-ok">${I('check-circle')}<span>${esc(msg)}</span></div>` : ''}
    <form id="f-login">
      <label>${I('mail')} Email <input name="email" type="email" required placeholder="vous@email.com"></label>
      <label>${I('lock')} Mot de passe <input name="password" type="password" required placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"></label>
      <button type="submit">${I('log-in')} Se connecter</button>
    </form>
    <p class="auth-footer">Pas de compte ? <a href="#/register">S'inscrire</a></p>
  </div></div>`;
  document.getElementById('f-login').onsubmit = async (ev) => {
    ev.preventDefault();
    try { const d = await api('/auth/login',{method:'POST',body:Object.fromEntries(new FormData(ev.target))}); setSession(d.token,d.user); toast('Connexion réussie','success'); location.hash = S.user.role==='SUPPLIER'?'#/supplier/dashboard':(isPro()?'#/pro/dashboard':(isAdmin()?'#/admin/dashboard':'#/app')); }
    catch(e) { viewLogin(err(e)); }
  }; renderIcons();
}

function viewRegister() {
  document.querySelector('header').classList.remove('hidden');
  document.querySelector('footer').classList.remove('hidden');
  const ROLE_OPTIONS = [
    { v: 'CLIENT', t: 'Client', d: 'Particulier, suivez vos véhicules', icon: 'user' },
    { v: 'GARAGE', t: 'Garage', d: 'Atelier, devis & interventions', icon: 'wrench' },
    { v: 'MECANICIEN', t: 'Mécanicien', d: 'Interventions & certifications', icon: 'hard-hat' },
    { v: 'SUPPLIER', t: 'Fournisseur', d: 'Vendez vos pièces détachées', icon: 'package' }
  ];
  const TITLES = {
    name: 'Quel est votre nom ?',
    email: 'Quelle est votre adresse email ?',
    phone: 'Votre numéro de téléphone',
    role: 'Comment utiliserez-vous C-AUTO ?',
    garage: 'Le nom de votre garage',
    password: 'Choisissez un mot de passe'
  };
  // Module 62 — inscription en plusieurs étapes (une information par écran,
  // inspirée des parcours mobiles modernes type Instagram).
  $app.innerHTML = `
  <div class="auth-page">
    <div class="auth-card card reg-card">
      <button type="button" class="reg-back hidden" id="reg-back" aria-label="Étape précédente">${I('arrow-left')}</button>
      <div class="logo-big"><svg width="36" height="36" viewBox="0 0 100 100"><rect rx="18" width="100" height="100" fill="var(--accent)"/><text x="50" y="68" font-size="50" font-weight="bold" text-anchor="middle" fill="white" font-family="system-ui">CA</text></svg> C-AUTO</div>
      <p class="subtitle" id="reg-title"></p>
      <div class="reg-progress"><span id="reg-progress-bar"></span></div>
      <form id="f-reg" novalidate>
        <div id="reg-error" class="hidden"></div>
        <div class="reg-step" id="r-step-name">
          <label>Nom complet <input id="r-name" name="name" autocomplete="name" minlength="2" required placeholder="Jean Dupont"></label>
          <p class="reg-help">Le nom affiché sur votre profil.</p>
        </div>
        <div class="reg-step" id="r-step-email">
          <label>Adresse email <input id="r-email" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="vous@email.com"></label>
          <p class="reg-help">Nous l'utiliserons pour vous connecter.</p>
        </div>
        <div class="reg-step" id="r-step-phone">
          <label>Téléphone <input id="r-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" pattern="\\+[0-9]{8,15}" required placeholder="+22990000000"></label>
          <p class="reg-help">Format international, ex : +22990000000.</p>
        </div>
        <div class="reg-step" id="r-step-role">
          <div class="role-grid">${ROLE_OPTIONS.map(o => `
            <label class="role-tile"><input type="radio" name="role" value="${o.v}" required>
              <span class="role-icon">${I(o.icon)}</span>
              <span class="role-name">${o.t}</span>
              <span class="role-desc">${o.d}</span>
            </label>`).join('')}
          </div>
          <p class="reg-help">Vous pourrez changer, un rôle est juste notre point de départ.</p>
        </div>
        <div class="reg-step" id="r-step-garage">
          <label>Nom du garage <input id="r-garage" name="garage_name" autocomplete="organization" minlength="2" required placeholder="Garage Dupont SARL"></label>
          <p class="reg-help">Affiché sur votre profil professionnel.</p>
        </div>
        <div class="reg-step" id="r-step-password">
          <label>Mot de passe <input id="r-password" name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="Min. 8 caractères"></label>
          <p class="reg-help">Au moins 8 caractères.</p>
          <button type="button" class="reg-peek" id="reg-peek">${I('eye')} Afficher</button>
        </div>
        <button type="submit" id="reg-next" class="btn btn-primary btn-block">Suivant</button>
      </form>
      <p class="auth-footer"><a href="#/login">${I('arrow-left')} J'ai déjà un compte</a></p>
    </div>
  </div>`;
  const E = { name: '', email: '', phone: '', role: '', garage_name: '', password: '' };
  const form = document.getElementById('f-reg');
  const back = document.getElementById('reg-back');
  const nextBtn = document.getElementById('reg-next');
  const bar = document.getElementById('reg-progress-bar');
  const title = document.getElementById('reg-title');
  const errBox = document.getElementById('reg-error');
  const keys = ['name', 'email', 'phone', 'role', 'garage', 'password'];
  const stepEl = (k) => document.getElementById('r-step-' + k);
  const inputEl = (k) => (k === 'role' ? document.querySelector('#r-step-role input:checked') : document.getElementById('r-' + k));
  let seq = ['name', 'email', 'phone', 'role', 'password'];
  let idx = 0;

  keys.forEach((k) => {
    if (k === 'role') {
      document.querySelectorAll('#r-step-role input[name=role]').forEach((r) => r.onchange = () => {
        E.role = r.value;
        document.querySelectorAll('.role-tile').forEach((l) => l.classList.toggle('sel', l.contains(r) && r.checked));
        rebuildSeq();
      });
      return;
    }
    const inp = document.getElementById('r-' + k);
    inp.oninput = () => { E[k === 'garage' ? 'garage_name' : k] = inp.value; };
  });

  function errMsg(text) { errBox.className = 'alert alert-ko'; errBox.textContent = text; }
  function show() {
    keys.forEach((k) => stepEl(k).classList.toggle('active', k === seq[idx]));
    back.classList.toggle('hidden', idx === 0);
    nextBtn.textContent = idx === seq.length - 1 ? 'Créer le compte' : 'Suivant';
    title.textContent = TITLES[seq[idx]];
    bar.style.width = (((idx + 1) / seq.length) * 100) + '%';
    const f = stepEl(seq[idx]).querySelector('input, select, button');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
  }
  function rebuildSeq() {
    seq = ['name', 'email', 'phone', 'role'];
    if (E.role === 'GARAGE') seq.push('garage');
    seq.push('password');
    if (idx >= seq.length) idx = seq.length - 1;
  }
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    errBox.className = 'hidden';
    // Validation EXCLUSIVEMENT sur l'étape visible (novalidate sur le formulaire :
    // sinon le navigateur bloque sur des champs requis masqués des étapes suivantes).
    const panel = stepEl(seq[idx]);
    const bad = panel.querySelector(':invalid');
    if (bad) {
      try { bad.focus({ preventScroll: true }); } catch (e) {}
      errMsg(bad.validationMessage || 'Vérifiez ce champ.');
      return;
    }
    if (idx < seq.length - 1) { idx++; show(); return; }
    showLoading();
    try {
      const body = { name: E.name.trim(), email: E.email.trim(), phone: E.phone.trim(), role: E.role, password: E.password };
      if (E.role === 'GARAGE') body.garage_name = E.garage_name.trim();
      const d = await api('/auth/register', { method: 'POST', body });
      hideLoading();
      setSession(d.token, d.user);
      toast('Compte créé', 'success');
      location.hash = S.user.role === 'SUPPLIER' ? '#/supplier/profile' : (isPro() ? '#/pro/profile' : '#/app');
    } catch (e) { hideLoading(); errMsg((e && e.message) || 'Erreur'); }
  };
  back.onclick = () => { if (idx > 0) { errBox.className = 'hidden'; idx--; show(); } };
  const peek = document.getElementById('reg-peek');
  peek.onclick = () => {
    const p = document.getElementById('r-password');
    const show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    peek.innerHTML = show ? I('eye-off') + ' Masquer' : I('eye') + ' Afficher';
  };
  show();
  renderIcons();
}

/* ====== DASHBOARD CLIENT ====== */
async function viewDashboard() {
  loadingShell('dashboard');
  try {
    const { vehicles } = await api('/vehicles');
    const v = vehicles[0];
    let maint = { score: 0, alerts: [], next_due: null, all: [] };
    let appts = [], intvs = [];
    if (v) {
      maint = await api(`/vehicles/${v.id}/maintenance`);
      const apptData = await api('/appointments/mine').catch(() => ({ appointments: [] }));
      appts = apptData.appointments;
      intvs = await api('/interventions/mine').catch(() => ({ interventions: [] })).then(d => d.interventions || []);
    }
    const firstName = (S.user.name || 'Client').split(' ')[0];
    layoutApp(`
    <div class="dash-header">
      <div><h1>Bonjour ${esc(firstName)} 👋</h1><p class="hint">Voici le résumé de votre véhicule.</p></div>
      <a href="#/diagnostic" class="btn btn-danger">${I('alert-triangle')} MON VÉHICULE A UN PROBLÈME</a>
    </div>
    ${v ? `
    <div class="dash-hero card">
      <div class="dash-hero-left">
        <div class="dash-veh-icon">${I('car')}</div>
        <div>
          <div class="dash-veh-name">${esc(v.make)} ${esc(v.model)}</div>
          <div class="dash-veh-sub">${esc(v.plate)} · ${Number(v.mileage).toLocaleString('fr')} km</div>
          ${v.engine_name ? `<div class="dash-veh-sub">${esc(v.engine_name)} · ${FUEL_LABELS[v.fuel_type]||v.fuel_type}</div>` : ''}
        </div>
      </div>
      <div class="dash-hero-right">
        <div class="dash-score-label">SCORE C-AUTO</div>
        ${scoreRing(maint.score)}
      </div>
    </div>
    <div class="grid-dash">
      ${maint.alerts.length ? `<div class="card dash-card"><div class="dash-card-title">${I('alert-triangle')} Alertes</div>${maint.alerts.map(a => `<div class="alert ${a.status==='OVERDUE'?'alert-ko':'alert-warn'}" style="margin:0.4rem 0">${I('alert-circle')} ${esc(a.label)} — ${a.status==='OVERDUE'?'ÉCHUE':'prochaine'}</div>`).join('')}</div>` : ''}
      ${maint.next_due ? `<div class="card dash-card"><div class="dash-card-title">${I('clock')} Prochaine échéance</div><p style="margin:0.3rem 0">${esc(maint.next_due.label)}</p><p class="hint">${maint.next_due.km_left} km ou ${maint.next_due.days_left} jours</p></div>` : ''}
      <div class="card dash-card"><div class="dash-card-title">${I('wrench')} Entretien</div><p style="margin:0.3rem 0">${maint.all.filter(i=>i.status!=='OK').length} opération(s) en attente</p><a href="#/vehicles/${v.id}" class="btn btn-sm btn-ghost">Voir le programme →</a></div>
      <div class="card dash-card"><div class="dash-card-title">${I('calendar')} Rendez-vous</div><p style="margin:0.3rem 0">${appts.length} rendez-vous</p><a href="#/appointments" class="btn btn-sm btn-ghost">Voir →</a></div>
      <div class="card dash-card"><div class="dash-card-title">${I('shield-check')} Garanties</div><p style="margin:0.3rem 0">12 mois sur chaque intervention</p></div>
    </div>
    ` : '<div class="empty-state">' + I('car') + '<h3>Aucun véhicule</h3><p>Ajoutez votre premier véhicule pour commencer.</p><a href="#/vehicles/new" class="btn btn-primary">Ajouter un véhicule</a></div>'}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== VÉHICULES LISTE ====== */
async function viewVehicles() {
  loadingShell('list');
  try {
    const { vehicles } = await api('/vehicles');
    layoutApp(`
    <div class="page-top"><h1>${I('car')} Mes véhicules</h1><a href="#/vehicles/new" class="btn btn-primary">${I('plus')} Ajouter</a></div>
    ${vehicles.length ? `<div class="grid-cards">${vehicles.map(v => `
      <a href="#/vehicles/${v.id}" class="card veh-card-link">
        <div class="veh-card-header"><div class="veh-card-icon">${I('car')}</div><span class="badge badge-muted">${v.year}</span></div>
        <h3>${esc(v.make)} ${esc(v.model)}</h3>
        <div class="veh-card-plate">${esc(v.plate)}</div>
        <div class="veh-card-km">${Number(v.mileage).toLocaleString('fr')} km</div>
        ${v.engine_name ? `<div class="hint">${esc(v.engine_name)} · ${FUEL_LABELS[v.fuel_type]||''}</div>` : ''}
      </a>`).join('')}</div>` : '<div class="empty-state">' + I('car') + '<h3>Aucun véhicule</h3><p>Cliquez sur "Ajouter" pour commencer.</p></div>'}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== NOUVEAU VÉHICULE ====== */
function viewVehicleNew() {
  layoutApp(`
    <div class="page-top"><a href="#/vehicles" class="hint">${I('arrow-left')} Retour</a></div>
    <div class="section-title" style="margin-bottom:1rem">${I('plus-circle')} Nouveau véhicule</div>
    <div class="card" style="max-width:700px">
      <form id="f-new-veh">
        <div class="form-row-2">
          <label>Marque * <input name="make" required placeholder="Toyota"></label>
          <label>Modèle * <input name="model" required placeholder="Corolla"></label>
        </div>
        <div class="form-row-2">
          <label>Année * <input name="year" type="number" min="1950" max="2100" required></label>
          <label>Génération <input name="generation" placeholder="EX: 12ème"></label>
        </div>
        <div class="form-row-2">
          <label>Immatriculation * <input name="plate" placeholder="AB-123-CD" required></label>
          <label>VIN (optionnel) <input name="vin" maxlength="17" placeholder="17 caractères"></label>
        </div>
        <p class="hint form-hint">${I('info')} Le numéro de châssis (VIN) est relevé par votre professionnel lors de la réception de votre véhicule.</p>
        <div class="form-row-2">
          <label>Kilométrage * <input name="mileage" type="number" min="0" required></label>
          <label>Première mise en circulation <input name="first_registration" type="date"></label>
        </div>
        <div class="form-row-2">
          <label>Moteur <input name="engine_name" placeholder="EX: 2.8L Turbo"></label>
          <label>Cylindrée (cc) <input name="displacement_cc" type="number" min="0" placeholder="2800"></label>
        </div>
        <div class="form-row-3">
          <label>Carburant <select name="fuel_type"><option value="ESSENCE">Essence</option><option value="DIESEL">Diesel</option><option value="HYBRIDE">Hybride</option><option value="ELECTRIQUE">Électrique</option><option value="GPL">GPL</option></select></label>
          <label>Boîte <select name="gearbox"><option value="MANUELLE">Manuelle</option><option value="AUTOMATIQUE">Automatique</option><option value="SEMI_AUTO">Semi-auto</option></select></label>
          <label>Transmission <select name="transmission"><option value="TWD">Traction</option><option value="FWD">Traction avant</option><option value="RWD">Propulsion</option><option value="AWD">4 roues motrices</option></select></label>
        </div>
        <button type="submit" style="margin-top:1rem">${I('save')} Enregistrer le véhicule</button>
      </form>
    </div>
  `);
  document.getElementById('f-new-veh').onsubmit = async (ev) => {
    ev.preventDefault();
    const o = Object.fromEntries(new FormData(ev.target));
    const body = { make: o.make, model: o.model, year: +o.year, plate: o.plate.toUpperCase(), vin: o.vin.toUpperCase(), mileage: +o.mileage,
      generation: o.generation, engine_name: o.engine_name, displacement_cc: +o.displacement_cc || 0,
      fuel_type: o.fuel_type, gearbox: o.gearbox, transmission: o.transmission, first_registration: o.first_registration || null };
    try { await api('/vehicles',{method:'POST',body}); toast('Véhicule ajouté','success'); location.hash = '#/vehicles'; }
    catch(e) { toast(e.message,'error'); }
  }; renderIcons();
}

/* ====== FICHE VÉHICULE ====== */
async function viewVehicleDetail(id) {
  showLoading();
  try {
    const [vd, hist, maint, healthR] = await Promise.all([
      api('/vehicles/'+id),
      api(`/vehicles/${id}/history?limit=6`),
      api(`/vehicles/${id}/maintenance`),
      api(`/vehicles/${id}/health-score`).catch(() => null)
    ]);
    const v = vd.vehicle;
    const hs = (healthR && healthR.health) || null;
    const hsOk = hs && hs.state === 'OK';
    const subRows = hs && hs.subscores
      ? hs.subscores.map(s => s.score === null
          ? { domain: s.domain, score: null, state: 'INSUFFICIENT_DATA', basis: ['Données insuffisantes'] }
          : s).filter(() => true).map(s => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid var(--border)">
              <span><b>${esc(s.domain)}</b>${s.basis && s.basis[0] ? `<span class="hint" style="display:block;font-size:0.78rem;font-weight:400">${esc(s.basis[0])}</span>` : ''}</span>
              <b class="${s.score === null ? '' : (s.score>=80?'score-high':s.score>=50?'score-mid':'score-low')}" style="${s.score === null ? 'color:var(--muted)' : ''}">${s.score === null ? esc(s.basis && s.basis[0] || 'Données insuffisantes') : s.score+'/100'}</b>
            </div>`).join('')
      : '';
    const healthBlock = hsOk ? `
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center">
        ${scoreRing(hs.score)}
        <div style="flex:1;min-width:260px">
          <h2 style="margin-bottom:0.3rem">Score de santé: ${hs.score}/100</h2>
          <p class="hint" style="margin:0 0 0.4rem">${esc(hs.global_basis.join(' · ') || 'Évalué à partir des données disponibles')}</p>
          ${subRows}
        </div>
      </div>` : `
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center">
        <div class="score-ring score-low">—</div>
        <div>
          <h2 style="margin-bottom:0.3rem">Score de santé</h2>
          <p class="hint">Données insuffisantes pour calculer un score.</p>
        </div>
      </div>`;
    layoutApp(`
    <a href="#/vehicles" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux véhicules</a>
    <div class="page-top"><h1>${I('car')} ${esc(v.make)} ${esc(v.model)}</h1>
      <div style="display:flex;gap:0.5rem">
        <a href="#/vehicles/${id}/passport" class="btn btn-ghost">${I('file-text')} Passeport</a>
        <a href="#/vehicles/${id}/history" class="btn btn-ghost">${I('clock')} Carnet</a>
        <a href="#/vehicles/${id}/edit" class="btn btn-ghost">${I('edit')} Modifier</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:1rem">
      ${healthBlock}
    </div>
    <div class="detail-grid">
      <div class="card"><div class="detail-label">Immatriculation</div><div class="detail-value">${esc(v.plate)}</div></div>
      <div class="card"><div class="detail-label">VIN</div><div class="detail-value">${esc(v.vin)}</div></div>
      <div class="card"><div class="detail-label">Année</div><div class="detail-value">${v.year}</div></div>
      <div class="card"><div class="detail-label">Kilométrage</div><div class="detail-value">${Number(v.mileage).toLocaleString('fr')} km</div></div>
      ${v.engine_name ? `<div class="card"><div class="detail-label">Moteur</div><div class="detail-value">${esc(v.engine_name)}</div></div>` : ''}
      ${v.fuel_type ? `<div class="card"><div class="detail-label">Carburant</div><div class="detail-value">${FUEL_LABELS[v.fuel_type]||v.fuel_type}</div></div>` : ''}
      ${v.gearbox ? `<div class="card"><div class="detail-label">Boîte</div><div class="detail-value">${GEAR_LABELS[v.gearbox]||v.gearbox}</div></div>` : ''}
      ${v.transmission ? `<div class="card"><div class="detail-label">Transmission</div><div class="detail-value">${TRANS_LABELS[v.transmission]||v.transmission}</div></div>` : ''}
    </div>
    ${maint.alerts.length ? `<div class="card" style="margin-top:1rem"><div class="dash-card-title">${I('alert-triangle')} Alertes</div>${maint.alerts.map(a => `<div class="alert ${a.status==='OVERDUE'?'alert-ko':'alert-warn'}">${I('alert-circle')} <b>${esc(a.label)}</b> — ${a.status==='OVERDUE'?'ÉCHUE':'prochaine'}</div>`).join('')}</div>` : ''}
    <div class="card" style="margin-top:1rem"><div class="dash-card-title">${I('book-open')} Derniers événements</div>
      ${hist.history.slice(0,5).map(h => `<div style="padding:0.4rem 0;border-bottom:1px solid var(--border)"><b>${esc(h.title)}</b><br><span class="hint">${new Date(h.created_at).toLocaleDateString('fr')} · ${esc(h.author_name||'')}</span></div>`).join('') || '<p class="hint">Aucun événement</p>'}
    </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== ÉDITION VÉHICULE ÉTENDUE ====== */
async function viewVehicleEdit(id) {
  showLoading();
  try {
    const { vehicle: v } = await api('/vehicles/'+id);
    layoutApp(`
    <a href="#/vehicles/${id}" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour à la fiche</a>
    <div class="section-title" style="margin-bottom:1rem">${I('edit')} Modifier ${esc(v.make)} ${esc(v.model)}</div>
    <div class="card" style="max-width:700px">
      <form id="f-edit-veh">
        <div class="form-row-2">
          <label>Marque <input name="make" value="${esc(v.make)}" required></label>
          <label>Modèle <input name="model" value="${esc(v.model)}" required></label>
        </div>
        <div class="form-row-2">
          <label>Année <input name="year" type="number" value="${v.year}" required></label>
          <label>Génération <input name="generation" value="${esc(v.generation||'')}"></label>
        </div>
        <div class="form-row-2">
          <label>Kilométrage <input name="mileage" type="number" value="${v.mileage}" required></label>
          <label>Première mise en circulation <input name="first_registration" type="date" value="${v.first_registration||''}"></label>
        </div>
        <div class="form-row-2">
          <label>Moteur <input name="engine_name" value="${esc(v.engine_name||'')}"></label>
          <label>Cylindrée (cc) <input name="displacement_cc" type="number" value="${v.displacement_cc||0}"></label>
        </div>
        <div class="form-row-3">
          <label>Carburant <select name="fuel_type">${['ESSENCE','DIESEL','HYBRIDE','ELECTRIQUE','GPL'].map(f => `<option value="${f}" ${v.fuel_type===f?'selected':''}>${FUEL_LABELS[f]}</option>`).join('')}</select></label>
          <label>Boîte <select name="gearbox">${['MANUELLE','AUTOMATIQUE','SEMI_AUTO'].map(g => `<option value="${g}" ${v.gearbox===g?'selected':''}>${GEAR_LABELS[g]}</option>`).join('')}</select></label>
          <label>Transmission <select name="transmission">${['TWD','FWD','RWD','AWD'].map(t => `<option value="${t}" ${v.transmission===t?'selected':''}>${TRANS_LABELS[t]}</option>`).join('')}</select></label>
        </div>
        <button type="submit" style="margin-top:1rem">${I('save')} Enregistrer</button>
      </form>
    </div>
    <div class="card" style="border:1px solid var(--danger);margin-top:1rem">
      <div class="dash-card-title" style="color:var(--danger)">${I('trash-2')} Zone dangereuse</div>
      <button class="btn-ko" id="del-veh">${I('trash-2')} Supprimer le véhicule</button>
    </div>
    `);
    document.getElementById('f-edit-veh').onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/vehicles/'+id,{method:'PATCH',body:{...o,year:+o.year,mileage:+o.mileage,displacement_cc:+o.displacement_cc||0}}); toast('Véhicule mis à jour','success'); location.hash='#/vehicles/'+id; }
      catch(e) { toast(e.message,'error'); }
    };
    document.getElementById('del-veh').onclick = async () => {
      const ok = window.UX ? await UX.confirm('Supprimer ce véhicule ? Cette action est définitive.', { danger: true, okLabel: 'Supprimer' }) : confirm('Supprimer ce véhicule ?');
      if (!ok) return;
      try { await api('/vehicles/'+id,{method:'DELETE'}); toast('Supprimé','success'); location.hash='#/vehicles'; }
      catch(e) { toast(e.message,'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== PASSEPORT VÉHICULE ====== */
async function viewPassport(id) {
  showLoading();
  try {
    const { passport: pp } = await api('/vehicles/'+id+'/passport');
    const v = pp.vehicle;
    const score = pp.maintenance && pp.maintenance.score !== undefined ? pp.maintenance.score : 0;
    const maintItems = (pp.maintenance && pp.maintenance.items) || [];
    const diagBySeverity = { HAUTE: 0, MOYENNE: 0, BASSE: 0 };
    (pp.diagnostics||[]).forEach(d => { diagBySeverity[d.result_urgency] = (diagBySeverity[d.result_urgency]||0)+1; });
    const statusLabel = i => ((i.status||'').replace(/_/g,' ').toLowerCase());
    const ring = (val, max, color) => `<div class="pp-gauge"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="16" class="pp-gauge-track"/><circle cx="21" cy="21" r="16" class="pp-gauge-fill ${color}" style="stroke-dasharray:${(val/max)*100.5} 100.5"/></svg><span>${val}</span></div>`;
    layoutApp(`
    <a href="#/vehicles/${id}" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour à la fiche</a>
    <div class="page-top"><h1>${I('id-card')} Passeport véhicule</h1><button class="btn btn-ghost" onclick="window.print()">${I('printer')} Imprimer</button></div>
    <div class="passport">
      <div class="pp-hero">
        <div class="pp-hero-glow"></div>
        <div class="pp-hero-main">
          <div class="pp-hero-icon">${I('car')}</div>
          <div class="pp-hero-title">
            <div class="pp-hero-make">${esc(v.make)} <b>${esc(v.model)}</b></div>
            <div class="pp-plate">${esc(v.plate)}</div>
          </div>
          <div class="pp-hero-score">
            ${ring(Math.min(score,100),100, score>=80?'ok':score>=50?'warn':'ko')}
            <span class="pp-score-label">Score d'entretien</span>
          </div>
        </div>
        <div class="pp-hero-chips">
          <span class="pp-chip">${I('calendar')} ${v.year}</span>
          <span class="pp-chip">${I('fuel')} ${FUEL_LABELS[v.fuel]||v.fuel||'—'}</span>
          <span class="pp-chip">${I('gauge')} ${Number(v.mileage).toLocaleString('fr')} km</span>
          ${v.vin ? `<span class="pp-chip pp-chip-vin">VIN ${esc(v.vin)}</span>` : ''}
        </div>
      </div>
      <div class="pp-grid">
        <div class="card pp-card"><h3>${I('info')} Identité du véhicule</h3>
          <div class="detail-grid" style="margin-top:0.5rem">
            <div><span class="hint">Marque</span><br><b>${esc(v.make)}</b></div>
            <div><span class="hint">Modèle</span><br><b>${esc(v.model)}</b></div>
            <div><span class="hint">Génération</span><br><b>${esc(v.generation||'—')}</b></div>
            <div><span class="hint">Année</span><br><b>${v.year}</b></div>
            <div><span class="hint">Moteur</span><br><b>${esc(v.engine||'—')}</b></div>
            <div><span class="hint">Cylindrée</span><br><b>${v.displacement||0} cc</b></div>
            <div><span class="hint">Boîte</span><br><b>${GEAR_LABELS[v.gearbox]||v.gearbox||'—'}</b></div>
            <div><span class="hint">Transmission</span><br><b>${TRANS_LABELS[v.transmission]||v.transmission||'—'}</b></div>
            <div><span class="hint">1ère circulation</span><br><b>${v.first_registration||'—'}</b></div>
            <div><span class="hint">Statut maintenance</span><br><b>${score>=80?'Excellent':score>=50?'A surveiller':'A traiter'}</b></div>
          </div>
        </div>
        <div class="card pp-card"><h3>${I('heart-pulse')} Suivi d'entretien</h3>
          <div style="display:flex;align-items:center;gap:1rem;margin:.6rem 0 0.2rem">
            ${scoreRing(score)}
            <div class="pp-bars" style="flex:1">${maintItems.slice(0,6).map(it => { const st = String(it.status||'').toUpperCase(); const pct = st==='OK'?100:st==='DUE_SOON'?55:st==='OVERDUE'?18:0; const cls = st==='OK'?'ok':st==='DUE_SOON'?'warn':'ko'; return `<div class="pp-bar-line"><span class="pp-bar-label">${esc(it.label||'')}</span><div class="pp-bar"><span class="pp-bar-fill ${cls}" style="width:${pct}%"></span></div></div>`; }).join('')}</div>
          </div>
          ${diagBySeverity.HAUTE ? `<p class="pp-alert">${I('alert-triangle')} ${diagBySeverity.HAUTE} point(s) de vigilance relevé(s) par les diagnostics</p>` : ''}
        </div>
      </div>
      <div class="card pp-card"><h3>${I('wrench')} Interventions (${pp.interventions.length})</h3>
        ${pp.interventions.length ? `<div class="pp-timeline">${pp.interventions.map(i => `<div class="pp-tl-item"><span class="pp-tl-dot"></span><div class="pp-tl-body"><div class="pp-tl-top"><b>${esc(i.diagnostic||'Intervention')}</b>${statusBadge(i.status)}</div><span class="hint">${new Date(i.created_at).toLocaleDateString('fr')} · ${esc(i.pro_name||'Professionnel C-AUTO')}</span></div></div>`).join('')}</div>` : '<p class="hint">Aucune intervention enregistrée</p>'}
      </div>
      <div class="pp-grid2">
        <div class="card pp-card"><h3>${I('stethoscope')} Diagnostics (${pp.diagnostics.length})</h3>
          ${pp.diagnostics.length ? `<div class="pp-severity">
            ${['HAUTE','MOYENNE','BASSE'].map(s => `<div class="pp-sev ${s==='HAUTE'?'ko':s==='MOYENNE'?'warn':'ok'}"><b>${pp.diagnostics.filter(d=>d.result_urgency===s).length}</b><span>${s==='HAUTE'?'Urgents':s==='MOYENNE'?'Modérés':'Légers'}</span></div>`).join('')}
          </div><div class="pp-list">${pp.diagnostics.slice(0,6).map(d => `<div class="pp-list-row"><span>${esc(d.category)}</span> ${severityBadge(d.result_urgency)}<br/><span class="hint">${new Date(d.created_at).toLocaleDateString('fr')}</span></div>`).join('')}</div>` : '<p class="hint">Aucun diagnostic</p>'}
        </div>
        <div class="card pp-card"><h3>${I('shield-check')} Garanties (${pp.warranties.length})</h3>
          ${pp.warranties.length ? `<div class="pp-warranties">${pp.warranties.map(w => `<div class="pp-warranty"><span class="pp-warranty-icon">${I('shield-check')}</span><span><b>Du ${w.starts_on}</b><br><span class="hint">au ${w.ends_on}</span><br>${esc(w.terms)}</span></div>`).join('')}</div>` : '<p class="hint">Aucune garantie active</p>'}
        </div>
      </div>
      <div class="passport-footer" style="text-align:center;padding:1rem"><span class="pp-stamp">Généré le ${new Date(pp.generated_at).toLocaleString('fr')}</span> · ${I('badge-check')} Passeport C-AUTO</div>
    </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== CARNET AUTOMOBILE ====== */
async function viewCarnet(id) {
  showLoading();
  const PAGE = 20;
  let loaded = [];
  let total = 0;
  let busy = false;
  let makeModel = '';
  const row = (e) => {
    const d = new Date(e.created_at);
    const details = typeof e.details === 'string' ? JSON.parse(e.details || '{}') : (e.details || {});
    return `<div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-card card">
        <div class="timeline-date">${d.toLocaleDateString('fr')} · ${details.odometer_km ? Number(details.odometer_km).toLocaleString('fr') + ' km' : ''}</div>
        <h3>${esc(e.title)}</h3>
        <p class="hint">${esc(e.entry_type)} · v${e.version}${e.author_name ? ' · ' + esc(e.author_name) : ''}</p>
      </div>
    </div>`;
  };
  const draw = () => {
    layoutApp(`
    <a href="#/vehicles/${id}" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour à la fiche</a>
    <div class="section-title" style="margin-bottom:1rem">${I('clock')} Carnet automobile — ${esc(makeModel)}</div>
    <div class="timeline">
      ${loaded.map(row).join('')}
      ${loaded.length === 0 ? '<div class="empty-state">' + I('clock') + '<h3>Carnet vide</h3><p>Les événements apparaîtront ici.</p></div>' : ''}
    </div>
    ${loaded.length < total ? `<button class="btn btn-ghost" id="carnet-more" style="margin-top:1rem;width:100%">${I('chevrons-down')} Charger plus (${(total - loaded.length).toLocaleString('fr')} restant${total - loaded.length > 1 ? 's' : ''})</button>` : `<p class="hint" style="text-align:center;margin-top:1rem">Fin du carnet — ${total} événement${total > 1 ? 's' : ''}</p>`}
    `);
    const btn = document.getElementById('carnet-more');
    if (btn) btn.onclick = async () => {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      try {
        const r = await api(`/vehicles/${id}/history?limit=${PAGE}&offset=${loaded.length}`);
        loaded = loaded.concat(r.history);
        total = r.total;
        draw();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
      finally { busy = false; }
    };
    hideLoading(); renderIcons();
  };
  try {
    const [v, r] = await Promise.all([
      api('/vehicles/' + id),
      api(`/vehicles/${id}/history?limit=${PAGE}`)
    ]);
    makeModel = v.vehicle.make + ' ' + v.vehicle.model;
    loaded = r.history;
    total = r.total;
    draw();
  } catch (e) { layoutApp(err(e)); hideLoading(); renderIcons(); }
}

/* ====== DIAGNOSTIC WIZARD ====== */
async function viewDiagnostic() {
  showLoading();
  try {
    const { vehicles } = await api('/vehicles');
    const { categories } = await api('/diagnostic/categories');
    const selectedVehicle = vehicles[0] || null;
    layoutApp(`
    <div class="section-title" style="margin-bottom:1rem">${I('stethoscope')} Diagnostic intelligent</div>
    <div class="card" style="max-width:700px">
      <form id="f-diag">
        <label>${I('car')} Véhicule
          <select name="vehicle_id" required>${vehicles.map(v => `<option value="${v.id}" ${selectedVehicle&&v.id===selectedVehicle.id?'selected':''}>${esc(v.make)} ${esc(v.model)} (${esc(v.plate)})</option>`).join('')}</select>
        </label>
        <label>${I('tag')} Catégorie du problème
          <select name="category" required><option value="">— Choisissez —</option>${categories.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select>
        </label>
        <label>${I('message-square')} Décrivez les symptômes *
          <textarea name="symptom_text" rows="4" required placeholder="Ex: bruit au freinage, sifflement quand je freine, voyant ABS allumé..."></textarea>
        </label>
        <label>${I('hash')} Codes défaut (DTC) — optionnel
          <input name="dtc_codes" placeholder="Ex: P0301, C0035 (séparés par virgule)">
        </label>
        <button type="submit" style="margin-top:0.5rem">${I('search')} Lancer l'analyse IA</button>
      </form>
    </div>
    `);
    document.getElementById('f-diag').onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      const dtc = o.dtc_codes ? o.dtc_codes.split(',').map(s=>s.trim()).filter(Boolean) : [];
      try {
        const result = await api('/diagnostic',{method:'POST',body:{
          vehicle_id: o.vehicle_id, category: o.category, symptom_text: o.symptom_text, dtc_codes: dtc
        }});
        viewDiagResult(result.session);
      } catch(e) { toast(e.message,'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function viewDiagResult(session) {
  const hypotheses = typeof session.result_hypotheses === 'string' ? JSON.parse(session.result_hypotheses) : session.result_hypotheses;
  const controls = typeof session.result_controls === 'string' ? JSON.parse(session.result_controls) : session.result_controls;
  const urgColor = session.result_urgency==='HAUTE'?'var(--danger)':session.result_urgency==='MOYENNE'?'var(--orange)':'var(--green)';
  layoutApp(`
    <a href="#/diagnostic" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Nouveau diagnostic</a>
    <div class="section-title" style="margin-bottom:1rem">${I('stethoscope')} Résultat du diagnostic</div>
    <div class="diag-result">
      <div class="card diag-summary" style="border-left:4px solid ${urgColor}">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
          <div><span class="badge badge-accent">${esc(session.category)}</span> <span class="badge badge-${session.result_urgency==='HAUTE'?'ko':session.result_urgency==='MOYENNE'?'warn':'ok'}">${esc(session.result_urgency)}</span></div>
          <div>Confiance: <b>${esc(session.result_confidence)}</b></div>
        </div>
        <p style="margin-top:0.8rem">${esc(session.result_comprehension)}</p>
      </div>
      <div class="card"><h3>${I('brain')} Hypothèses probables</h3>
        ${hypotheses.map(h => `<div class="hypothesis"><div style="display:flex;justify-content:space-between"><b>${esc(h.label)}</b><span class="badge badge-accent">${h.probability}%</span></div><p class="hint" style="margin:0.2rem 0 0">${esc(h.explanation)}</p></div>`).join('')}
      </div>
      <div class="card"><h3>${I('clipboard-check')} Contrôles recommandés</h3>
        <ul style="list-style:none;padding:0">${controls.map(c => `<li style="padding:0.3rem 0;display:flex;gap:0.5rem">${I('check-circle')} ${esc(c)}</li>`).join('')}</ul>
      </div>
      <div class="card" style="text-align:center"><p>Vous pensez que c'est un ${esc(session.category)} ? Trouvez le bon professionnel :</p>
        <div style="display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap">
          <a href="#/service-requests/new?vehicle_id=${esc(session.vehicle_id)}&category=${esc(session.category)}&problem_description=${esc(session.symptom_text || '')}" class="btn btn-primary" style="margin-top:0.5rem">${I('file-text')} Demander un devis</a>
          <a href="#/pros?vehicle=${esc(session.vehicle_id)}&category=${esc(session.category)}" class="btn btn-ghost" style="margin-top:0.5rem">${I('search')} Rechercher un professionnel</a>
        </div>
      </div>
    </div>
  `);
  renderIcons();
}

/* ====== RENDEZ-VOUS ====== */
async function viewAppointments() {
  showLoading();
  try {
    const { appointments } = await api('/appointments/mine');
    layoutApp(`
    <div class="section-title" style="margin-bottom:1rem">${I('calendar')} Mes rendez-vous</div>
    ${appointments.length ? appointments.map(a => `
      <div class="card appt-card"><div class="appt-info">
        <div class="appt-icon">${I('car')}</div>
        <div style="flex:1"><strong>${esc(a.make)} ${esc(a.model)}</strong> <span class="hint">${esc(a.plate)}</span>
          <div style="font-size:0.85rem;color:var(--muted);margin-top:0.2rem">${I('user')} ${esc(a.professional_name)} · ${esc(a.specialty)}<br>${I('clock')} ${new Date(a.scheduled_at).toLocaleString('fr')}</div>
        </div>
        <div>${statusBadge(a.status)}</div>
      </div>
      <div class="appt-actions">
        ${a.intervention_id ? `<a class="btn btn-ghost" href="#/intervention/${a.intervention_id}">${I('wrench')} Intervention</a>` : ''}
      </div></div>`).join('') : '<div class="empty-state">'+I('calendar-x')+'<h3>Aucun rendez-vous</h3><p>Rechercher un professionnel depuis la fiche véhicule.</p></div>'}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== INTERVENTIONS LISTE ====== */
async function viewInterventions() {
  showLoading();
  try {
    const { interventions } = await api('/interventions/mine').catch(()=>({interventions:[]}));
    layoutApp(`
    <div class="section-title" style="margin-bottom:1rem">${I('wrench')} Mes réparations</div>
    ${interventions.length ? interventions.map(i => `
      <a href="#/intervention/${i.id}" class="card" style="display:block;margin-bottom:0.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(i.plate||'Intervention')}</b>${statusBadge(i.status)}</div>
        <p class="hint" style="margin:0.3rem 0 0">${new Date(i.created_at).toLocaleDateString('fr')}</p>
      </a>`).join('') : '<div class="empty-state">'+I('wrench')+'<h3>Aucune intervention</h3></div>'}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== INTERVENTION DÉTAIL ====== */
const STEPS = ['DIAGNOSTIC','QUOTE_SENT','QUOTE_APPROVED','REPAIRING','QUALITY_CHECK','CLIENT_VALIDATION','CLOSED'];
const STEP_LABELS = ['Diagnostic','Devis','Validé','Réparation','Contrôle','Réception','Clôturé'];
function renderStepper(current) { const idx=STEPS.indexOf(current); return `<div class="stepper">${STEPS.map((s,i)=>{const cls=i<idx?'done':i===idx?'active':'';return `<div class="step ${cls}"><div class="step-dot">${i<idx?I('check'):(i+1)}</div><span class="step-label">${STEP_LABELS[i]}</span></div>${i<STEPS.length-1?'<div class="step-line"></div>':''}`;}).join('')}</div>`; }

async function viewIntervention(id) {
  showLoading();
  try {
    const d = await api('/interventions/'+id);
    const i = d.intervention;
    layoutApp(`
    <a href="#/interventions" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour</a>
    <div class="section-title" style="margin-bottom:0.5rem">${I('wrench')} Intervention ${statusBadge(i.status)}</div>
    ${renderStepper(i.status)}
    <div class="card" style="margin-top:1rem"><h3>${I('stethoscope')} Diagnostic</h3>
      ${d.diagnostic ? `<p>${esc(d.diagnostic.content)}</p>` : '<p class="hint">En attente</p>'}
    </div>
    ${d.quote ? `<div class="card" style="margin-top:1rem"><h3>${I('receipt')} Devis</h3>
      <table style="width:100%;font-size:0.88rem"><tr><th>Élément</th><th>Qté</th><th>P.U.</th><th>Total</th></tr>
      ${d.quote.items.map(it => `<tr><td>${esc(it.label)}</td><td>${it.qty}</td><td>${money(it.unit_price_cents)}</td><td>${money(Math.round(it.qty*it.unit_price_cents))}</td></tr>`).join('')}
      <tr style="font-weight:700"><th colspan="3">TOTAL</th><th>${money(d.quote.total_cents)}</th></tr></table>
      <div style="margin-top:0.5rem">${statusBadge(d.quote.status)}</div>
    </div>` : ''}
    <div class="card" style="margin-top:1rem"><h3>${I('tool')} Réparation</h3>
      ${d.repair_order ? `<ul style="list-style:none;padding:0">${(d.repair_order.tasks||[]).map(t=>`<li>${t.done?I('check-circle'):I('circle')} ${esc(t.label)}</li>`).join('')}</ul>` : '<p class="hint">Pas encore d\'ordre de réparation</p>'}
    </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== PROFIL ====== */
async function viewProfile() {
  showLoading();
  try {
    const { user } = await api('/auth/me');
    const ROLE_LABELS = { CLIENT: 'Client', GARAGE: 'Garage', MECANICIEN: 'Mécanicien', EXPERT: 'Expert', SUPPLIER: 'Fournisseur', ADMIN: 'Administrateur', SUPER_ADMIN: 'Super Admin' };
    const roleLabel = ROLE_LABELS[user.role] || user.role;
    const joined = new Date(user.created_at).toLocaleDateString('fr');
    const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    layoutApp(`
    <div class="pp-profile">
      <div class="pro-profile-hero card">
        <div class="pp-avatar"><span class="pp-avatar-text">${esc(initials)}</span></div>
        <div class="pp-ident">
          <h1>${esc(user.name)}</h1>
          <div class="pp-badges"><span class="badge badge-accent">${esc(roleLabel)}</span></div>
          <p class="hint">${esc(user.email)}${user.country ? ' · ' + esc(user.country) : ''}</p>
        </div>
        <div class="pp-rating">
          <span class="badge badge-accent">${esc(roleLabel)}</span>
          <p class="hint" style="margin:.35rem 0 0">Membre depuis le ${joined}</p>
        </div>
      </div>

      <div class="card pp-synth-card">
        <div class="pp-synth-head">
          <h3>${I('file-text')} Synthèse du profil</h3>
          <span class="badge badge-ok">${I('check-circle')} Dossier à jour</span>
        </div>
        <div class="pp-synthesis">
          <div class="pp-srow"><span>${I('user')} Nom complet</span><b>${esc(user.name)}</b></div>
          <div class="pp-srow"><span>${I('mail')} Email</span><b>${esc(user.email)}</b></div>
          <div class="pp-srow"><span>${I('phone')} Téléphone</span><b>${esc(user.phone || '—')}</b></div>
          <div class="pp-srow"><span>${I('shield')} Rôle</span><b>${esc(roleLabel)}</b></div>
          <div class="pp-srow"><span>${I('globe')} Pays</span><b>${esc(user.country || '—')}</b></div>
          <div class="pp-srow"><span>${I('calendar')} Membre depuis</span><b>${joined}</b></div>
        </div>
        <div class="pp-submit-zone">
          <p class="hint">${I('info')} Vos coordonnées servent à sécuriser vos échanges sur C-AUTO.</p>
          <button type="button" class="btn btn-primary" id="btn-toggle-edit" aria-expanded="false">${I('settings-2')} Modifier mes informations</button>
        </div>
      </div>

      <div class="card hidden" id="profile-edit-card">
        <h3 style="margin:0 0 .8rem">${I('settings-2')} Modifier mes informations</h3>
        <form id="f-profile" class="pp-form">
          <label>Nom complet <input name="name" value="${esc(user.name)}" minlength="2" required></label>
          <label>Email <input name="email" type="email" value="${esc(user.email)}" required></label>
          <label>Téléphone <input name="phone" type="tel" value="${esc(user.phone || '')}" pattern="\\+[0-9]{8,15}" placeholder="+22990000000" required></label>
          <details class="pp-pass">
            <summary>${I('lock')} Changer le mot de passe (optionnel)</summary>
            <label>Mot de passe actuel <input name="current_password" type="password" autocomplete="current-password" placeholder="Votre mot de passe actuel"></label>
            <label>Nouveau mot de passe <input name="new_password" type="password" minlength="8" autocomplete="new-password" placeholder="Min. 8 caractères"></label>
          </details>
          <button type="submit" class="btn btn-primary">${I('save')} Enregistrer les modifications</button>
        </form>
      </div>
    </div>
    `);
    const toggle = document.getElementById('btn-toggle-edit');
    const editCard = document.getElementById('profile-edit-card');
    if (toggle && editCard) toggle.onclick = () => {
      const hidden = editCard.classList.toggle('hidden');
      toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      if (!hidden) editCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    document.getElementById('f-profile').onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      if (!o.current_password && !o.new_password) { delete o.current_password; delete o.new_password; }
      else if (!o.current_password || !o.new_password) { toast('Renseignez le mot de passe actuel ET le nouveau mot de passe', 'error'); return; }
      try {
        const d = await api('/auth/me', { method: 'PATCH', body: o });
        toast('Profil mis à jour', 'success');
        if (d.user) S.user = { ...S.user, ...d.user };
        localStorage.setItem('user', JSON.stringify(S.user));
        viewProfile();
      } catch (e) { toast(e.message, 'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== NOTIFICATIONS ====== */
async function viewNotifications() {
  showLoading();
  try {
    const { notifications } = await api('/admin/notifications');
    layoutApp(`
    <div class="section-title" style="margin-bottom:1rem">${I('bell')} Notifications</div>
    ${notifications.length ? notifications.map(n => `
      <div class="alert alert-info">${I('bell')}<div style="flex:1"><p style="margin:0">${esc(n.message)}</p><small>${new Date(n.created_at).toLocaleString('fr')}</small></div>
      <button class="btn-ghost btn-sm notif-del" data-id="${n.id}">${I('x')}</button></div>`).join('') : '<div class="empty-state">'+I('bell-off')+'<h3>Aucune notification</h3></div>'}
    `);
    document.querySelectorAll('.notif-del').forEach(b => b.onclick = async () => {
      try { await api('/admin/notifications/'+b.dataset.id+'/read',{method:'PATCH'}); toast('Supprimée','success'); viewNotifications(); } catch(e) { toast(e.message,'error'); }
    });
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== PROS ====== */
async function viewPros(params) {
  showLoading();
  try {
    const q = new URLSearchParams(params);
    const d = await api('/professionals?'+q.toString());
    layoutApp(`
    <div class="section-title" style="margin-bottom:1rem">${I('search')} Professionnels</div>
    ${d.professionals.length ? d.professionals.map(p => `
      <div class="card pro-card"><div class="pro-header">
        <div class="pro-avatar">${I('user')}</div>
        <div><strong>${esc(p.professional_name)}${p.is_certified ? certBadge() : ''}</strong><div><span class="badge badge-accent">${esc(p.specialty)}</span></div>
          <div style="margin-top:0.3rem;font-size:0.85rem;color:var(--muted)">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5-Math.round(p.rating))} ${Number(p.rating).toFixed(1)}/5</div></div>
        <div class="pro-score">${I('target')} Score ${p.match_score}/100</div>
      </div>
      <form class="f-appt" data-pro="${p.id}">
        <label>${I('calendar')} Date <input type="datetime-local" name="scheduled_at" required value="${new Date(Date.now()+86400000).toISOString().slice(0,16)}"></label>
        <button type="submit">${I('calendar-check')} Demander RDV</button>
      </form></div>`).join('') : '<div class="empty-state">'+I('search-x')+'<h3>Aucun professionnel trouvé</h3></div>'}
    `);
    document.querySelectorAll('.f-appt').forEach(f => f.onsubmit = async (ev) => {
      ev.preventDefault();
      const scheduled_at = new Date(new FormData(f).get('scheduled_at')).toISOString();
      try { await api('/appointments',{method:'POST',body:{vehicle_id:q.get('vehicle'),professional_id:f.dataset.pro,scheduled_at}}); toast('RDV créé','success'); location.hash='#/appointments'; }
      catch(e) { toast(e.message,'error'); }
    });
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== CODES DÉFAUT ====== */
async function viewFaultCodes() {
  showLoading();
  try {
    const [codesData, systemsData] = await Promise.all([
      api('/fault-codes'),
      api('/fault-codes/systems')
    ]);
    layoutApp(`
    <div class="section-title" style="margin-bottom:1rem">${I('hash')} Codes défaut (DTC)</div>
    <p class="hint" style="margin-bottom:1rem">Base de données de codes défaut OBD-II. Recherchez par code ou par système.</p>
    <div class="card" style="margin-bottom:1rem">
      <form id="f-search-code" style="display:flex;gap:0.5rem;align-items:end;flex-wrap:wrap">
        <label style="flex:1;min-width:200px;margin:0">${I('search')} Rechercher un code
          <input name="q" placeholder="Ex: P0301, C0035..." style="margin-top:0.3rem">
        </label>
        <label style="margin:0">${I('filter')} Système
          <select name="system" style="margin-top:0.3rem"><option value="">Tous</option>${systemsData.systems.map(s => `<option value="${s.code_prefix}">${s.code_prefix} — ${esc(s.name)}</option>`).join('')}</select>
        </label>
        <button type="submit" class="btn btn-sm">${I('search')} Rechercher</button>
      </form>
    </div>
    <div id="fault-codes-list">
      ${codesData.fault_codes.length ? `<div class="grid-cards">${codesData.fault_codes.map(fc => `
        <a href="#/fault-codes/${esc(fc.code)}" class="card veh-card-link">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
            <span style="font-size:0.95rem;font-weight:700;color:var(--accent)">${esc(fc.code)}</span>
            ${severityBadge(fc.severity)}
          </div>
          <p style="margin:0.2rem 0;font-size:0.85rem;color:var(--text)">${esc(fc.interpretation)}</p>
          <p class="hint" style="margin:0.2rem 0;font-size:0.78rem">${esc(fc.system_name||'')}</p>
        </a>`).join('')}</div>` : '<div class="empty-state">'+I('hash')+'<h3>Aucun code trouvé</h3></div>'}
    </div>
    `);
    document.getElementById('f-search-code').onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      const params = new URLSearchParams();
      if (o.q) params.set('q', o.q);
      if (o.system) params.set('system', o.system);
      try {
        const data = await api('/fault-codes?' + params.toString());
        document.getElementById('fault-codes-list').innerHTML = data.fault_codes.length ?
          `<div class="grid-cards">${data.fault_codes.map(fc => `
            <a href="#/fault-codes/${esc(fc.code)}" class="card veh-card-link">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
                <span style="font-size:0.95rem;font-weight:700;color:var(--accent)">${esc(fc.code)}</span>
                ${severityBadge(fc.severity)}
              </div>
              <p style="margin:0.2rem 0;font-size:0.85rem;color:var(--text)">${esc(fc.interpretation)}</p>
              <p class="hint" style="margin:0.2rem 0;font-size:0.78rem">${esc(fc.system_name||'')}</p>
            </a>`).join('')}</div>` :
          '<div class="empty-state">'+I('hash')+'<h3>Aucun code trouvé</h3></div>';
        renderIcons();
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

async function viewFaultCodeDetail(code) {
  showLoading();
  try {
    const { fault_code: fc } = await api('/fault-codes/' + encodeURIComponent(code));
    const severityColors = { CRITIQUE: 'ko', ELEVEE: 'ko', MOYENNE: 'warn', BASSE: 'ok' };
    const severityLabels = { CRITIQUE: 'Critique', ELEVEE: 'Élevée', MOYENNE: 'Moyenne', BASSE: 'Basse' };
    layoutApp(`
    <a href="#/fault-codes" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour à la liste</a>
    <div class="page-top"><h1>${I('hash')} ${esc(fc.code)}</h1>
      <div>${severityBadge(fc.severity)}</div>
    </div>
    <div class="card" style="margin-bottom:1rem;border-left:4px solid ${fc.severity==='CRITIQUE'||fc.severity==='ELEVEE'?'var(--ko)':fc.severity==='MOYENNE'?'var(--warn)':'var(--ok)'}">
      <h2 style="margin-bottom:0.3rem">${esc(fc.interpretation)}</h2>
      <p style="margin:0.3rem 0;color:var(--text2);font-size:0.9rem">${esc(fc.description)}</p>
      <div style="margin-top:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap">
        <span class="badge badge-accent">${esc(fc.system_name||'N/A')}</span>
        <span class="badge badge-muted">${esc(severityLabels[fc.severity]||fc.severity)}</span>
      </div>
    </div>
    ${fc.causes.length ? `<div class="card" style="margin-bottom:1rem"><h3>${I('alert-triangle')} Causes possibles</h3>${fc.causes.map(c => {
      const probColor = c.probability==='ELEVEE'?'ko':c.probability==='MOYENNE'?'warn':'ok';
      return `<div style="padding:0.5rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:0.88rem">${esc(c.label)}</span>
        <span class="badge badge-${probColor}">${esc(c.probability)}</span>
      </div>`;
    }).join('')}</div>` : ''}
    ${fc.tests.length ? `<div class="card" style="margin-bottom:1rem"><h3>${I('clipboard-check')} Contrôles recommandés</h3>${fc.tests.map(t => `
      <div style="padding:0.5rem 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.2rem">
          ${I('check-circle')} <b style="font-size:0.88rem">${esc(t.label)}</b>
        </div>
        ${t.description ? `<p class="hint" style="margin:0;font-size:0.82rem">${esc(t.description)}</p>` : ''}
      </div>`).join('')}</div>` : ''}
    <div class="card"><h3>${I('info')} Sources</h3><p class="hint" style="font-size:0.82rem">Code standard OBD-II. Pour des informations spécifiques au véhicule, consultez la documentation du constructeur.</p></div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== ENTRETIEN - VUE GLOBALE ====== */
async function viewMaintenance() {
  showLoading();
  try {
    const { vehicles } = await api('/maintenance');
    layoutApp(`
    <div class="section-title" style="margin-bottom:1rem">${I('wrench')} Entretien</div>
    ${vehicles.length ? `
    <div class="grid-cards">${vehicles.map(v => `
      <a href="#/maintenance/${v.id}" class="card veh-card-link">
        <div class="veh-card-header"><div class="veh-card-icon">${I('car')}</div><span class="badge badge-muted">${v.year}</span></div>
        <h3>${esc(v.make)} ${esc(v.model)}</h3>
        <div class="veh-card-plate">${esc(v.plate)}</div>
        <div class="veh-card-km">${Number(v.mileage).toLocaleString('fr')} km</div>
      </a>`).join('')}</div>` : '<div class="empty-state">'+I('wrench')+'<h3>Aucun véhicule</h3><p>Ajoutez un véhicule pour gérer son entretien.</p></div>'}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

async function viewVehicleMaintenance(id) {
  showLoading();
  try {
    const data = await api('/maintenance/vehicle/' + id);
    const v = data.vehicle;
    const activeTab = window._maintTab || 'constructor';
    layoutApp(`
    <a href="#/maintenance" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour</a>
    <div class="page-top"><h1>${I('wrench')} ${esc(v.make)} ${esc(v.model)} — Entretien</h1>
      <div>${scoreRing(data.score)}</div>
    </div>
    <div class="tab-bar" id="maint-tabs">
      <a href="#" data-tab="constructor" class="${activeTab==='constructor'?'active':''}">${I('book')} Programme constructeur</a>
      <a href="#" data-tab="reco" class="${activeTab==='reco'?'active':''}">${I('brain')} Recommandation C-AUTO</a>
      <a href="#" data-tab="actual" class="${activeTab==='actual'?'active':''}">${I('wrench')} Entretien réel</a>
    </div>
    <div id="maint-content"></div>
    `);
    function renderTab(tab) {
      window._maintTab = tab;
      document.querySelectorAll('#maint-tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      const el = document.getElementById('maint-content');
      const fadeEl = () => { el.classList.remove('tab-fade'); void el.offsetWidth; el.classList.add('tab-fade'); };
      if (tab === 'constructor') {
        el.innerHTML = `
          <div class="card" style="margin-bottom:1rem;border-left:4px solid var(--accent)">
            <h3>${I('book')} Programme constructeur</h3>
            ${data.manufacturer_program && data.manufacturer_program.program ? `
              <div style="margin:0.5rem 0"><span class="badge badge-accent">${esc(data.manufacturer_program.manufacturer.name)}</span> <span class="badge badge-muted">v${data.manufacturer_program.program.version}</span></div>
              <p class="hint" style="font-size:0.85rem">${esc(data.manufacturer_program.program.description||'')}</p>
              ${data.manufacturer_program.intervals.length ? `
                <div style="margin-top:1rem">${data.manufacturer_program.intervals.map(iv => {
                  const ops = (iv.operations || []).filter(o => o);
                  const checks = (iv.checks || []).filter(c => c);
                  return `<div class="card" style="margin-bottom:0.8rem;padding:0.8rem !important">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
                      <b style="font-size:0.9rem">${esc(iv.label)}</b>
                      <div><span class="badge badge-accent">${iv.interval_km.toLocaleString('fr')} km</span> <span class="badge badge-muted">${iv.interval_months} mois</span></div>
                    </div>
                    ${ops.length ? `<div style="margin-top:0.3rem">${ops.map(op => `<div style="display:flex;align-items:center;gap:0.3rem;padding:0.2rem 0;font-size:0.82rem">${op.is_check_only ? I('eye') : I('wrench')} ${esc(op.label)}${op.description ? ' <span class="hint">— ' + esc(op.description) + '</span>' : ''}</div>`).join('')}</div>` : ''}
                    ${checks.length ? `<div style="margin-top:0.3rem;border-top:1px solid var(--border);padding-top:0.3rem"><span class="hint" style="font-size:0.75rem">Contrôles :</span> ${checks.map(c => `<span class="badge badge-muted" style="margin:0.1rem">${esc(c.label)}</span>`).join(' ')}</div>` : ''}
                  </div>`;
                }).join('')}</div>` : ''}
              ${data.manufacturer_program.sources.length ? `<div style="margin-top:0.8rem"><span class="hint" style="font-size:0.78rem">Sources : ${data.manufacturer_program.sources.map(s => esc(s.title)).join(', ')}</span></div>` : ''}
            ` : `<div class="alert alert-warn">${I('alert-triangle')} Information constructeur non disponible. Vérification professionnelle recommandée.</div>
            ${data.program_constructor.length ? `<div style="margin-top:0.8rem"><span class="hint">Règles d'entretien disponibles :</span>${data.program_constructor.map(item => renderMaintItem(item)).join('')}</div>` : ''}
            `}
          </div>`;
      } else if (tab === 'reco') {
        el.innerHTML = `
          <div class="card" style="margin-bottom:1rem;border-left:4px solid var(--purple)">
            <h3>${I('brain')} Recommandation C-AUTO</h3>
            <p class="hint" style="margin-bottom:0.8rem">Analyse basée sur le kilométrage, l'âge du véhicule et l'historique d'entretien.</p>
            ${data.recommendations_cauto.length ? data.recommendations_cauto.map(item => renderMaintItem(item)).join('') : '<p class="hint">Aucune recommandation spécifique pour ce véhicule.</p>'}
            ${data.all.length ? `
              <div style="margin-top:1rem"><h3>${I('list')} Toutes les opérations</h3>
              ${data.all.map(item => renderMaintItem(item)).join('')}
            </div>` : ''}
          </div>`;
      } else {
        el.innerHTML = `
          <div class="card" style="margin-bottom:1rem;border-left:4px solid var(--ok)">
            <h3>${I('wrench')} Entretien réellement effectué</h3>
            ${data.actual_records.length ? `
              <div class="timeline" style="margin-top:0.8rem">${data.actual_records.map(r => `
                <div class="timeline-item"><div class="timeline-dot"></div>
                  <div class="timeline-card card">
                    <div class="timeline-date">${new Date(r.done_at).toLocaleDateString('fr')} · ${Number(r.odometer_km).toLocaleString('fr')} km</div>
                    <h3>${esc(r.label)}</h3>
                    <p class="hint">${esc(r.type)}</p>
                  </div>
                </div>`).join('')}</div>` : '<p class="hint" style="margin-top:0.5rem">Aucun entretien enregistré.</p>'}
          </div>
          <div class="card"><h3>${I('plus')} Ajouter un entretien réalisé</h3>
            <form id="f-add-record" style="margin-top:0.5rem">
              <label>Opération *
                <select name="rule_id" required><option value="">— Choisir —</option>${data.all.map(item => `<option value="${item.rule_id}">${esc(item.label)}</option>`).join('')}</select>
              </label>
              <div class="form-row-2">
                <label>Date * <input name="done_at" type="date" required value="${new Date().toISOString().slice(0,10)}"></label>
                <label>Kilométrage * <input name="odometer_km" type="number" min="0" required value="${v.mileage}"></label>
              </div>
              <button type="submit" style="margin-top:0.5rem">${I('save')} Enregistrer</button>
            </form>
          </div>`;
        document.getElementById('f-add-record').onsubmit = async (ev) => {
          ev.preventDefault();
          const o = Object.fromEntries(new FormData(ev.target));
          try {
            await api('/vehicles/' + id + '/maintenance/records', { method: 'POST', body: { rule_id: o.rule_id, done_at: o.done_at, odometer_km: +o.odometer_km } });
            toast('Entretien enregistré', 'success');
            viewVehicleMaintenance(id);
          } catch(e) { toast(e.message, 'error'); }
        };
      }
      fadeEl();
      renderIcons();
    }
    renderTab(activeTab);
    document.querySelectorAll('#maint-tabs a').forEach(a => {
      a.onclick = (ev) => { ev.preventDefault(); renderTab(a.dataset.tab); };
    });
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function renderMaintItem(item) {
  const statusMap = { OVERDUE: { cls: 'ko', icon: 'alert-circle', label: 'ÉCHUE' }, DUE_SOON: { cls: 'warn', icon: 'clock', label: 'Bientôt' }, OK: { cls: 'ok', icon: 'check-circle', label: 'OK' } };
  const st = statusMap[item.status] || statusMap.OK;
  return `<div class="extra ${item.status}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:0.4rem">
        <span class="badge badge-${st.cls}">${I(st.icon)} ${st.label}</span>
        <b style="font-size:0.88rem">${esc(item.label)}</b>
      </div>
      <span class="badge badge-muted">${item.source}</span>
    </div>
    <div style="margin-top:0.3rem;font-size:0.8rem;color:var(--muted)">
      Intervalle: ${item.interval_km.toLocaleString('fr')} km / ${item.interval_months} mois
      ${item.next_due_km ? ` — Prochain: ${item.next_due_km.toLocaleString('fr')} km ou ${item.next_due_date}` : ''}
      ${item.km_left !== undefined ? ` — ${item.km_left} km restants, ${item.days_left} jours` : ''}
    </div>
  </div>`;
}

/* ====== ROUTER ====== */
const routes = [
  [/^#\/login$/, () => viewLogin()],
  [/^#\/register$/, () => viewRegister()],
  [/^#\/$/, () => (S.user ? (S.user.role==='SUPPLIER' ? location.hash='#/supplier/dashboard' : (isPro() ? location.hash='#/pro/dashboard' : (isAdmin() ? location.hash='#/admin/dashboard' : viewDashboard()))) : viewLogin())],
  [/^#\/app$/, () => viewDashboard()],
  [/^#\/mobile$/, () => viewMobile()],
  [/^#\/fleet$/, () => location.hash = '#/fleet/dashboard'],
  [/^#\/fleet\/dashboard$/, () => viewFleetDashboard()],
  [/^#\/fleet\/vehicles$/, () => viewFleetVehicles()],
  [/^#\/fleet\/drivers$/, () => viewFleetDrivers()],
  [/^#\/fleet\/maintenance$/, () => viewFleetMaintenance()],
  [/^#\/fleet\/repairs$/, () => viewFleetRepairs()],
  [/^#\/fleet\/costs$/, () => viewFleetCosts()],
  [/^#\/fleet\/incidents$/, () => viewFleetIncidents()],
  [/^#\/fleet\/reports$/, () => viewFleetReports()],
  [/^#\/parts(?:\?.*)?$/, () => viewParts()],
  [/^#\/parts\/orders$/, () => viewPartsOrders()],
  [/^#\/parts\/([0-9a-f-]+)$/, (m) => viewPartDetail(m[1])],
  [/^#\/suppliers$/, () => viewSuppliers()],
  [/^#\/suppliers\/([0-9a-f-]+)$/, (m) => viewSupplierPage(m[1])],
  [/^#\/app\/parts\/orders$/, () => viewPartsOrders()],
  [/^#\/app\/parts(?:\?.*)?$/, () => viewParts()],
  [/^#\/app\/parts\/([0-9a-f-]+)$/, (m) => viewPartDetail(m[1])],
  [/^#\/app\/suppliers$/, () => viewSuppliers()],
  [/^#\/app\/suppliers\/([0-9a-f-]+)$/, (m) => viewSupplierPage(m[1])],
  [/^#\/supplier$/, () => location.hash = '#/supplier/dashboard'],
  [/^#\/supplier\/dashboard$/, () => viewSupplierDashboard()],
  [/^#\/supplier\/products$/, () => viewSupplierProducts()],
  [/^#\/supplier\/products\/new$/, () => viewSupplierProductNew()],
  [/^#\/supplier\/products\/([0-9a-f-]+)$/, (m) => viewSupplierProductEdit(m[1])],
  [/^#\/supplier\/orders$/, () => viewSupplierOrders()],
  [/^#\/supplier\/inventory$/, () => viewSupplierInventory()],
  [/^#\/supplier\/profile$/, () => viewSupplierProfile()],
  [/^#\/pro\/dashboard$/, () => viewProDashboard()],
  [/^#\/pro\/service-requests$/, () => viewProServiceRequests()],
  [/^#\/pro\/service-requests\/([0-9a-f-]+)$/, (m) => viewProServiceRequestDetail(m[1])],
  [/^#\/pro\/repairs$/, () => viewProRepairs()],
  [/^#\/pro\/quotes$/, () => viewProQuotes()],
  [/^#\/pro\/appointments$/, () => viewProAppointments()],
  [/^#\/pro\/warranties$/, () => viewWarranties()],
  [/^#\/pro\/ratings$/, () => viewProRatings()],
  [/^#\/pro\/disputes$/, () => viewProDisputes()],
  [/^#\/pro\/profile$/, () => viewProProfile()],
  [/^#\/vehicles$/, () => viewVehicles()],
  [/^#\/vehicles\/new$/, () => viewVehicleNew()],
  [/^#\/vehicles\/([0-9a-f-]+)\/passport$/, (m) => viewPassport(m[1])],
  [/^#\/vehicles\/([0-9a-f-]+)\/history$/, (m) => viewCarnet(m[1])],
  [/^#\/vehicles\/([0-9a-f-]+)\/edit$/, (m) => viewVehicleEdit(m[1])],
  [/^#\/vehicles\/([0-9a-f-]+)$/, (m) => viewVehicleDetail(m[1])],
  [/^#\/professionals$/, () => viewProfessionals()],
  [/^#\/professionals\/([0-9a-f-]+)$/, (m) => viewProfessionalDetail(m[1])],
  [/^#\/innovations$/, () => viewInnovations()],
  [/^#\/innovations\/avis$/, () => viewInnovationAvis()],
  [/^#\/innovations\/rappel$/, () => viewInnovationRappel()],
  [/^#\/innovations\/sos$/, () => viewInnovationSos()],
  [/^#\/innovations\/forfaits$/, () => viewInnovationForfaits()],
  [/^#\/innovations\/passeport$/, () => viewInnovationPasseport()],
  [/^#\/innovations\/ev$/, () => viewInnovationEv()],
  [/^#\/innovations\/valeur$/, () => viewInnovationValeur()],
  [/^#\/service-requests$/, () => viewServiceRequests()],
  [/^#\/service-requests\/new(\?.*)?$/, () => viewServiceRequestNew()],
  [/^#\/service-requests\/([0-9a-f-]+)$/, (m) => viewServiceRequestDetail(m[1])],
  [/^#\/diagnostic$/, () => viewDiagnostic()],
  [/^#\/fault-codes$/, () => viewFaultCodes()],
  [/^#\/fault-codes\/([A-Za-z0-9]+)$/, (m) => viewFaultCodeDetail(m[1])],
  [/^#\/maintenance$/, () => viewMaintenance()],
  [/^#\/maintenance\/([0-9a-f-]+)$/, (m) => viewVehicleMaintenance(m[1])],
  [/^#\/quotes$/, () => viewQuotes()],
  [/^#\/quotes\/([0-9a-f-]+)$/, (m) => viewQuoteDetail(m[1])],
  [/^#\/repairs$/, () => viewRepairs()],
  [/^#\/repairs\/([0-9a-f-]+)$/, (m) => viewRepairDetail(m[1])],
  [/^#\/warranties$/, () => viewWarranties()],
  [/^#\/warranties\/([0-9a-f-]+)$/, (m) => viewWarrantyDetail(m[1])],
  [/^#\/disputes$/, () => viewDisputes()],
  [/^#\/disputes\/new$/, () => viewDisputeNew()],
  [/^#\/disputes\/([0-9a-f-]+)$/, (m) => viewDisputeDetail(m[1])],
  [/^#\/second-opinions$/, () => viewSecondOpinions()],
  [/^#\/second-opinions\/([0-9a-f-]+)$/, (m) => viewSecondOpinionDetail(m[1])],
  [/^#\/ratings\/new\/([0-9a-f-]+)$/, (m) => viewRatingsNew(m[1])],
  [/^#\/appointments$/, () => viewAppointments()],
  [/^#\/interventions$/, () => viewRepairs()],
  [/^#\/intervention\/([0-9a-f-]+)$/, (m) => viewRepairDetail(m[1])],
  [/^#\/pros\?(.*)$/, (m) => viewProfessionals()],
  [/^#\/profile$/, () => viewProfile()],
  [/^#\/notifications$/, () => viewNotifications()],
  [/^#\/chat$/, () => viewChat()],
  [/^#\/chat\/([0-9a-f-]+)$/, (m) => viewChatDetail(m[1])],
  [/^#\/settings$/, () => viewProfile()],
  [/^#\/pay-new\/([0-9a-f-]+)$/, async (m) => { showLoading(); try { const key=crypto.randomUUID(); const resp=await fetch('/api/payments/intent',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+S.token,'Idempotency-Key':key},body:JSON.stringify({intervention_id:m[1]})}); const data=await resp.json(); if(!resp.ok)throw new Error(errFromHttp(data)); sessionStorage.setItem('paykey_'+data.payment.id,key); location.hash='#/pay/'+data.payment.id; } catch(e){ layoutApp(err(e)); hideLoading(); } }],
  [/^#\/pay\/([0-9a-f-]+)$/, (m) => viewPay(m[1])],
  [/^#\/admin\/$/, () => location.hash = '#/admin/dashboard'],
  [/^#\/admin$/, () => location.hash = '#/admin/dashboard'],
  [/^#\/admin\/dashboard$/, () => viewAdminDashboard()],
  [/^#\/admin\/users$/, () => viewAdminUsers()],
  [/^#\/admin\/vehicles$/, () => viewAdminVehicles()],
  [/^#\/admin\/professionals$/, () => viewAdminProfessionals('all')],
  [/^#\/admin\/professionals\/([0-9a-f-]+)$/, (m) => viewAdminProfessionalDetail(m[1])],
  [/^#\/admin\/garages$/, () => viewAdminProfessionals('garages')],
  [/^#\/admin\/technicians$/, () => viewAdminProfessionals('technicians')],
  [/^#\/admin\/experts$/, () => viewAdminProfessionals('experts')],
  [/^#\/admin\/suppliers$/, () => viewAdminSuppliers()],
  [/^#\/admin\/service-requests$/, () => viewAdminServiceRequests()],
  [/^#\/admin\/appointments$/, () => viewAdminAppointments()],
  [/^#\/admin\/diagnostics$/, () => viewAdminDiagnostics()],
  [/^#\/admin\/quotes$/, () => viewAdminQuotes()],
  [/^#\/admin\/repairs$/, () => viewAdminRepairs()],
  [/^#\/admin\/warranties$/, () => viewAdminWarranties()],
  [/^#\/admin\/payments$/, () => viewAdminPayments()],
  [/^#\/admin\/transactions$/, () => viewAdminTransactions()],
  [/^#\/admin\/commissions$/, () => viewAdminCommissions()],
  [/^#\/admin\/parts$/, () => viewAdminParts()],
  [/^#\/admin\/orders$/, () => viewAdminOrders()],
  [/^#\/admin\/disputes$/, () => viewAdminDisputes()],
  [/^#\/admin\/reviews$/, () => viewAdminReviews()],
  [/^#\/admin\/maintenance-programs$/, () => viewAdminPrograms()],
  [/^#\/admin\/maintenance-programs\/([0-9a-f-]+)$/, (m) => viewAdminProgram(m[1])],
  [/^#\/admin\/fault-codes$/, () => viewAdminFaultCodes()],
  [/^#\/admin\/notifications$/, () => viewAdminNotifications()],
  [/^#\/admin\/geography$/, () => viewAdminGeography()],
  [/^#\/admin\/settings$/, () => viewAdminSettings()],
  [/^#\/admin\/audit-logs$/, () => viewAdminAuditLogs()],
  [/^#\/admin\/stats$/, () => viewAdminStats()],
  [/^#\/admin\/(users|audit|notif)$/, (m) => viewAdmin(m[1])]
];

const PUBLIC = [/^#\/login$/, /^#\/register$/];
const ADMIN_HASH = /^#\/admin(\/|$)/;
// Module 61 — Domaines : sans ancre explicite, la destination dépend de l'hôte
// (app.c-auto.xxx -> tableau de bord application ; admin.c-auto.xxx -> zone
// admin). Toute autre hôte conserve le comportement historique (vue par défaut).
// Le domaine réel est fixé plus tard : seul le DNS change, pas ce code.
function defaultRouteForHost() {
  const host = location.hostname || '';
  if (host.startsWith('admin.')) return (S.user && S.user.role === 'ADMIN') ? '#/admin/dashboard' : '#/login';
  if (host.startsWith('app.')) return S.user ? '#/app' : '#/login';
  return '';
}
function route() {
  const h = location.hash || defaultRouteForHost();
  // Déjà connecté : les écrans publics (connexion/inscription) sont redirigés
  // vers le tableau de bord du rôle — cohérent avec les usages mobiles et évite
  // qu'une vue asynchrone encore en cours ne réécrase la page d'authentification.
  if (S.user && (h === '#/login' || h === '#/register')) { location.hash = S.user.role === 'SUPPLIER' ? '#/supplier/dashboard' : (isPro() ? '#/pro/dashboard' : (isAdmin() ? '#/admin/dashboard' : '#/app')); return; }
  if (S.user && !isAdmin() && ADMIN_HASH.test(h)) { location.hash = '#/app'; return; }
  for (const [re,fn] of routes) { const m=h.match(re); if(m) { if(!S.user && !PUBLIC.some(p=>p.test(h))){location.hash='#/login';return;} fn(m); return; } }
  if(!S.user){viewLogin();return;}
  layoutApp(window.UX ? UX.notFound() : '<p>Page introuvable.</p>');
}
window.addEventListener('hashchange', route);
const _hamburger = document.getElementById('hamburger');
if (_hamburger) _hamburger.onclick = () => {
  const _layout = document.querySelector('.app-layout');
  const _nav = document.getElementById('nav');
  if (_layout && S.user) {
    _layout.classList.toggle('sidebar-open');
    _hamburger.classList.toggle('open');
  } else if (_nav) {
    _nav.classList.toggle('open');
    _hamburger.classList.toggle('open');
  }
};
document.addEventListener('click', (e) => {
  const layout = document.querySelector('.app-layout');
  if (!layout) return;
  if (e.target.closest('#app-menu-btn')) {
    const now = Date.now();
    if (now - _sidebarLastTap < 400) return;
    _sidebarLastTap = now;
    setSidebar(!_sidebarOpen);
    return;
  }
  if (e.target.closest('.sidebar-link') || e.target === layout) {
    setSidebar(false);
    return;
  }
});
document.getElementById('offline-banner').classList.add('hidden');
window.addEventListener('online', () => document.getElementById('offline-banner').classList.add('hidden'));
window.addEventListener('offline', () => document.getElementById('offline-banner').classList.remove('hidden'));
if(!navigator.onLine) document.getElementById('offline-banner').classList.remove('hidden');
if (S.user && S.user.role) document.body.setAttribute('data-role', S.user.role);
if (S.user && S.token) {
  api('/auth/me').then(d => { if (d && d.user) setSession(S.token, { ...S.user, ...d.user }); }).catch(() => {});
}
document.addEventListener('DOMContentLoaded', () => route());
