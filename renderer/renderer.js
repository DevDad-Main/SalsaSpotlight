const $ = (id) => document.getElementById(id);
const input = $('q'), list = $('list'), foot = $('foot'), app = $('app'), wrap = $('wrap'),
  details = $('details'), toastEl = $('toast'), keysOv = $('keys-ov');
let results = [], sel = 0, seq = 0, recents = true, detailsOpen = false;

const KEYS_HELP = [
  [['Enter'], 'Open selected result'],
  [['Ctrl', 'Enter'], 'Show in folder'],
  [['Ctrl', 'Shift', 'C'], 'Copy path'],
  [['Ctrl', 'P'], 'File properties'],
  [['Ctrl', 'I'], 'Details panel'],
  [['Ctrl', 'R'], 'Rebuild search index'],
  [['Ctrl', 'Shift', 'R'], 'Remove item from recents'],
  [['↑', '↓', 'Tab'], 'Move selection'],
  [['Shift', 'Tab'], 'Move selection backwards'],
  [['?'], 'Show this shortcut list'],
  [['Esc'], 'Close panel, then Spotlight'],
];

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
const GROUPS = { calc: 'Calculator', app: 'Applications', cmd: 'Commands', folder: 'Folders', file: 'Files', clip: 'Clipboard', web: 'Web' };
const ORDER = Object.keys(GROUPS);

function arrange(r) {
  if (r.length < 2 || !input.value.trim()) return r;
  return [r[0], ...r.slice(1).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))];
}

function header(text) {
  const h = document.createElement('li');
  h.className = 'hdr';
  h.textContent = text;
  return h;
}

// Highlight matched query letters in the title (Windhawk-style).
function hlNodes(title, rawQ) {
  const words = rawQ.toLowerCase().split(/\s+/)
    .filter((w) => w && !w.includes(':') && !w.includes('/'))
    .map((w) => w.replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean);
  if (!words.length) return [document.createTextNode(title)];
  const lower = title.toLowerCase();
  const marks = new Set();
  for (const w of words) {
    const wm = [];
    let ti = 0, ok = true;
    for (const ch of w) {
      const idx = lower.indexOf(ch, ti);
      if (idx === -1) { ok = false; break; }
      wm.push(idx);
      ti = idx + 1;
    }
    if (ok) for (const i of wm) marks.add(i);
  }
  if (!marks.size) return [document.createTextNode(title)];
  const nodes = [];
  let buf = '', bufHl = false;
  const flush = () => {
    if (!buf) return;
    if (bufHl) {
      const b = document.createElement('b');
      b.className = 'hl';
      b.textContent = buf;
      nodes.push(b);
    } else nodes.push(document.createTextNode(buf));
    buf = '';
  };
  for (let i = 0; i < title.length; i++) {
    const hl = marks.has(i);
    if (buf && hl !== bufHl) flush();
    bufHl = hl;
    buf += title[i];
  }
  flush();
  return nodes;
}

function render() {
  list.replaceChildren();
  const hasTop = results.length > 0 && input.value.trim() && results[0].kind !== 'web';
  let lastGroup = '';
  results.forEach((r, i) => {
    const top = i === 0 && hasTop;
    const group = top ? 'Top Hit' : (recents && !input.value.trim() ? 'Frequently Used' : GROUPS[r.kind]);
    if (group !== lastGroup) { list.append(header(group)); lastGroup = group; }
    const li = document.createElement('li');
    li.className = 'row' + (i === sel ? ' sel' : '') + (top ? ' top' : '');
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
    t.append(...hlNodes(r.title, input.value));
    const s = document.createElement('div');
    s.className = 's';
    s.textContent = r.sub || '';
    txt.append(t, s);
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = top ? '' : TAGS[r.kind];
    li.append(ico, txt, tag);
    li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
    li.addEventListener('click', () => run(false));
    list.append(li);
  });
  foot.hidden = results.length === 0;
  if (detailsOpen) renderDetails();
}

function mark() {
  const rows = list.querySelectorAll('li.row');
  rows.forEach((li, i) => li.classList.toggle('sel', i === sel));
  rows[sel]?.scrollIntoView({ block: 'nearest' });
  if (detailsOpen) renderDetails();
}

function run(reveal) {
  const r = results[sel];
  if (r) window.api.run(r, input.value, reveal);
}

async function update() {
  const my = ++seq;
  if (/^\s*(\?|keys|keybinds|shortcuts)\s*$/i.test(input.value)) {
    setKeysOpen(true);
    results = [];
    sel = 0;
    list.replaceChildren();
    foot.hidden = true;
    return;
  }
  setKeysOpen(false);
  const r = await window.api.search(input.value);
  if (my !== seq) return;
  results = arrange(r);
  sel = 0;
  render();
}

// ---------- shortcuts overlay ----------
function setKeysOpen(open) {
  if (!open && keysOv.hidden) return;
  keysOv.hidden = !open;
  document.body.classList.toggle('keys', open);
  if (open) {
    if (detailsOpen) setDetails(false);
    renderKeys();
  }
}
function renderKeys() {
  const box = document.getElementById('ko-list');
  if (!box || box.childElementCount) return;
  KEYS_HELP.forEach(([combo, desc]) => {
    const row = document.createElement('div');
    row.className = 'ko-row';
    const k = document.createElement('div');
    k.className = 'ko-k';
    combo.forEach((part, i) => {
      if (i) {
        const plus = document.createElement('span');
        plus.className = 'plus';
        plus.textContent = '+';
        k.append(plus);
      }
      const kd = document.createElement('kbd');
      kd.textContent = part;
      k.append(kd);
    });
    const d = document.createElement('div');
    d.className = 'ko-d';
    d.textContent = desc;
    row.append(k, d);
    box.append(row);
  });
}

// ---------- details panel (Windhawk-style) ----------
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1400);
}

const fmtSize = (b) => {
  if (b == null) return null;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
};
const fmtDate = (ms) => {
  try { return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return null; }
};

function setDetails(open) {
  detailsOpen = open;
  document.body.classList.toggle('details', open);
  if (open) renderDetails();
}

function renderDetails() {
  const r = results[sel];
  details.replaceChildren();
  const h = document.createElement('div');
  h.className = 'd-h';
  h.textContent = 'Details';
  details.append(h);
  if (!r) {
    const empty = document.createElement('div');
    empty.className = 'd-empty';
    empty.textContent = 'No result selected.';
    details.append(empty);
    return;
  }
  const name = document.createElement('div');
  name.className = 'd-name';
  name.textContent = r.title;
  const kind = document.createElement('div');
  kind.className = 'd-kind';
  kind.textContent = TAGS[r.kind] || r.kind;
  details.append(name, kind);

  const info = document.createElement('div');
  info.className = 'd-info';
  const row = (k, v) => {
    if (!v) return;
    const rw = document.createElement('div');
    rw.className = 'd-row';
    const kk = document.createElement('span');
    kk.textContent = k;
    const vv = document.createElement('span');
    vv.textContent = v;
    rw.append(kk, vv);
    info.append(rw);
  };

  const acts = document.createElement('div');
  acts.className = 'd-acts';
  const addAct = (label, kbd, fn, primary) => {
    const b = document.createElement('button');
    b.className = 'd-act' + (primary ? ' pri' : '');
    const lb = document.createElement('span');
    lb.textContent = label;
    const k = document.createElement('span');
    k.className = 'd-kbd';
    k.textContent = kbd;
    b.append(lb, k);
    b.onclick = fn;
    acts.append(b);
  };
  addAct('Open', 'Enter', () => run(false), true);
  if (r.path) {
    addAct('Show in folder', 'Ctrl+Enter', () => run(true));
    addAct('Copy path', 'Ctrl+Shift+C', () => copyPath());
    addAct('Properties', 'Ctrl+P', () => showProps());
  }
  if (r.path || r.cmd) addAct('Remove from recents', 'Ctrl+Shift+R', () => forgetRecent());
  details.append(acts);

  row('Kind', TAGS[r.kind]);
  if (r.path) row('Location', r.path);
  else if (r.sub) row('Info', r.sub);
  if (r.kind === 'calc' || r.kind === 'clip') row('Value', String(r.value ?? ''));
  if (r.kind === 'cmd' && r.cmd) row('Command', r.cmd);
  details.append(info);

  if (r.path) {
    const pending = document.createElement('div');
    pending.className = 'd-pending';
    pending.textContent = 'Reading file info…';
    details.append(pending);
    getFileInfo(r.path).then((fi) => {
      if (!detailsOpen || results[sel] !== r) return;
      pending.remove();
      if (!fi) return;
      row('Name', fi.name);
      if (fi.target) row('Opens', fi.target);
      row('Size', fmtSize(fi.size));
      row('Modified', fmtDate(fi.mtime));
    });
  }
}

const fiCache = new Map();
function getFileInfo(p) {
  if (fiCache.has(p)) return Promise.resolve(fiCache.get(p));
  return window.api.fileInfo(p).then((fi) => {
    if (fi) fiCache.set(p, fi);
    return fi;
  });
}

function copyPath() {
  const r = results[sel];
  if (!r) return;
  const p = r.path || (r.kind === 'cmd' ? r.cmd : (r.kind === 'calc' || r.kind === 'clip' ? r.value : null)) || r.title;
  window.api.copyPath(String(p));
  toast('Copied');
}
function showProps() {
  const r = results[sel];
  if (r?.path) window.api.showProps(r.path);
}
function forgetRecent() {
  const r = results[sel];
  const key = r && (r.path || (r.cmd ? 'cmd:' + r.cmd : null));
  if (!key) return;
  window.api.forgetRecent(key);
  toast('Removed from recents');
  update();
}
function reindexNow() {
  window.api.reindex();
  toast('Reindexing…');
}

input.addEventListener('input', update);
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'ArrowDown') { sel = (sel + 1) % Math.max(results.length, 1); mark(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = (sel - 1 + results.length) % Math.max(results.length, 1); mark(); e.preventDefault(); }
  else if (e.key === 'Tab') {
    if (results.length) sel = e.shiftKey ? (sel - 1 + results.length) % results.length : (sel + 1) % results.length;
    mark(); e.preventDefault();
  }
  else if (e.key === 'Enter') run(e.ctrlKey);
  else if (e.key === 'Escape') {
    if (!keysOv.hidden) { setKeysOpen(false); input.value = ''; update(); }
    else if (detailsOpen) setDetails(false);
    else window.api.hide();
  }
  else if (ctrl && e.shiftKey && (e.key === 'C' || e.key === 'c')) { copyPath(); e.preventDefault(); }
  else if (ctrl && e.shiftKey && (e.key === 'R' || e.key === 'r')) { forgetRecent(); e.preventDefault(); }
  else if (ctrl && !e.shiftKey && (e.key === 'P' || e.key === 'p')) { showProps(); e.preventDefault(); }
  else if (ctrl && !e.shiftKey && (e.key === 'R' || e.key === 'r')) { reindexNow(); e.preventDefault(); }
  else if (ctrl && !e.shiftKey && (e.key === 'i' || e.key === 'I')) { setDetails(!detailsOpen); e.preventDefault(); }
});

// Quick shortcut chips
const setupChip = (id, query) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.onclick = (e) => {
    e.stopPropagation();
    input.value = query;
    input.focus();
    update();
  };
};
setupChip('chip-apps', 'type:app ');
setupChip('chip-folders', 'type:folder ');
setupChip('chip-files', 'type:file ');
setupChip('chip-calc', '12 * 5 + ');

new ResizeObserver(() => {
  const rect = wrap.getBoundingClientRect();
  window.api.resize(Math.ceil(rect.height), Math.ceil(rect.width));
}).observe(wrap);

function washFrom(hex) {
  try {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return 'rgba(139, 149, 255, 0.16)';
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.16)`;
  } catch { return 'rgba(139, 149, 255, 0.16)'; }
}

function applyPrefs(p) {
  const r = document.documentElement.style;
  const eff = p.spotlightEffect || 'solid';
  const acrylic = eff === 'acrylic';
  r.setProperty('--accent', p.accent);
  r.setProperty('--wash', washFrom(p.accent));
  r.setProperty('--lr', p.launcherRadius + 'px');
  r.setProperty('--lw', p.launcherWidth + 'px');
  r.setProperty('--ta', acrylic ? p.tint : 0.7 + p.tint * 0.28);
  r.setProperty('--pad', acrylic ? '0px' : '18px');
  r.setProperty('--sb', `${10 + (Number(p.spotlightBlur) || 50) * 0.6}px`);
  recents = p.search.recents;
  document.body.classList.toggle('rounded', !acrylic);
  document.body.classList.toggle('noshadow', !p.launcherShadow);
  document.body.classList.toggle('acrylic', acrylic);
  document.body.classList.toggle('noanim', !p.animations);
  document.body.classList.remove('eff-solid', 'eff-acrylic', 'eff-mica', 'eff-glass', 'eff-frosted', 'eff-aurora');
  document.body.classList.add(`eff-${eff}`);
  document.body.classList.remove('aur-accent', 'aur-amber', 'aur-emerald', 'aur-violet');
  document.body.classList.add(`aur-${['accent', 'amber', 'emerald', 'violet'].includes(p.auroraColor) ? p.auroraColor : 'accent'}`);
}
window.api.getState().then((s) => applyPrefs(s.prefs));
window.api.onState((s) => applyPrefs(s.prefs));

window.api.onShown(() => {
  if (detailsOpen) setDetails(false);
  app.classList.remove('pop');
  void app.offsetWidth;
  app.classList.add('pop');
  input.focus();
  input.select();
  if (input.value !== '') {
    input.value = '';
    update();
  } else if (!results.length) {
    update();
  }
});
update();
