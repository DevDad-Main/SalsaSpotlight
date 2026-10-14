// Onboarding tour — main process sends 'show-tour' to display it.
(function () {
  const tour = document.getElementById('tour');
  if (!tour) return;
  let step = 0;
  let lastX = -1, lastY = -1;
  let closeCb = null;
  const steps = [...tour.querySelectorAll('.tour-step')];
  const dots = [...tour.querySelectorAll('.tour-dots span')];

  // Track pointer so we can restore click-through state accurately on close
  document.addEventListener('pointermove', (e) => { lastX = e.clientX; lastY = e.clientY; }, { passive: true });

  const show = (i) => {
    steps.forEach((s, j) => { s.hidden = j !== i; });
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    step = i;
  };

  const open = () => {
    if (!tour.hidden) return;
    show(0);
    tour.hidden = false;
    // Capture clicks — desktop window otherwise passes them through to windows below
    try { window.api.setClickThrough(false); } catch { /* not in desktop window */ }
  };

  const close = () => {
    if (tour.hidden) return;
    tour.hidden = true;
    // Restore click-through based on what is actually under the pointer now
    try {
      const el = (lastX >= 0) ? document.elementFromPoint(lastX, lastY) : null;
      const over = !!(el && el.closest && el.closest('.grid-stack-item'));
      window.api.setClickThrough(!over);
    } catch { try { window.api.setClickThrough(true); } catch { /* ignore */ } }
    if (closeCb) { const c = closeCb; closeCb = null; c(); }
  };

  tour.querySelectorAll('.tour-next').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (step < steps.length - 1) show(step + 1);
      else close();
    };
  });

  const x = tour.querySelector('.tour-x');
  if (x) x.onclick = (e) => { e.stopPropagation(); close(); };

  // Clicking the dark backdrop also closes
  tour.addEventListener('click', (e) => { if (e.target === tour) close(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !tour.hidden) close();
  });

  // Shown when main asks (startup or Settings > Show help)
  if (window.api.onShowTour) window.api.onShowTour(open);

  window.__tourOpen = open;
  window.__tourClose = close;
})();
