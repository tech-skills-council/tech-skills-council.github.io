/* Tech & Skills Council — site behaviour
   1. Opening animation (once per browser session, skipped for reduced motion)
   2. Scroll reveal
   3. Ticker duplication so the marquee loops seamlessly
*/
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = false;
  try { seen = sessionStorage.getItem('tsc.intro') === '1'; } catch (e) { seen = false; }

  /* ---------- 1. opening animation ---------- */
  function endLoader(loader, instant) {
    if (!loader) return;
    document.body.classList.remove('is-loading');
    if (instant) { loader.remove(); return; }
    loader.classList.add('done');
    window.setTimeout(function () { loader.remove(); }, 750);
  }

  function initLoader() {
    var loader = document.getElementById('loader');
    if (!loader) return;

    if (reduced || seen) { endLoader(loader, true); return; }

    document.body.classList.add('is-loading');
    try { sessionStorage.setItem('tsc.intro', '1'); } catch (e) {}

    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      endLoader(loader, false);
    };

    window.setTimeout(finish, 1750);
    // let people skip it
    loader.addEventListener('click', finish);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') finish();
    }, { once: true });
  }

  /* ---------- 2. scroll reveal ---------- */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    items.forEach(function (el) {
      var box = el.getBoundingClientRect();
      if (box.top < window.innerHeight) { el.classList.add('in'); return; }
      io.observe(el);
    });
  }

  /* ---------- 3. ticker ---------- */
  function initTicker() {
    var track = document.querySelector('.ticker-track');
    if (!track || track.dataset.doubled === '1') return;
    track.innerHTML += track.innerHTML;
    track.dataset.doubled = '1';
  }

  function boot() {
    initLoader();
    initReveal();
    initTicker();
    var y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* ---------- 4. custom cursor ---------- */
(function () {
  'use strict';

  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || still) return;

  var dot = document.createElement('div');
  var ring = document.createElement('div');
  dot.id = 'cursor-dot';
  ring.id = 'cursor-ring';
  dot.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');

  function attach() {
    document.body.appendChild(ring);
    document.body.appendChild(dot);
  }
  if (document.body) { attach(); } else { document.addEventListener('DOMContentLoaded', attach); }

  var mx = -100, my = -100;   // pointer
  var rx = -100, ry = -100;   // ring, trailing

  window.addEventListener('mousemove', function (ev) {
    mx = ev.clientX; my = ev.clientY;
  }, { passive: true });

  window.addEventListener('mousedown', function () { ring.classList.add('press'); });
  window.addEventListener('mouseup', function () { ring.classList.remove('press'); });

  // grow over anything clickable
  var HOT = 'a, button, summary, label, input, select, textarea, .cell, .door, .poster';
  document.addEventListener('mouseover', function (ev) {
    if (ev.target.closest && ev.target.closest(HOT)) ring.classList.add('hot');
  });
  document.addEventListener('mouseout', function (ev) {
    if (ev.target.closest && ev.target.closest(HOT)) ring.classList.remove('hot');
  });

  // hide when the pointer leaves the window
  document.addEventListener('mouseleave', function () {
    dot.style.opacity = ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', function () {
    dot.style.opacity = ring.style.opacity = '1';
  });

  (function frame() {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
    ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
    window.requestAnimationFrame(frame);
  })();
})();
