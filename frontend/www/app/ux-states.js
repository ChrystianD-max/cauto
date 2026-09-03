/* =============================================================================
   C-AUTO UX STATES + COMPONENTS JS — Module 48
   -----------------------------------------------------------------------------
   Sept états garantis sur TOUTE la plateforme :
     LOADING · SUCCESS · EMPTY · ERROR · OFFLINE · UNAUTHORIZED · NOT_FOUND
   Aucune page ne peut rester vide sans explication.

   window.UX propose :
     - UX.state(name, {icon,title,message,action,compact,line}) -> HTML
     - UX.loading/success/empty/error/offline/unauthorized/notFound -> HTML
     - UX.autoError(e) -> HTML d'erreur typé (401/404/offline/serveur)
     - UX.skeleton(kind) -> squelettes de chargement ('dashboard','list','detail','table')
     - UX.modal({...}) / UX.confirm(msg) / UX.prompt(msg) / UX.closeModals()
     - UX.badge / UX.chartBars / UX.donut / UX.timeline / UX.notice / UX.field
     - UX.esc(s), UX.icon(name) (compat lucide via data-lucide)
   ----------------------------------------------------------------------------- */
(function () {
  'use strict';

  /* ---- Petits outils indépendants de app-v8 ---- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name, cls) { return '<i data-lucide="' + esc(name) + '" class="' + (cls || '') + '"></i>'; }
  function createIcons(root) {
    if (window.lucide) lucide.createIcons({ root: root || document });
  }
  function applyI18n() { if (window.cautoI18n && window.cautoI18n.apply) window.cautoI18n.apply(); }

  /* ---- Erreur du réseau / offline, exploitable par autoError ---- */
  function offlineError() {
    var e = new Error('Impossible de joindre le serveur.');
    e.isOffline = true;
    return e;
  }

  /* ---- Fabrique d'états ---- */
  function state(opts) {
    var iconName = opts.icon || 'info';
    var tone = opts.tone || 'accent';
    var actions = (opts.action
      ? '<div class="ux-actions">' + (Array.isArray(opts.action) ? opts.action.join('') : opts.action) + '</div>'
      : '');
    return '<div class="ux-state ux-' + tone + (opts.compact ? ' compact' : '') + (opts.line ? ' ux-line' : '') + '">' +
      '<div class="ux-icon">' + icon(iconName) + '</div>' +
      '<h3 class="ux-title"' + (opts.key ? ' data-i18n="' + esc(opts.key) + '"' : '') + '>' + esc(opts.title || '') + '</h3>' +
      (opts.message ? '<p class="ux-message">' + opts.message + '</p>' : '') +
      actions +
      '</div>';
  }

  function retrySync(label) {
    return '<a href="#/app" class="btn btn-primary">' + icon('refresh-cw') + (label || 'Actualiser') + '</a>';
  }
  function relogin() {
    return '<a href="#/login" class="btn btn-primary">' + icon('log-in') + 'Se reconnecter</a>';
  }

  var UX = {
    esc: esc,
    icon: icon,

    /* -------- LES 7 ÉTATS -------- */
    loading: function (title, msg) {
      return state({ icon: 'loader-circle', tone: 'accent', title: title || 'Chargement…', message: msg || 'Lectio des données en cours, un instant s\u2019il vous plaît.' });
    },
    success: function (title, msg, action) {
      return state({ icon: 'check-circle-2', tone: 'ok', title: title || 'Opération réussie', message: msg || '', action: action, key: 'state.success' });
    },
    empty: function (title, msg, action) {
      return state({ icon: 'inbox', tone: 'accent', title: title || 'Rien à afficher', message: msg || 'Aucune donnée pour le moment.', action: action, key: 'state.empty' });
    },
    error: function (title, msg, action) {
      return state({ icon: 'alert-triangle', tone: 'ko', title: title || 'Une erreur est survenue', message: msg || 'Veuillez réessayer dans un instant.', action: action, key: 'state.error' });
    },
    offline: function (action) {
      return state({
        icon: 'wifi-off', tone: 'warn',
        title: 'Mode hors connexion',
        message: 'Vous n\u2019êtes pas connecté à internet. Les données locales ne sont pas perdues : reconnectez-vous pour synchroniser.',
        action: action || '<button class="btn btn-primary" onclick="location.reload()">' + icon('refresh-cw') + 'Réessayer</button>',
        key: 'state.offline'
      });
    },
    unauthorized: function (msg) {
      return state({
        icon: 'shield-alert', tone: 'ko',
        title: 'Session expirée',
        message: msg || 'Votre session a expiré ou vous n\u2019avez pas les droits nécessaires. Reconnectez-vous pour continuer.',
        action: relogin(),
        key: 'state.unauthorized'
      });
    },
    notFound: function (msg) {
      return state({
        icon: 'search-x', tone: 'accent',
        title: 'Page introuvable',
        message: msg || 'Cette adresse n\u2019existe pas (ou plus). Vérifiez le lien, ou revenez à l\u2019accueil.',
        action: retrySync() + '<a href="#/app" class="btn btn-ghost">' + icon('home') + 'Accueil</a>',
        key: 'state.not_found'
      });
    },

    /* -------- Erreur automatique selon le type -------- */
    autoError: function (e) {
      var msg = (e && e.message) ? e.message : 'Une erreur inattendue est survenue avec le serveur.';
      if (e && e.isOffline) return UX.offline();
      if (e && e.status === 401) return UX.unauthorized();
      if (e && e.status === 404) return UX.notFound('Ressource introuvable : elle a été supprimée ou déplacée.');
      if (e && e.status && e.status >= 500) {
        return UX.error('Le serveur rencontre un problème', msg + ' Réessayez dans quelques secondes.', retrySync());
      }
      return UX.error('Une erreur est survenue', msg, retrySync());
    },

    /* -------- Squelettes de chargement (LOADING structurel) -------- */
    skeleton: function (kind) {
      kind = kind || 'list';
      var line = function (cls) { return '<div class="skeleton' + (cls ? ' ' + cls : '') + '"></div>'; };
      var card = function (lg) {
        return '<div class="skeleton-card' + (lg ? ' skeleton-card-lg' : '') + '">' +
          '<div class="ds-skeleton-row">' +
          '<div class="skeleton-avatar"></div>' +
          '<div style="flex:1">' + line('skeleton-title') + line('skeleton-line short') + '</div>' +
          '</div>' + line('skeleton-line') + line('skeleton-line short') +
          '</div>';
      };
      if (kind === 'dashboard') {
        return '<div class="ds-stack">' +
          '<div class="skeleton-card">' + line('skeleton-title') + line('skeleton-line') + line('skeleton-line short') + '</div>' +
          '<div class="ds-skeleton-grid">' + card() + card() + card() + card() + '</div>' +
          '</div>';
      }
      if (kind === 'detail') {
        return '<div class="ds-stack">' +
          '<div class="skeleton-card">' + line('skeleton-title') + line('skeleton-line') + line('skeleton-line') + '</div>' +
          card() + card() + '</div>';
      }
      if (kind === 'table') {
        var rows = '';
        for (var i = 0; i < 5; i++) { rows += '<tr><td colspan="5">' + line('skeleton-line') + '</td></tr>'; }
        return '<div class="ds-table-shell"><table class="ds-table"><thead><tr><th style="padding:.7rem .9rem"><div class="skeleton skeleton-line" style="width:70px"></div></th><th style="padding:.7rem .9rem"><div class="skeleton skeleton-line" style="width:90px"></div></th><th style="padding:.7rem .9rem"><div class="skeleton skeleton-line" style="width:60px"></div></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      }
      /* list */
      return '<div class="ds-stack">' + card() + card() + card() + '</div>';
    },

    /* -------- Modales -------- */
    modal: function (opts) {
      opts = opts || {};
      var backdrop = document.createElement('div');
      backdrop.className = 'ds-modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.innerHTML =
        '<div class="ds-modal ' + (opts.size === 'lg' ? 'ds-modal-lg' : opts.size === 'sm' ? 'ds-modal-sm' : '') + '">' +
        '<div class="ds-modal-header"><h3>' + (opts.icon ? icon(opts.icon) : '') + esc(opts.title || '') + '</h3>' +
        '<button type="button" class="ds-modal-close" data-ds-close aria-label="Fermer">' + icon('x') + '</button></div>' +
        '<div class="ds-modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="ds-modal-footer">' + opts.footer + '</div>' : '') +
        '</div>';
      var close = function (result) {
        backdrop.remove();
        document.body.classList.remove('ds-no-scroll');
        document.removeEventListener('keydown', onKey);
        if (opts.onClose) opts.onClose(result);
      };
      var onKey = function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); close(false); } };
      backdrop.querySelector('.ds-modal-close').onclick = function () {
        if (opts.dismissable !== false) close(false);
      };
      backdrop.addEventListener('click', function (ev) {
        if (ev.target === backdrop && opts.dismissable !== false) close(false);
      });
      document.addEventListener('keydown', onKey);
      function focusBody() {
        var first = backdrop.querySelector('button, input, select, textarea, [tabindex]');
        if (first) first.focus();
      }
      document.body.classList.add('ds-no-scroll');
      document.body.appendChild(backdrop);
      createIcons(backdrop);
      applyI18n();
      focusBody();
      return { el: backdrop, close: close };
    },

    /* -------- Confirmation asynchrone (remplace confirm()) -------- */
    confirm: function (message, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var m = UX.modal({
          title: opts.title || 'Confirmation',
          icon: opts.icon || 'alert-circle',
          size: 'sm',
          dismissable: true,
          body: '<p style="margin:0;line-height:1.6">' + esc(message) + '</p>',
          footer:
            '<button type="button" class="btn btn-ghost" data-ds-cancel>' + (opts.cancelLabel || 'Annuler') + '</button>' +
            '<button type="button" class="btn ' + (opts.danger ? 'btn-ko' : 'btn-primary') + '" data-ds-ok>' + (opts.okLabel || 'Confirmer') + '</button>',
          onClose: function (r) { resolve(!!r); }
        });
        m.el.querySelector('[data-ds-ok]').onclick = function () { m.close(true); };
        m.el.querySelector('[data-ds-cancel]').onclick = function () { m.close(false); };
      });
    },

    /* -------- Saisie asynchrone (remplace prompt()) -------- */
    prompt: function (message, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var value = opts.defaultValue || '';
        var m = UX.modal({
          title: opts.title || 'Saisie requise',
          icon: opts.icon || 'edit-3',
          size: 'sm',
          dismissable: true,
          body:
            '<p style="margin:0 0 .7rem;line-height:1.6">' + esc(message) + '</p>' +
            '<input id="ds-prompt-input" type="text" value="' + esc(value) + '" placeholder="' + esc(opts.placeholder || '') + '" style="width:100%">',
          footer:
            '<button type="button" class="btn btn-ghost" data-ds-cancel>Annuler</button>' +
            '<button type="button" class="btn btn-primary" data-ds-ok>Valider</button>',
          onClose: function (r) { resolve(r === true ? (m.el.querySelector('#ds-prompt-input') ? m.el.querySelector('#ds-prompt-input').value : value) : null); }
        });
        var input = m.el.querySelector('#ds-prompt-input');
        input.focus(); input.select();
        input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') m.close(true); });
        m.el.querySelector('[data-ds-ok]').onclick = function () { m.close(true); };
        m.el.querySelector('[data-ds-cancel]').onclick = function () { m.close(false); };
      });
    },

    closeModals: function () {
      document.querySelectorAll('.ds-modal-backdrop').forEach(function (b) { b.remove(); });
      document.body.classList.remove('ds-no-scroll');
    },

    /* -------- Composants DS (petits) -------- */
    badge: function (label, tone) {
      return '<span class="badge badge-' + (tone || 'muted') + '">' + esc(label) + '</span>';
    },
    notice: function (message, tone) {
      return '<div class="ds-notice ds-notice-' + (tone || 'info') + '">' + icon(tone === 'ok' ? 'check-circle' : tone === 'error' ? 'alert-circle' : tone === 'warn' ? 'alert-triangle' : 'info') + '<span>' + esc(message) + '</span></div>';
    },
    successBanner: function (message) {
      return '<div class="ds-success">' + icon('check-circle-2') + '<span>' + esc(message) + '</span></div>';
    },
    door: function (value, label) {
      return '<div class="ds-donut" style="--pct:' + Math.max(0, Math.min(100, Number(value) || 0)) + '"><span class="ds-donut-val">' + esc(String(value)) + '</span><span class="ds-donut-lbl">' + esc(label) + '</span></div>';
    },
    bars: function (items, opts) {
      opts = opts || {};
      var tot = items.length;
      var parts = items.map(function (it) {
        var h = Math.max(0, Math.min(100, Number(it.value) || 0));
        var cls = it.tone ? ' ds-bar-' + it.tone : '';
        return '<div style="flex:1"><div class="ds-bars"><div class="ds-bar' + cls + '" style="--h:' + h + '" title="' + esc(it.label) + ': ' + h + '%"></div></div><div class="ds-bar-label">' + esc(it.label) + '</div></div>';
      });
      return '<div class="ds-chart"><div class="ds-chart-wrap"><div class="ds-flex" style="align-items:flex-end;gap:.5rem">' + parts.join('') + '</div></div>' +
        (opts.legend ? '<div class="ds-legend">' + items.map(function (it) { return '<span><span class="ds-legend-dot" style="background:' + (it.tone === 'good' ? 'var(--ok)' : it.tone === 'warn' ? 'var(--warn)' : it.tone === 'bad' ? 'var(--ko)' : 'var(--accent)') + '"></span>' + esc(it.label) + '</span>'; }).join('') + '</div>' : '') +
        '</div>';
    },
    progress: function (pct, tone) {
      var cls = tone === 'warn' ? 'ds-bar-warn' : tone === 'bad' ? 'ds-bar-bad' : tone === 'good' ? 'ds-bar-good' : '';
      return '<div class="ds-progress"><div class="ds-progress-fill' + (cls ? ' ' + cls : '') + '" style="--w:' + Math.max(0, Math.min(100, Number(pct) || 0)) + '"></div></div>';
    },
    timeline: function (steps, currentIdx) {
      if (!steps || !steps.length) return '';
      return '<div class="timeline">' + steps.map(function (s, i) {
        var cls = i < currentIdx ? 'is-done' : i === currentIdx ? 'is-current' : 'is-pending';
        if (s.tone === 'ko') cls += ' is-ko';
        return '<div class="timeline-item ' + cls + '"><div class="timeline-dot"></div><div class="timeline-card card">' +
          (s.title ? '<strong>' + esc(s.title) + '</strong>' : '') +
          (s.date ? '<div class="timeline-date">' + esc(s.date) + '</div>' : '') +
          (s.desc ? '<div class="hint">' + esc(s.desc) + '</div>' : '') +
          '</div></div>';
      }).join('') + '</div>';
    },
    field: function (opts) {
      return '<div class="ds-field' + (opts.error ? ' has-error' : '') + '">' +
        '<label class="ds-label">' + esc(opts.label || '') + (opts.required ? ' <span class="required">*</span>' : '') + '</label>' +
        (opts.input || '') +
        (opts.hint ? '<span class="ds-hint">' + esc(opts.hint) + '</span>' : '') +
        (opts.error ? '<span class="ds-error">' + icon('alert-circle') + esc(opts.error) + '</span>' : '') +
        '</div>';
    }
  };

  /* -------- Connexion / déconnexion : état global OFFLINE -------- */
  function showOfflineBanner() {
    var b = document.getElementById('offline-banner');
    if (b) b.classList.remove('hidden');
  }
  function hideOfflineBanner() {
    var b = document.getElementById('offline-banner');
    if (b) b.classList.add('hidden');
  }
  window.addEventListener('offline', function () {
    showOfflineBanner();
    var t = document.getElementById('toast-container');
    if (t && !t.querySelector('[data-ds-offline]')) {
      var el = document.createElement('div');
      el.setAttribute('data-ds-offline', '1');
      el.className = 'toast toast-warn';
      el.innerHTML = icon('wifi-off') + '<span>Connexion perdue — mode hors connexion activé.</span>';
      t.appendChild(el);
      createIcons();
      setTimeout(function () { el.classList.add('leaving'); setTimeout(function () { el.remove(); }, 380); }, 4500);
    }
  });
  window.addEventListener('online', function () {
    hideOfflineBanner();
    var toast = document.querySelector('.toast[data-ds-offline]');
    if (toast) toast.remove();
  });
  window.UX = UX;
  window.offlineError = offlineError;
})();