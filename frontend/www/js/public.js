/* C-AUTO Public — Shared JS */
'use strict';

(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Nav scroll effect
  var nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 24);
    }, { passive: true });
  }

  // Mobile menu
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('navMenu');
  function closeMenu() {
    if (!menu || !toggle) return;
    menu.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('click', function (e) {
      if (menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenu();
    });
  }

  // Smooth scroll for anchor links (in-page)
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = document.querySelector(a.getAttribute('href'));
      if (t) {
        e.preventDefault();
        var target = window.scrollY;
        if (reduceMotion) { t.scrollIntoView({ block: 'start' }); }
        else { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }
    });
  });

  // FAQ toggle
  document.querySelectorAll('.faq-q').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.closest('.faq-item');
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });

  // Scroll reveal
  var anims = document.querySelectorAll('.anim');
  if (anims.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      anims.forEach(function (el) { el.classList.add('in'); });
    } else {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); obs.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
      anims.forEach(function (el) { obs.observe(el); });
    }
  }

  // Active nav link
  var currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === currentPath) a.classList.add('active');
  });
})();