/* Module 46 — i18n frontend : t() + sélecteur de langue (fr/en/fon/yo).
   Rendu : toute balise [data-i18n] est traduite une fois le dictionnaire chargé. */
(function () {
  const LOCALE_KEY = 'cauto_locale';
  const LOCALES = ['fr', 'en', 'fon', 'yo'];
  let messages = {};
  let current = localStorage.getItem(LOCALE_KEY) || 'fr';

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = messages[el.getAttribute('data-i18n')];
      if (v !== undefined) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const v = messages[el.getAttribute('data-i18n-placeholder')];
      if (v !== undefined) el.setAttribute('placeholder', v);
    });
    document.documentElement.lang = current;
  }

  function t(key, params) {
    let v = messages[key] !== undefined ? messages[key] : key;
    if (params) for (const [k, val] of Object.entries(params)) v = v.split('{' + k + '}').join(String(val));
    return v;
  }

  async function setLocale(locale, silent) {
    if (!LOCALES.includes(locale)) locale = 'fr';
    current = locale;
    localStorage.setItem(LOCALE_KEY, current);
    if (!silent) {
      fetch('/api/auth/me/locale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
        body: JSON.stringify({ locale: current })
      }).catch(() => {});
    }
    try {
      const r = await fetch('/api/i18n/' + current);
      const data = await r.json();
      messages = data.messages || {};
    } catch (e) {
      messages = {};
    }
    apply();
  }

  function injectSwitcher() {
    const sel = document.createElement('select');
    sel.id = 'lang-switcher';
    sel.setAttribute('aria-label', 'Language');
    ['fr', 'en', 'fon', 'yo'].forEach((l) => {
      const o = document.createElement('option');
      o.value = l;
      o.textContent = l.toUpperCase();
      if (l === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => setLocale(sel.value));
    sel.style.cssText = 'background:rgba(255,255,255,.08);color:var(--text,#e8eaf0);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer;';
    const host = document.querySelector('#lang-host');
    if (host) host.appendChild(sel);
  }

  window.cautoI18n = { current: () => current, t, setLocale, apply, LOCALES };
  document.addEventListener('DOMContentLoaded', () => {
    injectSwitcher();
    setLocale(current, true);
  });
})();