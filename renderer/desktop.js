// Desktop orchestrator — single window, gridstack-based widget layout.
// Click-through: window passes clicks to desktop by default, only captures on widgets.

(function () {
  const gridEl = document.getElementById('grid');
  let grid = null;
  const instances = {};   // type -> { inst, el, card, item }
  let state = null;
  let paused = false;
  let overWidget = false;
  let dragging = false;

  // Widget default row spans
  const DEFAULT_H = {
    clock: 4, worldclock: 5, weather: 6, system: 7, specs: 9, disks: 5,
    calendar: 7, progress: 5, timer: 6, todo: 7, notes: 5, dock: 4,
    clipboard: 7, gpu: 6, network: 5, countdown: 4, quote: 3,
    pomodoro: 6, habits: 6, uptime: 3, speedtest: 3, calendarEvents: 6,
  };
  const MIN_H = { clock: 3, specs: 7, calendar: 6, weather: 4, system: 5, timer: 5, pomodoro: 5 };

  // ── Grid setup ──
  // The desktop window is sized to the work area (excludes taskbar), so all row math
  // uses window.innerHeight — NOT window.screen.height (full display incl. taskbar).
  function gridRows() {
    const cellH = (grid && grid.opts.cellHeight) || 50;
    return Math.max(4, Math.floor(window.innerHeight / cellH));
  }

  function initGrid() {
    const cols = Math.max(3, Math.min(8, Math.floor(window.innerWidth / 400)));
    const cellH = Math.max(30, Math.round(window.innerHeight / 22));

    grid = GridStack.init({
      column: cols,
      cellHeight: cellH,
      maxRow: Math.floor(window.innerHeight / cellH),
      margin: 12,
      float: true,
      animate: true,
      resizable: { handles: 'e, se, s, sw, w' },
      draggable: { handle: '.card', scroll: false },
      acceptWidgets: false,
      removable: false,
    }, gridEl);

    grid.on('change', () => { if (!dragging) clampAllWidgets(); saveLayout(); });
    grid.on('dragstart', () => { dragging = true; window.api.setClickThrough(false); });
    grid.on('dragstop', (_e, el) => {
      dragging = false;
      clampWidget(el);
      clampAllWidgets();
      saveLayout();
      updateClickThrough();
    });
    grid.on('resizestart', () => { dragging = true; window.api.setClickThrough(false); });
    grid.on('resizestop', (_e, el) => {
      dragging = false;
      clampWidget(el);
      clampAllWidgets();
      updateClickThrough();
      const type = el.dataset.type;
      if (!type || !instances[type] || !state) return;
      instances[type].inst.mount(state.prefs.widgetOpts[type], state.prefs);
      saveLayout();
    });

    // Resolution / taskbar changes — keep the row cap in sync and pull widgets back in
    window.addEventListener('resize', () => {
      if (!grid) return;
      const rows = gridRows();
      grid.opts.maxRow = rows;
      if (grid.engine) grid.engine.maxRow = rows;
      clampAllWidgets();
    });
  }

  // ── Widget creation ──
  function createGridItem(type) {
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.dataset.type = type;
    item.setAttribute('gs-w', 1);
    item.setAttribute('gs-h', DEFAULT_H[type] || 4);
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

  // Get anchor-appropriate starting column for new widgets
  function anchorStartCol(w) {
    const cols = grid.opts.column;
    const anchor = state?.prefs?.arrangeAnchor || 'top-right';
    if (anchor === 'top-left' || anchor === 'bottom-left') return 0;
    if (anchor === 'center') return Math.max(0, Math.floor((cols - w) / 2));
    return Math.max(0, cols - w); // top-right, bottom-right (default)
  }

  function mountWidget(type) {
    if (!state || instances[type]) return;
    const item = createGridItem(type);
    gridEl.appendChild(item);
    const h = DEFAULT_H[type] || 4;
    // Position based on arrange anchor so new widgets appear in the right zone
    const x = anchorStartCol(1);
    grid.makeWidget(item, { w: 1, h, x, autoPosition: false });
    instances[type].inst.mount(state.prefs.widgetOpts[type], state.prefs);
  }

  function unmountWidget(type) {
    if (!instances[type]) return;
    instances[type].inst.destroy();
    grid.removeWidget(instances[type].item, true);
    delete instances[type];
  }

  // Clamp a single widget to grid bounds (rows computed from the work-area window, not full screen)
  function clampWidget(el) {
    if (!grid || !el) return;
    const cols = grid.opts.column;
    const maxRows = gridRows();
    let x = parseInt(el.getAttribute('gs-x') || 0);
    let y = parseInt(el.getAttribute('gs-y') || 0);
    const w = Math.min(parseInt(el.getAttribute('gs-w') || 1), cols);
    const h = Math.min(parseInt(el.getAttribute('gs-h') || 1), maxRows);
    const nx = Math.max(0, Math.min(x, cols - w));
    const ny = Math.max(0, Math.min(y, maxRows - h));
    if (nx !== x || ny !== y || w !== parseInt(el.getAttribute('gs-w') || 1) || h !== parseInt(el.getAttribute('gs-h') || 1)) {
      grid.update(el, { x: nx, y: ny, w, h }, false);
    }
  }

  // Clamp ALL widgets — catches pushed widgets that got shoved off-screen
  function clampAllWidgets() {
    if (!grid) return;
    for (const { item } of Object.values(instances)) {
      clampWidget(item);
    }
  }

  // ── Layout persistence ──
  function saveLayout() {
    if (!grid || !state) return;
    const layout = {};
    for (const [type, { item }] of Object.entries(instances)) {
      layout[type] = {
        x: parseInt(item.getAttribute('gs-x') || 0),
        y: parseInt(item.getAttribute('gs-y') || 0),
        w: parseInt(item.getAttribute('gs-w') || 1),
        h: parseInt(item.getAttribute('gs-h') || DEFAULT_H[type] || 4),
      };
    }
    window.api.setSetting('widgetLayout', layout);
  }

  function loadLayout(saved) {
    if (!saved || !grid) return;
    for (const [type, pos] of Object.entries(saved)) {
      if (!instances[type]) continue;
      grid.update(instances[type].item, { x: pos.x, y: pos.y, w: pos.w, h: pos.h });
    }
  }

  // ── State handling ──
  function applyState(s) {
    const prev = state;
    state = s;

    const r = document.documentElement.style;
    r.setProperty('--accent', s.prefs.accent);
    r.setProperty('--wo', s.prefs.widgetOpacity);
    r.setProperty('--radius', s.prefs.widgetRadius + 'px');
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

    for (const type of Object.keys(s.widgets)) {
      const shouldBeOpen = !!s.open[type];
      const isOpen = !!instances[type];
      if (shouldBeOpen && !isOpen) mountWidget(type);
      else if (!shouldBeOpen && isOpen) unmountWidget(type);
      else if (shouldBeOpen && isOpen) instances[type].inst.setState(s);
    }

    if (!prev && s.widgetLayout) { loadLayout(s.widgetLayout); clampAllWidgets(); }

    // Apply widget gap from prefs — gridstack uses --gs-item-margin-* on the grid element
    if (typeof s.prefs.widgetGap === 'number') {
      const g = s.prefs.widgetGap + 'px';
      const gs = gridEl;
      gs.style.setProperty('--gs-item-margin-top', g);
      gs.style.setProperty('--gs-item-margin-right', g);
      gs.style.setProperty('--gs-item-margin-bottom', g);
      gs.style.setProperty('--gs-item-margin-left', g);
      if (grid) {
        grid.opts.margin = s.prefs.widgetGap;
        try { grid.margin(s.prefs.widgetGap); } catch {}
        // Re-apply after grid.margin() since it may overwrite
        gs.style.setProperty('--gs-item-margin-top', g);
        gs.style.setProperty('--gs-item-margin-right', g);
        gs.style.setProperty('--gs-item-margin-bottom', g);
        gs.style.setProperty('--gs-item-margin-left', g);
      }
    }

    document.body.classList.toggle('hidden', paused);
  }

  // ── Click-through: pass clicks to desktop unless over a widget ──
  function updateClickThrough() {
    if (dragging) return;
    window.api.setClickThrough(!overWidget);
  }

  // pointermove is forwarded even when setIgnoreMouseEvents(true, {forward:true})
  document.addEventListener('pointermove', (e) => {
    if (dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const onWidget = !!(el && el.closest && (el.closest('.grid-stack-item') || el.closest('.tour')));
    if (onWidget !== overWidget) {
      overWidget = onWidget;
      updateClickThrough();
    }
  }, { passive: true });

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && (e.target.closest('.grid-stack-item') || e.target.closest('.tour'))) {
      overWidget = true;
      window.api.setClickThrough(false);
    }
  }, { passive: true });

  // ── Auto-arrange: width-aware skyline packing, then align the whole block to the anchor ──
  function arrangeWidgets() {
    if (!grid || !state) return;
    const anchor = state.prefs.arrangeAnchor || 'top-right';
    const cols = grid.opts.column;
    const rows = gridRows();
    const isRight = anchor.endsWith('right');
    const isBottom = anchor.startsWith('bottom');
    const isCenter = anchor === 'center';

    const widgets = Object.entries(instances).map(([type, { item }]) => ({
      item,
      w: Math.max(1, Math.min(cols, parseInt(item.getAttribute('gs-w') || 1))),
      h: Math.max(1, parseInt(item.getAttribute('gs-h') || DEFAULT_H[type] || 4)),
    }));
    if (!widgets.length) return;

    // Tallest first so anchor columns are stable, widest first within equal heights
    widgets.sort((a, b) => b.h - a.h || b.w - a.w);

    // Place each widget on the lowest column band it fits (masonry, respects widths — no overlap)
    const colH = new Array(cols).fill(0);
    const placed = [];
    for (const w of widgets) {
      let fitX = -1, fitBase = Infinity, bestX = 0, bestBase = Infinity;
      for (let x = 0; x + w.w <= cols; x++) {
        let base = 0;
        for (let i = 0; i < w.w; i++) base = Math.max(base, colH[x + i]);
        if (base < bestBase) { bestBase = base; bestX = x; }
        if (base + w.h <= rows && base < fitBase) { fitBase = base; fitX = x; }
      }
      const x = fitX >= 0 ? fitX : bestX;
      const base = fitX >= 0 ? fitBase : bestBase;
      for (let i = 0; i < w.w; i++) colH[x + i] = base + w.h + 1;
      placed.push({ ...w, x, y: base });
    }

    // Align the packed block as a whole so anchors actually look anchored
    const minX = Math.min(...placed.map((p) => p.x));
    const maxRight = Math.max(...placed.map((p) => p.x + p.w));
    const minY = Math.min(...placed.map((p) => p.y));
    const maxBottom = Math.max(...placed.map((p) => p.y + p.h));
    let dx = 0, dy = 0;
    if (isCenter) dx = Math.floor((cols - (maxRight - minX)) / 2) - minX;
    else if (isRight) dx = cols - maxRight;
    else dx = -minX;
    if (isCenter) dy = Math.floor((rows - (maxBottom - minY)) / 2) - minY;
    else if (isBottom) dy = rows - maxBottom;
    else dy = -minY;

    for (const p of placed) {
      grid.update(p.item, {
        x: Math.max(0, Math.min(cols - p.w, p.x + dx)),
        y: Math.max(0, Math.min(rows - p.h, p.y + dy)),
      }, false);
    }

    // Final safety clamp
    clampAllWidgets();
    saveLayout();
  }

  // ── IPC wiring ──
  window.api.onState(applyState);
  window.api.getState().then(applyState).catch(() => {});

  window.api.onVis((v) => {
    paused = !v;
    document.body.classList.toggle('hidden', !v);
    for (const { inst } of Object.values(instances)) inst.setPaused(v);
  });

  window.api.onArrange(arrangeWidgets);

  window.api.onClip((list) => {
    if (instances.clipboard) instances.clipboard.inst.onClipEvent(list);
  });

  // ── Init ──
  initGrid();
})();
