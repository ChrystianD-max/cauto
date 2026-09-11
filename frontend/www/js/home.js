/* C-AUTO Landing — home.js */
'use strict';

(function () {
  var tabs = document.querySelectorAll('.mk-tab');
  var panels = document.querySelectorAll('.mk-panel');

  function activate(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(function (p) {
      p.setAttribute('aria-hidden', p.id === tab.getAttribute('aria-controls') ? 'false' : 'true');
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { activate(tab); });
    tab.addEventListener('keydown', function (e) {
      var idx = Array.prototype.indexOf.call(tabs, tab);
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      if (next) { e.preventDefault(); activate(next); next.focus(); }
    });
  });
})();