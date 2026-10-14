// First-run onboarding tour — shows 3-step overlay, remembers dismissal.
(function () {
  const tour = document.getElementById('tour');
  if (!tour) return;
  const seen = localStorage.getItem('tourSeen') === '1';
  if (seen) { tour.remove(); return; }

  let step = 0;
  const steps = [...tour.querySelectorAll('.tour-step')];
  const dots = [...tour.querySelectorAll('.tour-dots span')];
  tour.hidden = false;

  const show = (i) => {
    steps.forEach((s, j) => { s.hidden = j !== i; });
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    step = i;
  };

  tour.querySelectorAll('.tour-next').forEach((btn) => {
    btn.onclick = () => {
      if (step < steps.length - 1) show(step + 1);
      else { localStorage.setItem('tourSeen', '1'); tour.hidden = true; setTimeout(() => tour.remove(), 400); }
    };
  });

  // Dismiss on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !tour.hidden) { localStorage.setItem('tourSeen', '1'); tour.hidden = true; setTimeout(() => tour.remove(), 400); }
  });

  show(0);
})();
