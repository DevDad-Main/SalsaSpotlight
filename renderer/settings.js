const nav = document.getElementById('nav');
const main = document.getElementById('main');
let state = null, page = 'general', controls = [], stateReady = false;

function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }

// Windhawk-inspired palette first, then the original Salsa accents.
const SWATCHES = ['#3b6fd4', '#5b6472', '#22262e', '#14b8a6', '#fb7185', '#e11d48', '#38bdf8', '#a78bfa', '#f59e0b', '#10b981', '#8b5cf6', '#2dd4bf', '#8b95ff', '#ffd93d', '#6bcb77', '#ff9ff3'];
const KEYS = [['Alt+Space', 'Alt + Space'], ['Ctrl+Space', 'Ctrl + Space'], ['Ctrl+Alt+Space', 'Ctrl + Alt + Space'], ['Ctrl+Shift+Space', 'Ctrl + Shift + Space'], ['Alt+Shift+Space', 'Alt + Shift + Space'], ['Ctrl+Alt+S', 'Ctrl + Alt + S']];
const PEEK_KEYS = [['Alt+W', 'Alt + W'], ['Ctrl+Alt+W', 'Ctrl + Alt + W'], ['Ctrl+Shift+W', 'Ctrl + Shift + W'], ['', 'Disabled']];
const pct = (v) => Math.round(v * 100) + '%';
const px = (v) => v + ' px';

const PAGES = {
  general: { title: 'General', icon: 'settings', groups: [
    { title: 'Launcher', items: [
      { key: 'hotkey', label: 'Open Spotlight with', desc: 'Falls back to Ctrl + Space if the shortcut is taken', type: 'select', options: KEYS },
      { key: 'launchAtLogin', label: 'Launch at login', desc: 'Starts with Windows for your account only', type: 'toggle' },
      { type: 'salsanow', label: 'SalsaNOW automatic startup', desc: 'Adds SalsaSpotlight to I:\\Apps\\SalsaNOW\\StartupBatch.bat so it launches with your GFN session' },
    ] },
    { title: 'Privacy', items: [
      { key: 'clipboard', label: 'Clipboard history', desc: 'Remembers copied text in memory only. Type "clip" in Spotlight. Cleared on quit.', type: 'toggle' },
    ] },
    { title: 'Help', items: [
      { key: 'showTour', label: 'Show welcome tour at startup', desc: 'Displays the 3-step intro each time SalsaSpotlight launches', type: 'toggle' },
      { type: 'button', label: 'Need a refresher?', desc: 'Open the welcome tour now', btn: 'Show help', action: () => window.api.showTour() },
    ] },
    { title: 'Reset', items: [{ type: 'button', label: 'Reset all settings', desc: 'Restore the defaults', btn: 'Reset', action: () => window.api.reset() }] },
  ] },
  appearance: { title: 'Appearance', icon: 'palette', groups: [
    { title: 'Theme', items: [
      { key: 'spotlightEffect', label: 'Background effect', desc: 'Solid card, or blurred material effects', type: 'select', options: [['solid', 'Solid card'], ['acrylic', 'Acrylic (Windows blur)'], ['mica', 'Mica'], ['glass', 'Glass'], ['frosted', 'Frosted'], ['aurora', 'Aurora']] },
      { key: 'spotlightBlur', label: 'Blur strength', desc: 'How strong the background blur is', type: 'range', min: 20, max: 100, step: 5, fmt: (v) => v + '%' },
      { key: 'theme', label: 'Theme', type: 'select', options: [['system', 'Match Windows'], ['dark', 'Dark'], ['light', 'Light']] },
      { key: 'accent', label: 'Accent colour', type: 'swatch' },
      { key: 'tint', label: 'Spotlight glass tint', desc: 'Lower is more see-through', type: 'range', min: 0.15, max: 0.9, step: 0.05, fmt: pct },
      { key: 'animations', label: 'Animations', desc: 'Turn off for a snappier, calmer feel', type: 'toggle' },
    ] },
    { title: 'Spotlight window', items: [
      { key: 'launcherRadius', label: 'Corner rounding', type: 'range', min: 0, max: 36, step: 1, fmt: px },
      { key: 'launcherWidth', label: 'Width', type: 'range', min: 560, max: 900, step: 20, fmt: px },
      { key: 'launcherTop', label: 'Distance from top of screen', type: 'range', min: 5, max: 50, step: 1, fmt: (v) => v + '%' },
      { key: 'launcherShadow', label: 'Spotlight soft shadow', desc: 'Adds a soft blended drop shadow around the spotlight bar', type: 'toggle' },
    ] },
  ] },
  search: { title: 'Search', icon: 'search', groups: [
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
      { key: 'indexEvery', label: 'App index updates', desc: 'How often the app list refreshes in the background', type: 'select', options: [[1, 'Every minute'], [3, 'Every 3 minutes'], [5, 'Every 5 minutes'], [10, 'Every 10 minutes']] },
    ] },
  ] },
};

const WIDGET_OPTS = {
  clock: [
    { key: 'widgetOpts.clock.h24', label: '24-hour time', type: 'toggle' },
    { key: 'widgetOpts.clock.seconds', label: 'Show seconds', type: 'toggle' },
    { key: 'widgetOpts.clock.analog', label: 'Analog face', type: 'toggle' },
  ],
  worldclock: [
    { key: 'widgetOpts.worldclock.zones', label: 'Time zones', desc: 'Comma-separated IANA timezone names (e.g. America/New_York, Europe/London, Asia/Tokyo, Australia/Sydney)', type: 'text' },
  ],
  weather: [
    { key: 'widgetOpts.weather.city', label: 'City location', desc: 'Type "auto" to use your detected location, or enter any city name (e.g. London, New York, Tokyo)', type: 'text' },
    { key: 'widgetOpts.weather.units', label: 'Units', type: 'select', options: [['c', 'Celsius, km/h'], ['f', 'Fahrenheit, mph']] },
    { key: 'widgetOpts.weather.hours', label: 'Show hourly forecast', type: 'toggle' },
  ],
  system: [
    { key: 'widgetOpts.system.graph', label: 'CPU history graph', type: 'toggle' },
    { key: 'widgetOpts.system.battery', label: 'Show battery', type: 'toggle' },
    { key: 'widgetOpts.system.info', label: 'Hardware details', desc: 'Processor, memory and graphics lines', type: 'toggle' },
    { key: 'widgetOpts.system.gpu', label: 'GPU gauge', desc: 'NVIDIA GPUs only', type: 'toggle' },
  ],
  specs: [
    { key: 'gfnRig', label: 'GeForce NOW rig', desc: 'Auto-detect your tier, or force it if detection fails (overrides CPU/memory)', type: 'select', options: [
      ['auto', 'Auto-detect'], ['3050b', 'RTX 3050 (Free)'], ['3060d', 'RTX 3060 (Performance)'], ['4080h', 'RTX 4080 (Ultimate)'], ['5080h', 'RTX 5080 (Ultimate)'],
    ] },
    ['rig', 'GeForce NOW rig'], ['host', 'Device name'], ['user', 'User name'], ['os', 'Windows version'], ['cpu', 'Processor'], ['gpu', 'Graphics card'],
    ['ram', 'Memory'], ['screen', 'Display'], ['ip', 'IP address'], ['uptime', 'Uptime'],
  ].map((r) => (r.key ? r : { key: 'widgetOpts.specs.' + r[0], label: r[1], type: 'toggle' })),
  calendar: [
    { key: 'widgetOpts.calendar.mondayFirst', label: 'Week starts on Monday', type: 'toggle' },
  ],
  media: [
    { key: 'widgetOpts.media.controls', label: 'Show playback controls', desc: 'Play/pause, previous and next buttons', type: 'toggle' },
  ],
  countdown: [    { key: 'widgetOpts.countdown.title', label: 'Event name', type: 'text' },
    { key: 'widgetOpts.countdown.date', label: 'Date', desc: 'Format YYYY-MM-DD', type: 'text' },
    { key: 'widgetOpts.countdown.recur', label: 'Repeat', desc: 'Recurring countdown for birthdays etc', type: 'select',
      options: [['none', 'Once'], ['yearly', 'Every year'], ['monthly', 'Every month'], ['weekly', 'Every week']] },
  ],
  progress: [
    { key: 'widgetOpts.progress.showYear', label: 'Show year progress', type: 'toggle' },
    { key: 'widgetOpts.progress.showDay', label: 'Show day progress', type: 'toggle' },
    { key: 'widgetOpts.progress.greeting', label: 'Show greeting', type: 'toggle' },
  ],
  timer: [
    { key: 'widgetOpts.timer.defaultMins', label: 'Default minutes', type: 'range', min: 1, max: 120, step: 1, fmt: (v) => v + ' min' },
    { key: 'widgetOpts.timer.sound', label: 'Play sound when done', type: 'toggle' },
  ],
  todo: [
    { key: 'widgetOpts.todo.maxItems', label: 'Maximum visible items', type: 'range', min: 3, max: 20, step: 1, fmt: (v) => v },
  ],
  notes: [
    { key: 'widgetOpts.notes.fontSize', label: 'Font size', type: 'range', min: 11, max: 22, step: 1, fmt: (v) => v + 'px' },
    { key: 'widgetOpts.notes.markdown', label: 'Markdown preview', desc: 'Render **bold**, *italic*, # headings, - lists', type: 'toggle' },
  ],
  dock: [
    { key: 'widgetOpts.dock.columns', label: 'Columns', type: 'range', min: 3, max: 8, step: 1, fmt: (v) => v },
    { key: 'widgetOpts.dock.maxApps', label: 'Maximum apps shown', type: 'range', min: 4, max: 16, step: 1, fmt: (v) => v },
  ],
  clipboard: [
    { key: 'widgetOpts.clipboard.maxItems', label: 'Maximum items', type: 'range', min: 5, max: 30, step: 1, fmt: (v) => v },
  ],
  gpu: [
    { key: 'widgetOpts.gpu.showVram', label: 'Show VRAM usage', type: 'toggle' },
    { key: 'widgetOpts.gpu.showTemp', label: 'Show temperature', type: 'toggle' },
    { key: 'widgetOpts.gpu.showPower', label: 'Show power draw', type: 'toggle' },
    { key: 'widgetOpts.gpu.showClock', label: 'Show clock speed', type: 'toggle' },
    { key: 'widgetOpts.gpu.showFan', label: 'Show fan speed', type: 'toggle' },
  ],
  network: [
    { key: 'widgetOpts.network.showIface', label: 'Show interface name', type: 'toggle' },
  ],
  habits: [
    { key: 'widgetOpts.habits.maxItems', label: 'Maximum habits', type: 'range', min: 3, max: 12, step: 1, fmt: (v) => v },
    { key: 'widgetOpts.habits.heatmap', label: 'Show 28-day heatmap', desc: 'Visual calendar of check-ins', type: 'toggle' },
  ],
  uptime: [
    { key: 'widgetOpts.uptime.showSeconds', label: 'Show seconds', type: 'toggle' },
  ],
  calendarEvents: [
    { key: 'widgetOpts.calendarEvents.showPast', label: 'Show past events', type: 'toggle' },
    { key: 'widgetOpts.calendarEvents.maxEvents', label: 'Maximum events', type: 'range', min: 3, max: 15, step: 1, fmt: (v) => v },
  ],
  pomodoro: [
    { key: 'widgetOpts.pomodoro.workMin', label: 'Work minutes', type: 'range', min: 10, max: 60, step: 5, fmt: (v) => v + ' min' },
    { key: 'widgetOpts.pomodoro.breakMin', label: 'Break minutes', type: 'range', min: 3, max: 30, step: 1, fmt: (v) => v + ' min' },
    { key: 'widgetOpts.pomodoro.longBreakMin', label: 'Long break minutes', type: 'range', min: 10, max: 45, step: 5, fmt: (v) => v + ' min' },
    { key: 'widgetOpts.pomodoro.sessionsBeforeLong', label: 'Sessions before long break', type: 'range', min: 2, max: 6, step: 1, fmt: (v) => v },
    { key: 'widgetOpts.pomodoro.focusMode', label: 'Focus mode', desc: 'Dim other widgets while working', type: 'toggle' },
  ],
};

function lucide(name, size = 16) {
  const I = {
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    widgets: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    updates: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    logs: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12h4"/><path d="M10 16h4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M21 21v-5h-5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    loader: '<line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/>',
  };
  const body = I[name] || I.settings;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle">${body}</svg>`;
}

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
    case 'info': {
      const s = document.createElement('span');
      s.id = 'instv';
      s.className = 'val';
      wrap.append(s);
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
    case 'salsanow': {
      wrap.innerHTML = '<label class="sw"><input type="checkbox" id="sn-chk"><i></i></label><span class="val" id="sn-stat" style="min-width:60px"></span>';
      const input = wrap.querySelector('#sn-chk');
      const stat = wrap.querySelector('#sn-stat');
      const refreshStatus = () => {
        window.api.getStartupStatus().then((st) => {
          if (!st.available) {
            input.disabled = true;
            stat.textContent = 'Not in SalsaNOW';
            stat.style.color = 'var(--muted)';
          } else if (st.paused) {
            input.checked = false;
            stat.textContent = 'Paused';
            stat.style.color = '#ff9f0a';
          } else {
            input.checked = st.enabled;
            input.disabled = false;
            stat.textContent = st.enabled ? 'Active' : 'Off';
            stat.style.color = st.enabled ? '#30d158' : 'var(--muted)';
          }
        }).catch(() => {});
      };
      input.onchange = () => {
        window.api.setStartupStatus(input.checked).then(() => refreshStatus());
      };
      reg(refreshStatus);
      refreshStatus();
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

function updatesPage() {
  const h1 = document.createElement('h1');
  h1.textContent = 'Updates';
  main.append(h1);
  const card = document.createElement('div');
  card.className = 'card upd';
  card.innerHTML = '<div class="upd-row"><div class="upd-ico" id="ui"></div><div class="upd-txt"><b id="ut"></b><small id="us"></small></div></div>'
    + '<div class="upbar" id="upbar" hidden><i id="upfill"></i></div>'
    + '<div class="upd-btns"><button class="btn" id="ucheck">Check for updates</button><button class="btn primary" id="uinstall" hidden>Restart and install</button></div>';
  main.append(card);
  document.getElementById('ucheck').onclick = () => window.api.checkUpdates();
  document.getElementById('uinstall').onclick = () => window.api.installUpdate();
  const info = document.createElement('div');
  info.className = 'card';
  info.append(row({ label: 'Installed version', desc: 'Updates come from the SalsaSpotlight GitHub releases', type: 'info' }));
  main.append(info);
}

function updateUI() {
  const t = document.getElementById('ut');
  if (!t) return;
  const u = state.update;
  const M = {
    idle: [lucide('download', 20), `Version ${u.version}`, 'Press "Check for updates" to look for a newer version.'],
    checking: [lucide('refresh', 20), 'Checking for updates...', `Current version ${u.version}`],
    downloading: [lucide('download', 20), `Downloading version ${u.latest || ''}`, `${u.percent}% complete`],
    ready: [lucide('checkCircle', 20), `Version ${u.latest} is ready`, 'Restart to install it now. It also installs when you quit.'],
    uptodate: [lucide('checkCircle', 20), 'You are up to date', `SalsaSpotlight ${u.version} is the latest version.`],
    error: [lucide('alert', 20), 'Could not check for updates', u.error || 'Check your internet connection and try again.'],
    dev: [lucide('wrench', 20), 'Updates work in the installed app', `Running from source (${u.version}).`],
  };
  const [icon, title, sub] = M[u.status] || M.idle;
  document.getElementById('ui').innerHTML = icon;
  t.textContent = title;
  document.getElementById('us').textContent = sub;
  document.getElementById('ui').classList.toggle('spin', u.status === 'checking');
  const bar = document.getElementById('upbar');
  bar.hidden = u.status !== 'downloading';
  document.getElementById('upfill').style.width = u.percent + '%';
  document.getElementById('uinstall').hidden = u.status !== 'ready';
  const check = document.getElementById('ucheck');
  check.disabled = u.status === 'checking' || u.status === 'downloading';
  const v = document.getElementById('instv');
  if (v) v.textContent = u.version;
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
    { key: 'widgetContentScale', label: 'Content zoom', desc: 'Scale text and content inside widgets', type: 'range', min: 0.7, max: 1.4, step: 0.05, fmt: pct },
    { key: 'widgetBorder', label: 'Edge highlight', type: 'toggle' },
    { key: 'widgetShadow', label: 'Drop shadow', type: 'toggle' },
  ], 30));
  main.append(group('Grid', [
    { key: 'snapToGrid', label: 'Snap to grid', desc: 'The grid is sized from your screen, so layouts fit any monitor', type: 'toggle' },
    { key: 'gridCollisions', label: 'Push widgets out of the way', desc: 'Dropping a widget on another moves it to the nearest free spot', type: 'toggle' },
    { key: 'widgetGap', label: 'Gap between widgets', type: 'range', min: 0, max: 30, step: 1, fmt: px },
    { key: 'arrangeAnchor', label: 'Auto-arrange origin', desc: 'Where widgets cluster when auto-arranged', type: 'select',
      options: [['top-right', 'Top Right (macOS default)'], ['top-left', 'Top Left'], ['bottom-right', 'Bottom Right'], ['bottom-left', 'Bottom Left'], ['center', 'Centered']] },
    { type: 'button', label: 'Show all widgets', desc: 'Open every widget at once', btn: 'Show All', action: () => { Object.keys(state.widgets).forEach((t) => { if (!state.open[t]) window.api.toggleWidget(t); }); } },
    { type: 'button', label: 'Hide all widgets', desc: 'Close every widget', btn: 'Hide All', action: () => { Object.keys(state.widgets).forEach((t) => { if (state.open[t]) window.api.toggleWidget(t); }); } },
    { type: 'button', label: 'Auto-arrange widgets', desc: 'Tidy every open widget into the grid according to size and priority', btn: 'Arrange Now', action: () => window.api.arrange() },
    { type: 'button', label: 'Reset widget layout', desc: 'Clear saved positions and re-arrange from scratch', btn: 'Reset Layout', action: () => { window.api.setSetting('widgetLayout', {}); setTimeout(() => window.api.arrange(), 200); } },
    { type: 'button', label: 'Export layout', desc: 'Save current widget positions as a preset file', btn: 'Export', action: () => {
      try {
        const layout = state.widgetLayout || {};
        const open = Object.keys(state.open || {}).filter((t) => state.open[t]);
        const blob = new Blob([JSON.stringify({ version: 1, layout, open, exported: new Date().toISOString() }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'salsaspotlight-layout.json'; a.click(); URL.revokeObjectURL(a.href);
      } catch { /* export failed */ }
    } },
    { type: 'button', label: 'Import layout', desc: 'Load widget positions from a preset file', btn: 'Import', action: () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            const d = JSON.parse(r.result);
            if (d.layout) window.api.setSetting('widgetLayout', d.layout);
            if (d.open) Object.entries(d.open).forEach(([t, should]) => { if (should && !state.open[t]) window.api.toggleWidget(t); });
            setTimeout(() => window.api.arrange(), 300);
          } catch { alert('Invalid layout file'); }
        };
        r.readAsText(f);
      };
      inp.click();
    } },
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

function logsPage() {
  const h1 = document.createElement('h1');
  h1.textContent = 'Logs';
  main.append(h1);
  const sub = document.createElement('p');
  sub.style.cssText = 'color:var(--muted);font-size:13px;margin:-8px 0 16px';
  sub.textContent = 'Application errors and diagnostics. Useful for troubleshooting.';
  main.append(sub);
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'padding:20px';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--tile);display:grid;place-items:center;color:var(--accent)">${lucide('logs', 18)}</div>
        <div>
          <b style="font-size:14px">Error Log</b>
          <small id="lp" style="display:block;color:var(--muted);font-size:11px;margin-top:2px"></small>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" id="lcopy">Copy</button>
        <button class="btn" id="lclear">Clear</button>
        <button class="btn" id="lopen">Open Folder</button>
      </div>
    </div>
    <textarea id="ltxt" readonly style="width:100%;height:420px;background:rgba(0,0,0,0.25);border:1px solid var(--line);border-radius:10px;padding:14px;color:#c8c8d0;font-family:Consolas,'Cascadia Code',monospace;font-size:12px;line-height:1.6;resize:vertical;outline:0;user-select:text;white-space:pre-wrap;word-break:break-all"></textarea>
    <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
      <span id="lcount" style="color:var(--muted);font-size:11px"></span>
      <span style="color:var(--muted);font-size:11px">Auto-refreshes when you switch to this page</span>
    </div>
  `;
  main.append(card);
  const txt = card.querySelector('#ltxt');
  const pathEl = card.querySelector('#lp');
  const countEl = card.querySelector('#lcount');
  const refreshLogs = () => {
    window.api.readLogs().then((res) => {
      pathEl.textContent = res.path;
      const content = res.content || 'Log file is empty. All systems running normally.';
      txt.value = content;
      txt.scrollTop = txt.scrollHeight;
      const lines = content.split('\n').filter((l) => l.trim()).length;
      countEl.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
    }).catch((e) => { txt.value = `Error reading logs: ${e.message}`; });
  };
  card.querySelector('#lcopy').onclick = () => {
    navigator.clipboard.writeText(txt.value);
    const b = card.querySelector('#lcopy');
    b.textContent = 'Copied!';
    setTimeout(() => { b.textContent = 'Copy'; }, 1500);
  };
  card.querySelector('#lclear').onclick = () => {
    window.api.clearLogs();
    refreshLogs();
  };
  card.querySelector('#lopen').onclick = () => window.api.openLogFolder();
  refreshLogs();
}

function showPage() {
  controls = [];
  main.replaceChildren();
  main.scrollTop = 0;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === page));
  if (page === 'widgets') widgetPage();
  else if (page === 'updates') updatesPage();
  else if (page === 'logs') logsPage();
  else {
    const h1 = document.createElement('h1');
    h1.textContent = PAGES[page].title;
    main.append(h1);
    PAGES[page].groups.forEach((g, i) => main.append(group(g.title, g.items, i * 60)));
  }
  refresh();
}

function refresh() {
  updateUI();
  controls.forEach((c) => c.fn());
  const p = document.getElementById('poll');
  if (p) { p.textContent = state.poller ? 'Working' : 'Unavailable'; p.className = 'status ' + (state.poller ? 'ok' : 'no'); }
  document.documentElement.style.setProperty('--accent', state.prefs.accent);
}

function init(s) {
  if (!s || !s.prefs) return;
  try {
    const first = !state;
    state = s;
    stateReady = true;
    if (first) {
      const all = { ...PAGES, widgets: { title: 'Widgets', icon: 'widgets' }, updates: { title: 'Updates', icon: 'updates' }, logs: { title: 'Logs', icon: 'logs' } };
      const want = new URLSearchParams(location.search).get('page');
      if (want && all[want]) page = want;
      Object.entries(all).forEach(([id, p]) => {
        const b = document.createElement('button');
        b.dataset.p = id;
        b.innerHTML = `${lucide(p.icon, 16)}  <span>${esc(p.title)}</span>`;
        b.onclick = () => { page = id; showPage(); };
        nav.append(b);
      });
      showPage();
    } else refresh();
  } catch (e) {
    console.error('Settings init failed:', e);
    showError(e);
  }
}

function showLoading() {
  main.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--muted)"><div class="spin-icon" style="color:var(--accent)">${lucide('loader', 32)}</div><div style="font-size:14px">Loading settings...</div></div>`;
  const svg = main.querySelector('svg');
  if (svg) svg.style.animation = 'spin 1.2s linear infinite';
  if (!document.getElementById('spin-style')) {
    const st = document.createElement('style');
    st.id = 'spin-style';
    st.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.append(st);
  }
}

function showError(err) {
  const detail = err ? `<div style="font-size:11px;color:var(--muted);max-width:500px;word-break:break-all;margin-top:8px;font-family:monospace">${esc(err.message || String(err))}</div>` : '';
  main.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--muted)"><div style="color:var(--red, #ff453a)">${lucide('alert', 32)}</div><div style="font-size:14px">Could not load settings</div>${detail}<button class="btn" onclick="location.reload()">Retry</button></div>`;
}

showLoading();
let bootstrapped = false;
function bootstrap() {
  if (bootstrapped) return;
  if (!window.api) return;
  bootstrapped = true;
  try {
    window.api.onState(init);
    window.api.onGoto((p) => { if (state && (p === 'updates' || p === 'widgets' || PAGES[p])) { page = p; showPage(); } });
    window.api.getState().then((s) => { if (!stateReady) init(s); }).catch((e) => { console.error('getState failed:', e); if (!stateReady) showError(e); });
  } catch (e) {
    console.error('Settings bootstrap failed:', e);
    showError(e);
  }
}
// Retry bootstrap until window.api is available (preload may load late)
const bootstrapInterval = setInterval(() => {
  if (window.api) { clearInterval(bootstrapInterval); bootstrap(); }
}, 100);
bootstrap();
// Failsafe: show error only if still not ready after 12s
setTimeout(() => { clearInterval(bootstrapInterval); if (!stateReady) showError(); }, 12000);
