const nav = document.getElementById('nav');
const main = document.getElementById('main');
let state = null, page = 'general', controls = [];

const SWATCHES = ['#8b95ff', '#58b6ff', '#3ed6c0', '#5fd4a0', '#ffb35c', '#ff7a90', '#c084fc'];
const KEYS = [['Alt+Space', 'Alt + Space'], ['Ctrl+Space', 'Ctrl + Space'], ['Ctrl+Alt+Space', 'Ctrl + Alt + Space'], ['Ctrl+Shift+Space', 'Ctrl + Shift + Space'], ['Alt+Shift+Space', 'Alt + Shift + Space'], ['Ctrl+Alt+S', 'Ctrl + Alt + S']];
const PEEK_KEYS = [['Alt+W', 'Alt + W'], ['Ctrl+Alt+W', 'Ctrl + Alt + W'], ['Ctrl+Shift+W', 'Ctrl + Shift + W'], ['', 'Disabled']];
const pct = (v) => Math.round(v * 100) + '%';
const px = (v) => v + ' px';

const PAGES = {
  general: { title: 'General', icon: '⚙️', groups: [
    { title: 'Launcher', items: [
      { key: 'hotkey', label: 'Open Spotlight with', desc: 'Falls back to Ctrl + Space if the shortcut is taken', type: 'select', options: KEYS },
      { key: 'launchAtLogin', label: 'Launch at login', desc: 'Starts with Windows for your account only', type: 'toggle' },
    ] },
    { title: 'Privacy', items: [
      { key: 'clipboard', label: 'Clipboard history', desc: 'Remembers copied text in memory only. Type "clip" in Spotlight. Cleared on quit.', type: 'toggle' },
    ] },
    { title: 'Reset', items: [{ type: 'button', label: 'Reset all settings', desc: 'Restore the defaults', btn: 'Reset', action: () => window.api.reset() }] },
  ] },
  appearance: { title: 'Appearance', icon: '🎨', groups: [
    { title: 'Theme', items: [
      { key: 'spotlightStyle', label: 'Spotlight style', desc: 'Rounded floating card, or Windows acrylic blur', type: 'select', options: [['rounded', 'Rounded card'], ['acrylic', 'Acrylic (Windows blur)']] },
      { key: 'theme', label: 'Theme', type: 'select', options: [['system', 'Match Windows'], ['dark', 'Dark'], ['light', 'Light']] },
      { key: 'accent', label: 'Accent colour', type: 'swatch' },
      { key: 'tint', label: 'Spotlight glass tint', desc: 'Lower is more see-through', type: 'range', min: 0.15, max: 0.9, step: 0.05, fmt: pct },
      { key: 'animations', label: 'Animations', desc: 'Turn off for a snappier, calmer feel', type: 'toggle' },
    ] },
    { title: 'Spotlight window', items: [
      { key: 'launcherRadius', label: 'Corner rounding', type: 'range', min: 0, max: 36, step: 1, fmt: px },
      { key: 'launcherWidth', label: 'Width', type: 'range', min: 560, max: 900, step: 20, fmt: px },
      { key: 'launcherTop', label: 'Distance from top of screen', type: 'range', min: 5, max: 50, step: 1, fmt: (v) => v + '%' },
    ] },
  ] },
  search: { title: 'Search', icon: '🔍', groups: [
    { title: 'What to search', items: [
      { key: 'search.apps', label: 'Apps', type: 'toggle' },
      { key: 'search.files', label: 'Files', type: 'toggle' },
      { key: 'search.folders', label: 'Folders', type: 'toggle' },
      { key: 'search.commands', label: 'Commands and widget toggles', type: 'toggle' },
      { key: 'search.calc', label: 'Calculator', desc: 'Try typing 12*7+3', type: 'toggle' },
      { key: 'search.recents', label: 'Show frequent items when empty', type: 'toggle' },
    ] },
    { title: 'Results', items: [
      { key: 'search.maxResults', label: 'Maximum results', type: 'range', min: 4, max: 10, step: 1, fmt: (v) => v },
      { key: 'search.web', label: 'Web search fallback', type: 'toggle' },
      { key: 'search.engine', label: 'Search engine', type: 'select', options: [['google', 'Google'], ['bing', 'Bing'], ['duckduckgo', 'DuckDuckGo'], ['brave', 'Brave']] },
    ] },
  ] },
};

const WIDGET_OPTS = {
  clock: [
    { key: 'widgetOpts.clock.h24', label: '24-hour time', type: 'toggle' },
    { key: 'widgetOpts.clock.seconds', label: 'Show seconds', type: 'toggle' },
    { key: 'widgetOpts.clock.analog', label: 'Analog face', type: 'toggle' },
  ],
  worldclock: [{ key: 'widgetOpts.worldclock.zones', label: 'Time zones', desc: 'Comma-separated, up to 5. Example: America/New_York,Asia/Tokyo', type: 'text' }],
  weather: [
    { key: 'widgetOpts.weather.city', label: 'City', type: 'text' },
    { key: 'widgetOpts.weather.units', label: 'Units', type: 'select', options: [['c', 'Celsius, km/h'], ['f', 'Fahrenheit, mph']] },
  ],
  system: [
    { key: 'widgetOpts.system.graph', label: 'CPU history graph', type: 'toggle' },
    { key: 'widgetOpts.system.battery', label: 'Show battery', type: 'toggle' },
    { key: 'widgetOpts.system.info', label: 'Hardware details', desc: 'Processor, memory and graphics lines', type: 'toggle' },
    { key: 'widgetOpts.system.gpu', label: 'GPU gauge', desc: 'NVIDIA GPUs only', type: 'toggle' },
  ],
  specs: [
    ['rig', 'GeForce NOW rig'], ['host', 'Device name'], ['user', 'User name'], ['os', 'Windows version'], ['cpu', 'Processor'], ['gpu', 'Graphics card'],
    ['ram', 'Memory'], ['screen', 'Display'], ['ip', 'IP address'], ['uptime', 'Uptime'],
  ].map(([k, l]) => ({ key: 'widgetOpts.specs.' + k, label: l, type: 'toggle' })),
  calendar: [{ key: 'widgetOpts.calendar.mondayFirst', label: 'Week starts on Monday', type: 'toggle' }],
  countdown: [
    { key: 'widgetOpts.countdown.title', label: 'Event name', type: 'text' },
    { key: 'widgetOpts.countdown.date', label: 'Date', desc: 'Format YYYY-MM-DD', type: 'text' },
  ],
};

const get = (key) => key.split('.').reduce((o, k) => o?.[k], state.prefs);
const set = (key, v) => window.api.setSetting(key, v);

function control(item) {
  const wrap = document.createElement('div');
  wrap.className = 'ctl';
  let input;
  const reg = (fn) => controls.push({ item, fn });
  switch (item.type) {
    case 'toggle': {
      wrap.innerHTML = '<label class="sw"><input type="checkbox"><i></i></label>';
      input = wrap.querySelector('input');
      input.onchange = () => (item.widget ? window.api.toggleWidget(item.widget) : set(item.key, input.checked));
      reg(() => { input.checked = item.widget ? !!state.open[item.widget] : !!get(item.key); });
      break;
    }
    case 'select': {
      input = document.createElement('select');
      item.options.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; input.append(o); });
      input.onchange = () => set(item.key, input.value);
      wrap.append(input);
      reg(() => { input.value = get(item.key); });
      break;
    }
    case 'wsize': {
      input = document.createElement('select');
      [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['xl', 'Extra large']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; input.append(o); });
      input.style.minWidth = '120px';
      input.onchange = () => window.api.setWidgetSize(item.widget, input.value);
      wrap.append(input);
      reg(() => { input.value = state.sizes[item.widget] || 'm'; });
      break;
    }
    case 'range': {
      input = document.createElement('input');
      input.type = 'range'; input.min = item.min; input.max = item.max; input.step = item.step;
      const val = document.createElement('span');
      val.className = 'val';
      input.oninput = () => { val.textContent = item.fmt(Number(input.value)); set(item.key, Number(input.value)); };
      wrap.append(input, val);
      reg(() => { if (document.activeElement !== input) input.value = get(item.key); val.textContent = item.fmt(Number(get(item.key))); });
      break;
    }
    case 'text': {
      input = document.createElement('input');
      input.type = 'text';
      let t;
      input.oninput = () => { clearTimeout(t); t = setTimeout(() => set(item.key, input.value), 600); };
      wrap.append(input);
      reg(() => { if (document.activeElement !== input) input.value = get(item.key); });
      break;
    }
    case 'swatch': {
      const box = document.createElement('div');
      box.className = 'sws';
      SWATCHES.forEach((c) => { const b = document.createElement('button'); b.style.background = c; b.dataset.c = c; b.onclick = () => set(item.key, c); box.append(b); });
      const pick = document.createElement('input');
      pick.type = 'color';
      pick.oninput = () => set(item.key, pick.value);
      box.append(pick);
      wrap.append(box);
      reg(() => { box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === get(item.key))); pick.value = get(item.key); });
      break;
    }
    case 'button': {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = item.btn || 'Reset';
      b.onclick = item.action;
      wrap.append(b);
      break;
    }
  }
  return wrap;
}

function row(item) {
  const r = document.createElement('div');
  r.className = 'item';
  const l = document.createElement('div');
  l.className = 'l';
  const b = document.createElement('b');
  b.textContent = item.label;
  l.append(b);
  if (item.desc) { const s = document.createElement('small'); s.textContent = item.desc; l.append(s); }
  r.append(l, control(item));
  return r;
}

function group(title, items, delay) {
  const frag = document.createDocumentFragment();
  if (title) { const h = document.createElement('h2'); h.textContent = title; frag.append(h); }
  const card = document.createElement('div');
  card.className = 'card';
  card.style.animationDelay = delay + 'ms';
  items.forEach((i) => card.append(row(i)));
  frag.append(card);
  return frag;
}

function widgetControls(t) {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;align-items:center;gap:16px';
  box.append(control({ type: 'wsize', widget: t }), control({ type: 'toggle', widget: t }));
  return box;
}

function widgetPage() {
  const h1 = document.createElement('h1');
  h1.textContent = 'Widgets';
  main.append(h1);
  main.append(group('Placement', [
    { key: 'widgetMode', label: 'Where widgets appear', desc: 'Desktop: stay on the desktop, behind your apps. Always on top: float over windows. Peek key: hidden until you press the peek shortcut.', type: 'select',
      options: [['desktop', 'Desktop only'], ['top', 'Always on top'], ['peek', 'Only when peeking']] },
    { key: 'peekKey', label: 'Peek shortcut', desc: 'Shows or hides all widgets over your windows from anywhere', type: 'select', options: PEEK_KEYS },
    { key: 'widgetOpacity', label: 'Widget opacity', type: 'range', min: 0.4, max: 1, step: 0.05, fmt: pct },
    { key: 'widgetScale', label: 'Widget size', type: 'range', min: 0.7, max: 1.6, step: 0.05, fmt: pct },
    { key: 'autoScale', label: 'Scale to my screen', desc: 'Sizes widgets for the monitor or TV they are on', type: 'toggle' },
  ], 0));
  const st = document.createElement('div');
  st.className = 'item';
  st.innerHTML = '<div class="l"><b>Desktop pinning</b><small>Needs PowerShell. If unavailable, use the peek shortcut.</small></div><span class="status" id="poll"></span>';
  main.lastChild.append(st);
  main.append(group('Look', [
    { key: 'widgetRadius', label: 'Corner rounding', type: 'range', min: 0, max: 44, step: 1, fmt: px },
    { key: 'widgetBorder', label: 'Edge highlight', type: 'toggle' },
    { key: 'widgetShadow', label: 'Drop shadow', type: 'toggle' },
  ], 30));
  main.append(group('Grid', [
    { key: 'snapToGrid', label: 'Snap to grid', desc: 'The grid is sized from your screen, so layouts fit any monitor', type: 'toggle' },
    { key: 'gridCollisions', label: 'Push widgets out of the way', desc: 'Dropping a widget on another moves it to the nearest free spot', type: 'toggle' },
    { type: 'button', label: 'Auto-arrange widgets', desc: 'Tidy every open widget into the grid', btn: 'Arrange', action: () => window.api.arrange() },
  ], 45));
  const h2 = document.createElement('h2');
  h2.textContent = 'Your widgets (right-click a widget to resize it)';
  main.append(h2);
  Object.entries(state.widgets).forEach(([t, title], i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = 60 + i * 30 + 'ms';
    const wh = document.createElement('div');
    wh.className = 'wh';
    wh.innerHTML = '<b></b>';
    wh.firstChild.textContent = title;
    wh.append(widgetControls(t));
    card.append(wh);
    (WIDGET_OPTS[t] || []).forEach((o) => { const r = row(o); r.style.borderTop = '1px solid var(--line)'; card.append(r); });
    main.append(card);
  });
}

function showPage() {
  controls = [];
  main.replaceChildren();
  main.scrollTop = 0;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === page));
  if (page === 'widgets') widgetPage();
  else {
    const h1 = document.createElement('h1');
    h1.textContent = PAGES[page].title;
    main.append(h1);
    PAGES[page].groups.forEach((g, i) => main.append(group(g.title, g.items, i * 60)));
  }
  refresh();
}

function refresh() {
  controls.forEach((c) => c.fn());
  const p = document.getElementById('poll');
  if (p) { p.textContent = state.poller ? 'Working' : 'Unavailable'; p.className = 'status ' + (state.poller ? 'ok' : 'no'); }
  document.documentElement.style.setProperty('--accent', state.prefs.accent);
}

function init(s) {
  const first = !state;
  state = s;
  if (first) {
    const all = { ...PAGES, widgets: { title: 'Widgets', icon: '🧩' } };
    Object.entries(all).forEach(([id, p]) => {
      const b = document.createElement('button');
      b.dataset.p = id;
      b.textContent = `${p.icon}  ${p.title}`;
      b.onclick = () => { page = id; showPage(); };
      nav.append(b);
    });
    showPage();
  } else refresh();
}

window.api.onState(init);
window.api.getState().then((s) => { if (!state) init(s); });
