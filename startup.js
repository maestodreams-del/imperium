/* One 10-second introduction per installed browser origin and visual release. */
(() => {
  'use strict';
  const key = 'imperium_biotech_intro_v1';
  const screen = document.getElementById('boot-screen');
  const app = document.getElementById('app');
  if (!screen) return;
  let seen = false;
  try { seen = localStorage.getItem(key) === 'complete'; } catch (_) {}
  if (seen) { screen.remove(); return; }
  app.inert = true;
  app.setAttribute('aria-hidden', 'true');
  document.body.classList.add('booting');
  const start = performance.now();
  const duration = 10000;
  const progress = document.getElementById('boot-progress');
  const stages = ['Uruchamianie systemu', 'Przygotowywanie interfejsu', 'Ładowanie modułów', 'Otwieranie terminala'];
  let timer;
  function tick() {
    const elapsed = Math.min(duration, performance.now() - start);
    const percent = Math.floor(elapsed / duration * 100);
    document.getElementById('boot-fill').style.width = percent + '%';
    document.getElementById('boot-percent').textContent = percent + '%';
    document.getElementById('boot-countdown').textContent = Math.ceil((duration - elapsed) / 1000) + ' s';
    progress.setAttribute('aria-valuenow', String(percent));
    document.getElementById('boot-stage').textContent = stages[Math.min(3, Math.floor(percent / 25))];
    if (elapsed < duration) { timer = setTimeout(tick, Math.min(100, duration - elapsed)); return; }
    try { localStorage.setItem(key, 'complete'); } catch (_) {}
    screen.remove();
    app.inert = false;
    app.removeAttribute('aria-hidden');
    document.body.classList.remove('booting');
  }
  tick();
  window.addEventListener('pagehide', () => clearTimeout(timer), {once:true});
  // BFCache restores a paused introduction without stranding its overlay.
  window.addEventListener('pageshow', e => { if (e.persisted && screen.isConnected) tick(); });
})();
