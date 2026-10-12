const { screen, BrowserWindow } = require('electron');

const GAP = 16;
const MARGIN_RIGHT = 24;
const MARGIN_TOP = 24;

const BASE_COL_WIDTH = 330;
const BASE_ROW_HEIGHT = 160;

function hit(a, b, pad = 8) {
  return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
}

// Grid placement, drag handling and collision pushing for widget windows.
module.exports = ({ prefs, wins, persist }) => {
  let overlayWin = null;
  const typeOf = (w) => Object.keys(wins()).find((t) => wins()[t] === w);
  const getScale = () => prefs().widgetScale || 1;

  function clampToScreen(r, d) {
    const wa = d.workArea;
    return {
      ...r,
      x: Math.max(wa.x + 8, Math.min(r.x, wa.x + wa.width - r.width - 8)),
      y: Math.max(wa.y + 8, Math.min(r.y, wa.y + wa.height - r.height - 8)),
    };
  }

  function snap(r, d) {
    const wa = d.workArea;
    const s = getScale();
    const colW = Math.round(BASE_COL_WIDTH * s);
    const rowH = Math.round(BASE_ROW_HEIGHT * s);
    const gap = Math.round(GAP * s);

    const rightOffset = wa.x + wa.width - (r.x + r.width) - MARGIN_RIGHT;
    const col = Math.max(0, Math.round(rightOffset / (colW + gap)));
    const targetX = wa.x + wa.width - (col + 1) * colW - col * gap - MARGIN_RIGHT;

    const topOffset = r.y - (wa.y + MARGIN_TOP);
    const row = Math.max(0, Math.round(topOffset / (rowH + gap)));
    const targetY = wa.y + MARGIN_TOP + row * (rowH + gap);

    return clampToScreen({ ...r, x: targetX, y: targetY }, d);
  }

  const place = (r, d) => (prefs().snapToGrid ? snap(r, d) : clampToScreen(r, d));

  function animateTo(w, to, ms = 260) {
    if (!w || w.isDestroyed()) return;
    clearInterval(w.__anim);
    const b = w.getBounds();
    if (b.x === to.x && b.y === to.y) { persist(w); return; }
    const t0 = Date.now();
    w.__anim = setInterval(() => {
      if (w.isDestroyed()) { clearInterval(w.__anim); return; }
      const p = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - p) ** 4;
      w.setPosition(Math.round(b.x + (to.x - b.x) * e), Math.round(b.y + (to.y - b.y) * e));
      if (p >= 1) { clearInterval(w.__anim); w.__anim = null; persist(w); }
    }, 16);
  }

  // Packs widgets neatly into cohesive desktop columns anchored to the screen
  function arrange(targetDisplay) {
    const d = targetDisplay || screen.getPrimaryDisplay();
    const wa = d.workArea;
    const s = getScale();
    const colW = Math.round(BASE_COL_WIDTH * s);
    const gap = Math.round(GAP * s);
    const anchor = prefs().arrangeAnchor || 'top-right';

    // Sort widgets so larger, higher-priority widgets take primary grid spots
    const activeWins = Object.values(wins()).filter((w) => !w.isDestroyed() && w.isVisible());
    activeWins.sort((a, b) => (b.getBounds().width * b.getBounds().height) - (a.getBounds().width * a.getBounds().height));

    let curCol = 0;
    let curY = wa.y + MARGIN_TOP;

    for (const w of activeWins) {
      const b = w.getBounds();
      if (curY + b.height > wa.y + wa.height - 24 && curY > wa.y + MARGIN_TOP) {
        curCol++;
        curY = wa.y + MARGIN_TOP;
      }

      let targetX = wa.x + wa.width - (curCol + 1) * colW - curCol * gap - MARGIN_RIGHT;
      let targetY = curY;

      if (anchor === 'top-left') {
        targetX = wa.x + 24 + curCol * (colW + gap);
        targetY = curY;
      } else if (anchor === 'bottom-left') {
        targetX = wa.x + 24 + curCol * (colW + gap);
        targetY = wa.y + wa.height - (curY - wa.y) - b.height;
      } else if (anchor === 'bottom-right') {
        targetX = wa.x + wa.width - (curCol + 1) * colW - curCol * gap - MARGIN_RIGHT;
        targetY = wa.y + wa.height - (curY - wa.y) - b.height;
      } else if (anchor === 'center') {
        const totalW = (curCol + 1) * colW + curCol * gap;
        targetX = Math.round(wa.x + (wa.width - totalW) / 2 + curCol * (colW + gap));
        targetY = curY;
      }

      animateTo(w, clampToScreen({ x: targetX, y: targetY, width: b.width, height: b.height }, d), 320);
      curY += b.height + gap;
    }
  }

  function repack() {
    arrange();
  }

  // Snap a widget to the grid and swap or push overlapping widgets cleanly
  function settle(w) {
    const t = typeOf(w);
    if (!t || w.isDestroyed()) return;
    const cur = w.getBounds();
    const d = screen.getDisplayMatching(cur);
    const r = place(cur, d);

    if (!prefs().gridCollisions) { animateTo(w, r); return; }

    const otherWins = Object.entries(wins()).filter(([k, x]) => k !== t && !x.isDestroyed() && x.isVisible());
    animateTo(w, r);

    // Find any direct collisions
    for (const [, ow] of otherWins) {
      const ob = ow.getBounds();
      if (hit(r, ob, 6)) {
        // If dropped right over an existing widget, cleanly swap or push to next free slot
        const activeOccupied = otherWins.map(([, x]) => x.getBounds()).concat([r]);
        const freeTarget = findFree(ob, d, activeOccupied);
        if (freeTarget) {
          animateTo(ow, freeTarget, 240);
        }
      }
    }
  }

  function defaultRect(width, height, d) {
    const wa = d.workArea;
    const s = getScale();
    const colW = Math.round(BASE_COL_WIDTH * s);
    const gap = Math.round(GAP * s);

    let curCol = 0;
    let curY = wa.y + MARGIN_TOP;

    const activeBounds = Object.values(wins()).filter((w) => !w.isDestroyed() && w.isVisible()).map((w) => w.getBounds());

    for (;;) {
      const colX = wa.x + wa.width - (curCol + 1) * colW - curCol * gap - MARGIN_RIGHT;
      const candidate = { x: colX, y: curY, width, height };

      if (curY + height > wa.y + wa.height - 20) {
        curCol++;
        curY = wa.y + MARGIN_TOP;
        if (curCol > 6) return clampToScreen(candidate, d);
        continue;
      }

      const collides = activeBounds.some((b) => hit(candidate, b, 6));
      if (!collides) return candidate;

      curY += height + gap;
    }
  }

  function showGridOverlay(d) {
    if (overlayWin || !prefs().snapToGrid) return;
    const wa = d.workArea;
    const s = getScale();
    const colW = Math.round(BASE_COL_WIDTH * s);
    const rowH = Math.round(BASE_ROW_HEIGHT * s);
    const gap = Math.round(GAP * s);
    const radius = prefs().widgetRadius || 24;

    overlayWin = new BrowserWindow({
      x: wa.x, y: wa.y, width: wa.width, height: wa.height,
      transparent: true, frame: false, hasShadow: false, resizable: false,
      skipTaskbar: true, alwaysOnTop: false, focusable: false, show: false,
    });
    overlayWin.setIgnoreMouseEvents(true);

    // Check screen bounds
    const cols = Math.min(10, Math.floor((wa.width - 48) / (colW + gap)));
    const rows = Math.min(8, Math.floor((wa.height - 48) / (rowH + gap)));

    const originX = wa.x + 24;
    const originY = wa.y + 24;

    for (let c = 0; c < cols; c++) {
      const x = originX + c * (colW + gap);
      for (let r = 0; r < rows; r++) {
        const y = originY + r * (rowH + gap);
        slotsHtml += `<div class="slot" style="left:${x}px;top:${y}px;width:${colW}px;height:${rowH}px;border-radius:${radius}px"></div>`;
      }
    }

    const html = `<!DOCTYPE html><html><head><style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 100vw; height: 100vh; overflow: hidden; background: transparent;
        background-image:
          linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
        background-size: ${colW + gap}px ${rowH + gap}px;
        background-position: ${originX}px ${originY}px;
      }
      .slot {
        position: absolute;
        border: 1.5px dashed rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.015);
        box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.02);
        animation: fadeIn 0.15s ease-out;
      }
      @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
    </style></head><body>${slotsHtml}</body></html>`;

    overlayWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    overlayWin.once('ready-to-show', () => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.showInactive(); });
  }

  function hideGridOverlay() {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
    overlayWin = null;
  }

  let drag = null;
  function endDrag(drop) {
    if (!drag) return;
    clearInterval(drag.timer);
    clearTimeout(drag.guard);
    const w = drag.w;
    drag = null;
    hideGridOverlay();
    if (drop && !w.isDestroyed()) settle(w);
  }

  function startDrag(w) {
    endDrag(false);
    clearInterval(w.__anim);
    const c = screen.getCursorScreenPoint(), b = w.getBounds();
    const d = screen.getDisplayMatching(b);
    showGridOverlay(d);

    const data = { w, ox: c.x - b.x, oy: c.y - b.y, width: b.width, height: b.height };
    data.timer = setInterval(() => {
      if (w.isDestroyed()) { endDrag(false); return; }
      const p = screen.getCursorScreenPoint();
      w.setBounds({ x: p.x - data.ox, y: p.y - data.oy, width: data.width, height: data.height });
    }, 8);
    data.guard = setTimeout(() => endDrag(true), 30000);
    drag = data;
  }

  return { settle, animateTo, arrange, repack, defaultRect, startDrag, endDrag };
};
