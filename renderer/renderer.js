const $ = (id) => document.getElementById(id);
const input = $('q'), list = $('list'), foot = $('foot'), app = $('app');
let results = [], sel = 0, seq = 0;

const svg = (body, color) => `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', '#f5b942'),
  file: svg('<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>', '#9aa4c7'),
  app: svg('<rect x="4" y="4" width="16" height="16" rx="4"/>', '#8b95ff'),
  cmd: svg('<path d="M4 17l6-5-6-5M12 19h8"/>', '#5fd4a0'),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>', '#ff9a6b'),
  web: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', '#58b6ff'),
  clip: svg('<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h4"/>', '#c084fc'),
};
const TAGS = { app: 'App', folder: 'Folder', file: 'File', cmd: 'Command', calc: 'Calculator', web: 'Web', clip: 'Clipboard' };

function render() {
  list.replaceChildren();
  results.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === sel) li.className = 'sel';
    const ico = document.createElement('div');
    ico.className = 'ico';
    ico.innerHTML = ICONS[r.kind];
    if (r.kind === 'app' || r.kind === 'file') {
      window.api.icon(r.path).then((url) => {
        if (!url) return;
        const img = document.createElement('img');
        img.src = url;
        ico.replaceChildren(img);
      });
    }
    const txt = document.createElement('div');
    txt.className = 'txt';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = r.title;
    const s = document.createElement('div');
    s.className = 's';
    s.textContent = r.sub || '';
    txt.append(t, s);
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = TAGS[r.kind];
    li.append(ico, txt, tag);
    li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
    li.addEventListener('click', () => run(false));
    list.append(li);
  });
  foot.hidden = results.length === 0;
}

function mark() {
  [...list.children].forEach((li, i) => li.classList.toggle('sel', i === sel));
  list.children[sel]?.scrollIntoView({ block: 'nearest' });
}

function run(reveal) {
  const r = results[sel];
  if (r) window.api.run(r, input.value, reveal);
}

async function update() {
  const my = ++seq;
  const r = await window.api.search(input.value);
  if (my !== seq) return;
  results = r;
  sel = 0;
  render();
}

input.addEventListener('input', update);
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { sel = (sel + 1) % Math.max(results.length, 1); mark(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = (sel - 1 + results.length) % Math.max(results.length, 1); mark(); e.preventDefault(); }
  else if (e.key === 'Enter') run(e.ctrlKey);
  else if (e.key === 'Escape') window.api.hide();
});

new ResizeObserver(() => window.api.resize(Math.ceil(app.getBoundingClientRect().height))).observe(app);

function applyPrefs(p) {
  const r = document.documentElement.style;
  r.setProperty('--accent', p.accent);
  r.setProperty('--ta', p.tint);
  document.body.classList.toggle('noanim', !p.animations);
}
window.api.getState().then((s) => applyPrefs(s.prefs));
window.api.onState((s) => applyPrefs(s.prefs));

window.api.onShown(() => {
  app.classList.remove('pop');
  void app.offsetWidth;
  app.classList.add('pop');
  input.focus();
  input.select();
  update();
});
update();
