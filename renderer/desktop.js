// Desktop orchestrator — single window, gridstack-based widget layout.
// Manages widget instances, IPC, visibility, click-through, persistence.

(function () {
  const gridEl = document.getElementById('grid');
  let grid = null;
  const instances = {};   // type -> { inst, el, card }
  let state = null;
  let paused = false;

  // Widget default row spans (mapped from original pixel heights)
  const DEFAULT_H = {
    clock: 3, worldclock: 4, weather: 5, system: 6, specs: 8, disks: 4,
    calendar: 6, progress: 4, timer: 5, todo: 6, notes: 5, dock: 3,
    clipboard: 6, gpu: 5, network: 4, countdown: 3, quote: 3,
    pomodoro: 5, habits: 5, stocks: 4, uptime: 3, speedtest: 3, calendarEvents: 5,
  };
  const MIN_H = { clock: 2, specs: 6, calendar: 5 };

  // ── Grid setup ──
  function initGrid() {
    const waW = window.screen.width;
    const waH = window.screen.height;
    const cols = Math.max(3, Math.min(8, Math.floor(waW / 400)));
    const cellH = Math.round(waH / 20); // ~54px at 1080p, ~68px at 1440p

    grid = GridStack.init({
      column: cols,
      cellHeight: cellH,
      margin: 6,
      float: true,
      animate: true,
      resizable: { handles: 'e, se, s, sw, w' },
      draggable: { handle: '.card', scroll: false },
      acceptWidgets: false,
      removable: false,
    }, gridEl);

    // Save on any change
    grid.on('change', (_e, items) => {
      if (!items || !items.length) return;
      saveLayout();
    });

    // On drag stop — settle + save
    grid.on('dragstop', (_e, el) => {
      const type = el.dataset.type;
      if (type) saveLayout();
    });

    // On resize stop — remount widget to adapt content
    grid.on('resizestop', (_e, el) => {
      const type = el.dataset.type;
      if (!type || !instances[type]) return;
      // Remount so widget content adapts to new height
      const s = state;
      if (s) instances[type].inst.mount(s.prefs.widgetOpts[type], s.prefs);
      saveLayout();
    });

    return { cols, cellH };
  }

  // ── Widget creation ──
  function createGridItem(type) {
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.dataset.type = type;
    const w = 1;
    const h = DEFAULT_H[type] || 4;
    item.setAttribute('gs-w', w);
    item.setAttribute('gs-h', h);
    item.setAttribute('gs-min-h', MIN_H[type] || 2);

    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';

    const card = document.createElement('div');
    card.className = 'card w-' + type;
    card.innerHTML = '<div class="orb a"></div><div class="orb b"></div><button class="x" title="Close">&times;</button><div class="content"></div>';

    const contentEl = card.querySelector('.content');
    content.appendChild(card);
    item.appendChild(content);

    const inst = window.createWidget(type, contentEl, card, window.api);
    instances[type] = { inst, el: contentEl, card, item };
    return item;
  }

  function mountWidget(type) {
    if (!state || instances[type]) return;
    const item = createGridItem(type);
    gridEl.appendChild(item);
    grid.makeWidget(item);
    instances[type].inst.mount(state.prefs.widgetOpts[type], state.prefs);
  }

  function unmountWidget(type) {
    if (!instances[type]) return;
    instances[type].inst.destroy();
    const item = instances[type].item;
    grid.removeWidget(item, true);
    delete instances[type];
  }

  // ── Layout persistence ──
  function saveLayout() {
    if (!grid || !state) return;
    const layout = {};
    for (const [type, { item }] of Object.entries(instances)) {
      const n = item;
      layout[type] = {
        x: parseInt(n.getAttribute('gs-x') || 0),
        y: parseInt(n.getAttribute('gs-y') || 0),
        w: parseInt(n.getAttribute('gs-w') || 1),
        h: parseInt(n.getAttribute('gs-h') || DEFAULT_H[type] || 4),
      };
    }
    window.api.setSetting('widgetLayout', layout);
  }

  function loadLayout(saved) {
    if (!saved || !grid) return;
    for (const [type, pos] of Object.entries(saved)) {
      if (!instances[type]) continue;
      const { item } = instances[type];
      grid.update(item, { x: pos.x, y: pos.y, w: pos.w, h: pos.h });
    }
  }

  // ── State handling ──
  function applyState(s) {
    const prev = state;
    state = s;

    // CSS vars
    const r = document.documentElement.style;
    r.setProperty('--accent', s.prefs.accent);
    r.setProperty('--wo', s.prefs.widgetOpacity);
    r.setProperty('--radius', s.prefs.widgetRadius + 'px');
    // Convert hex accent to rgb for placeholder
    const hex = s.prefs.accent.replace('#', '');
    if (hex.length === 6 || hex.length === 3) {
      const r2 = hex.length === 3 ? parseInt(hex[0] + hex[0], 16) : parseInt(hex.slice(0, 2), 16);
      const g = hex.length === 3 ? parseInt(hex[1] + hex[1], 16) : parseInt(hex.slice(2, 4), 16);
      const b = hex.length === 3 ? parseInt(hex[2] + hex[2], 16) : parseInt(hex.slice(4, 6), 16);
      r.setProperty('--accent-rgb', `${r2},${g},${b}`);
    }
    document.body.classList.toggle('noanim', !s.prefs.animations);
    document.body.classList.toggle('noborder', !s.prefs.widgetBorder);
    document.body.classList.toggle('noshadow', !s.prefs.widgetShadow);

    // Open/close widgets
    for (const type of Object.keys(s.widgets)) {
      const shouldBeOpen = !!s.open[type];
      const isOpen = !!instances[type];
      if (shouldBeOpen && !isOpen) mountWidget(type);
      else if (!shouldBeOpen && isOpen) unmountWidget(type);
      else if (shouldBeOpen && isOpen) instances[type].inst.setState(s);
    }

    // Load layout on first state
    if (!prev && s.widgetLayout) loadLayout(s.widgetLayout);

    // Visibility
    document.body.classList.toggle('hidden', paused);
  }

  // ── Click-through management ──
  let clickThrough = true;
  function setClickThrough(ignore) {
    if (clickThrough === ignore) return;
    clickThrough = ignore;
    window.api.setClickThrough(ignore);
  }

  // Detect mouse over widgets vs empty space
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('.grid-stack-item')) setClickThrough(false);
  });
  document.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget;
    if (!to || !to.closest || !to.closest('.grid-stack-item')) setClickThrough(true);
  });
  // Also handle when mouse enters the window at all
  document.addEventListener('mouseenter', () => setClickThrough(false));
  document.addEventListener('mouseleave', () => setClickThrough(true));

  // ── IPC wiring ──
  window.api.onState(applyState);
  window.api.getState().then(applyState).catch(() => {});

  window.api.onVis((v) => {
    paused = !v;
    document.body.classList.toggle('hidden', !v);
    for (const { inst } of Object.values(instances)) inst.setPaused(v);
  });

  window.api.onArrange(() => {
    if (!grid) return;
    // Collect all items and repack into columns
    const items = Object.values(instances).map(({ item }) => item);
    items.sort((a, b) => {
      const ha = parseInt(a.getAttribute('gs-h') || 4);
      const hb = parseInt(b.getAttribute('gs-h') || 4);
      return hb - ha;
    });
    const cols = grid.opts.column;
    let col = 0, row = 0, maxRowInCol = 0;
    for (const item of items) {
      const h = parseInt(item.getAttribute('gs-h') || 4);
      if (row + h > Math.ceil(window.screen.height / (grid.opts.cellHeight || 50))) {
        col = (col + 1) % cols;
        row = 0;
      }
      grid.update(item, { x: col, y: row }, false);
      row += h + 1;
    }
    grid.compact();
    saveLayout();
  });

  window.api.onClip((list) => {
    if (instances.clipboard) instances.clipboard.inst.onClipEvent(list);
  });

  // ── Init ──
  initGrid();
})();
