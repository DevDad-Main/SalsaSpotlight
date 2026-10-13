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
  function initGrid() {
    const waW = window.screen.width;
    const waH = window.screen.height;
    const cols = Math.max(3, Math.min(8, Math.floor(waW / 400)));
    const cellH = Math.round(waH / 22);

    grid = GridStack.init({
      column: cols,
      cellHeight: cellH,
      margin: 12,
      float: true,
      animate: true,
      resizable: { handles: 'e, se, s, sw, w' },
      draggable: { handle: '.card', scroll: false },
      acceptWidgets: false,
      removable: false,
    }, gridEl);

    grid.on('change', () => saveLayout());
    grid.on('dragstart', () => { dragging = true; window.api.setClickThrough(false); });
    grid.on('dragstop', () => { dragging = false; saveLayout(); updateClickThrough(); });
    grid.on('resizestart', () => { dragging = true; window.api.setClickThrough(false); });
    grid.on('resizestop', (_e, el) => {
      dragging = false;
      updateClickThrough();
      const type = el.dataset.type;
      if (!type || !instances[type] || !state) return;
      instances[type].inst.mount(state.prefs.widgetOpts[type], state.prefs);
      saveLayout();
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
    grid.removeWidget(instances[type].item, true);
    delete instances[type];
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

    if (!prev && s.widgetLayout) loadLayout(s.widgetLayout);

    // Apply widget gap from prefs
    if (grid && typeof s.prefs.widgetGap === 'number') {
      grid.opts.margin = s.prefs.widgetGap;
      grid.margin(s.prefs.widgetGap);
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
    const onWidget = !!(el && el.closest && el.closest('.grid-stack-item'));
    if (onWidget !== overWidget) {
      overWidget = onWidget;
      updateClickThrough();
    }
  }, { passive: true });

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.grid-stack-item')) {
      overWidget = true;
      window.api.setClickThrough(false);
    }
  }, { passive: true });

  // ── Organic auto-arrange based on anchor ──
  function arrangeWidgets() {
    if (!grid || !state) return;
    const anchor = state.prefs.arrangeAnchor || 'top-right';
    const cols = grid.opts.column;
    const isRight = anchor.includes('right');
    const isBottom = anchor.includes('bottom');
    const isCenter = anchor === 'center';

    // Collect open widgets with their heights
    const widgets = Object.entries(instances).map(([type, { item }]) => ({
      type,
      item,
      h: parseInt(item.getAttribute('gs-h') || DEFAULT_H[type] || 4),
      w: parseInt(item.getAttribute('gs-w') || 1),
    }));

    // Sort by height descending — tall widgets anchor columns
    widgets.sort((a, b) => b.h - a.h);

    // Build columns: pack widgets into columns, trying to balance heights
    const columns = [];
    const getCol = (i) => {
      while (columns.length <= i) columns.push({ items: [], totalH: 0 });
      return columns[i];
    };

    // Greedy bin packing: place each widget in the shortest column
    for (const w of widgets) {
      // Find shortest column that has room
      let bestCol = 0;
      let bestHeight = Infinity;
      for (let c = 0; c < Math.min(cols, columns.length + 1); c++) {
        const col = getCol(c);
        if (col.totalH + w.h <= 20) { // max rows per column
          if (col.totalH < bestHeight) { bestHeight = col.totalH; bestCol = c; }
        }
      }
      // If no column has room, use shortest
      if (bestHeight === Infinity) {
        bestCol = columns.reduce((min, c, i) => c.totalH < columns[min].totalH ? i : min, 0);
      }
      const col = getCol(bestCol);
      col.items.push(w);
      col.totalH += w.h + 1;
    }

    // Assign positions based on anchor
    const usedCols = columns.filter((c) => c.items.length > 0).length;
    const startCol = isRight ? Math.max(0, cols - usedCols) : 0;

    let colIndex = startCol;
    for (const col of columns) {
      if (!col.items.length) { colIndex++; continue; }

      // Stack items vertically in this column
      let y = 0;
      const positions = [];
      for (const w of col.items) {
        positions.push({ item: w.item, y, h: w.h });
        y += w.h + 1;
      }

      // For bottom anchor, flip vertically
      if (isBottom) {
        const maxY = Math.max(...positions.map((p) => p.y + p.h));
        for (const p of positions) {
          p.y = maxY - p.y - p.h;
        }
      }

      // Apply positions
      for (const p of positions) {
        grid.update(p.item, { x: colIndex, y: p.y }, false);
      }
      colIndex++;
    }

    // Center: shift everything to center
    if (isCenter) {
      const items = Object.values(instances).map(({ item }) => item);
      if (items.length) {
        const minX = Math.min(...items.map((i) => parseInt(i.getAttribute('gs-x') || 0)));
        const maxX = Math.max(...items.map((i) => parseInt(i.getAttribute('gs-x') || 0) + parseInt(i.getAttribute('gs-w') || 1)));
        const blockW = maxX - minX;
        const offset = Math.floor((cols - blockW) / 2) - minX;
        if (offset !== 0) {
          for (const item of items) {
            const x = parseInt(item.getAttribute('gs-x') || 0);
            grid.update(item, { x: x + offset }, false);
          }
        }
      }
    }

    grid.compact();
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
