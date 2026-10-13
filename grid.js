const { screen, BrowserWindow } = require('electron');

const GAP = 16;
const MARGIN_RIGHT = 24;
const MARGIN_TOP = 24;
const BASE_COL_WIDTH = 330;
const BASE_ROW_HEIGHT = 160;

function hit(a, b, pad = 6) {
  return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
}

// Overshoot-and-settle easing — gives widgets a springy, bubble-like bounce.
function springEase(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

module.exports = ({ prefs, wins, persist }) => {
  let overlayWin = null;
  const typeOf = (w) => Object.keys(wins()).find((t) => wins()[t] === w);
  const getScale = () => prefs().widgetScale || 1;
  const getGap = () => Math.round(GAP * getScale());

  function clampToScreen(r, d) {
    const wa = d.workArea;
    return {
      ...r,
      x: Math.max(wa.x + 8, Math.min(r.x, wa.x + wa.width - r.width - 8)),
      y: Math.max(wa.y + 8, Math.min(r.y, wa.y + wa.height - r.height - 8)),
    };
  }

  // Active widget bounds excluding a given window.
  function otherBounds(excludeW) {
    return Object.values(wins())
      .filter((w) => w !== excludeW && !w.isDestroyed() && w.isVisible())
      .map((w) => w.getBounds());
  }

  // Compute effective column width from the widest visible widget + grid setting.
  function effColW() {
    const s = getScale();
    const base = Math.round(BASE_COL_WIDTH * s);
    const widest = Math.max(0, ...Object.values(wins())
      .filter((w) => !w.isDestroyed() && w.isVisible())
      .map((w) => w.getBounds().width));
    return Math.max(base, widest);
  }

  // Column X positions for right/left anchored layout, given column width.
  function colX(idx, cw, d) {
    const wa = d.workArea;
    const anchor = prefs().arrangeAnchor || 'top-right';
    if (anchor === 'top-left' || anchor === 'bottom-left') {
      return wa.x + MARGIN_RIGHT + idx * (cw + getGap());
    }
    return wa.x + wa.width - (idx + 1) * cw - idx * getGap() - MARGIN_RIGHT;
  }

  // Snap a rect: X to nearest column (sized by actual widest widget),
  // Y flush against neighbours in that column with uniform gap.
  function snap(r, d, excludeW) {
    const wa = d.workArea;
    const cw = effColW();
    const gap = getGap();
    const anchor = prefs().arrangeAnchor || 'top-right';
    const isRight = anchor.includes('right');

    // Find nearest column based on this widget's ACTUAL width
    let bestCol = 0;
    let bestDist = Infinity;
    const maxCols = Math.ceil((wa.width - 48) / (cw + gap)) + 2;
    for (let c = 0; c <= maxCols; c++) {
      const x = colX(c, cw, d);
      if (x < wa.x - cw || x > wa.x + wa.width) continue;
      const dist = Math.abs(x - r.x);
      if (dist < bestDist) { bestDist = dist; bestCol = c; }
    }
    const targetX = colX(bestCol, cw, d);

    // Y: collect flush candidates from neighbours in this column's horizontal span
    const colL = targetX;
    const colR = targetX + r.width;
    const candidates = [wa.y + MARGIN_TOP];

    for (const ob of otherBounds(excludeW)) {
      if (ob.x < colR && ob.x + ob.width > colL) {
        candidates.push(ob.y + ob.height + gap);
        candidates.push(ob.y - gap - r.height);
      }
    }

    let targetY = wa.y + MARGIN_TOP;
    let bestY = Infinity;
    for (const y of candidates) {
      const dist = Math.abs(y - r.y);
      if (dist < bestY) { bestY = dist; targetY = y; }
    }

    return clampToScreen({ ...r, x: targetX, y: targetY }, d);
  }

  const place = (r, d, excludeW) => (prefs().snapToGrid ? snap(r, d, excludeW) : clampToScreen(r, d));

  // Spring animation with overshoot — widgets bounce into place like bubbles.
  function animateTo(w, to, ms = 340, delay = 0) {
    if (!w || w.isDestroyed()) return;
    clearInterval(w.__anim);
    clearTimeout(w.__animDelay);
    const b = w.getBounds();
    if (Math.abs(b.x - to.x) < 2 && Math.abs(b.y - to.y) < 2) { persist(w); return; }

    w.__animDelay = setTimeout(() => {
      if (w.isDestroyed()) return;
      const start = w.getBounds();
      const t0 = Date.now();
      w.__anim = setInterval(() => {
        if (w.isDestroyed()) { clearInterval(w.__anim); return; }
        const p = Math.min(1, (Date.now() - t0) / ms);
        const e = springEase(p);
        w.setPosition(
          Math.round(start.x + (to.x - start.x) * e),
          Math.round(start.y + (to.y - start.y) * e),
        );
        if (p >= 1) { clearInterval(w.__anim); w.__anim = null; persist(w); }
      }, 16);
    }, delay);
  }

  // Find nearest free position for a rect, pushing flush against occupied bounds.
  // direction: preferred push direction ('up','down','left','right') or null for nearest.
  function findFree(rect, d, occupied, direction) {
    const wa = d.workArea;
    const gap = getGap();
    const cw = effColW();
    const free = (r) => !occupied.some((o) => hit(r, o, 4));

    // Candidate generator: flush positions relative to each occupied rect + screen top
    const cands = [];
    const push = (x, y) => {
      const r = clampToScreen({ ...rect, x, y }, d);
      if (free(r)) cands.push(r);
    };

    // Same-column flush positions
    for (const ob of occupied) {
      push(rect.x, ob.y + ob.height + gap);
      push(rect.x, ob.y - gap - rect.height);
    }
    push(rect.x, wa.y + MARGIN_TOP);

    // Adjacent columns (both directions)
    for (let dc = -4; dc <= 4; dc++) {
      if (dc === 0) continue;
      const nx = rect.x + dc * (cw + gap);
      if (nx < wa.x - rect.width || nx > wa.x + wa.width) continue;
      push(nx, wa.y + MARGIN_TOP);
      for (const ob of occupied) {
        push(nx, ob.y + ob.height + gap);
        push(nx, ob.y - gap - rect.height);
      }
    }

    // Score: prefer direction match, then distance from original position
    cands.sort((a, b) => {
      let sa = 0, sb = 0;
      if (direction === 'down') { sa = a.y - rect.y; sb = b.y - rect.y; }
      else if (direction === 'up') { sa = rect.y - a.y; sb = rect.y - b.y; }
      else if (direction === 'right') { sa = a.x - rect.x; sb = b.x - rect.x; }
      else if (direction === 'left') { sa = rect.x - a.x; sb = rect.x - b.x; }
      else { sa = 0; sb = 0; }
      // Penalize going opposite to preferred direction
      if (direction === 'down' && a.y < rect.y) sa -= 10000;
      if (direction === 'down' && b.y < rect.y) sb -= 10000;
      if (direction === 'up' && a.y > rect.y) sa -= 10000;
      if (direction === 'up' && b.y > rect.y) sb -= 10000;
      if (direction === 'right' && a.x < rect.x) sa -= 10000;
      if (direction === 'right' && b.x < rect.x) sb -= 10000;
      if (direction === 'left' && a.x > rect.x) sa -= 10000;
      if (direction === 'left' && b.x > rect.x) sb -= 10000;
      // Closer is better as tiebreaker
      const da = Math.abs(a.y - rect.y) + Math.abs(a.x - rect.x);
      const db = Math.abs(b.y - rect.y) + Math.abs(b.x - rect.x);
      if (direction) return (sb - sb * 0) - (sa - sa * 0) || da - db;
      return da - db;
    });

    return cands[0] || null;
  }

  // Determine push direction: away from where the dropped widget came from.
  function pushDirection(droppedRect, otherRect) {
    const dcx = (droppedRect.x + droppedRect.width / 2) - (otherRect.x + otherRect.width / 2);
    const dcy = (droppedRect.y + droppedRect.height / 2) - (otherRect.y + otherRect.height / 2);
    if (Math.abs(dcy) >= Math.abs(dcx)) return dcy > 0 ? 'up' : 'down';
    return dcx > 0 ? 'left' : 'right';
  }

  // Pack all widgets into columns based on ACTUAL bounds, no overlaps.
  // dropped: optional { w, rect } — pin that widget at rect and flow others around it.
  function arrange(targetDisplay, dropped) {
    const d = targetDisplay || screen.getPrimaryDisplay();
    const wa = d.workArea;
    const gap = getGap();
    const anchor = prefs().arrangeAnchor || 'top-right';
    const isBottom = anchor.includes('bottom');
    const isCenter = anchor === 'center';

    const activeWins = Object.values(wins()).filter((w) => !w.isDestroyed() && w.isVisible());
    if (!activeWins.length) return;

    const cw = effColW();

    // If a widget was just dropped, separate it and let it hold its position
    let pinned = null;
    let flowWins = [...activeWins];
    if (dropped && !dropped.w.isDestroyed()) {
      pinned = dropped;
      flowWins = flowWins.filter((w) => w !== dropped.w);
    }

    // Sort remaining by height descending (tall widgets anchor columns)
    flowWins.sort((a, b) => b.getBounds().height - a.getBounds().height);

    const columns = []; // { x, cursorY }
    const getCol = (i) => {
      while (columns.length <= i) {
        columns.push({ x: colX(columns.length, cw, d), cursorY: wa.y + MARGIN_TOP });
      }
      return columns[i];
    };

    const placements = [];

    // Place pinned widget first — mark its column as occupied
    if (pinned) {
      const pr = pinned.rect;
      // Find which column it's in
      let pc = 0;
      let pdist = Infinity;
      for (let c = 0; c < 20; c++) {
        const x = colX(c, cw, d);
        const dist = Math.abs(x - pr.x);
        if (dist < pdist) { pdist = dist; pc = c; }
      }
      const col = getCol(pc);
      col.cursorY = Math.max(col.cursorY, pr.y + pr.height + gap);
      placements.push({ w: pinned.w, x: pr.x, y: pr.y, w2: pr.width, h2: pr.height });
    }

    // Flow remaining widgets into columns
    let curCol = 0;
    for (const w of flowWins) {
      const b = w.getBounds();
      let col = getCol(curCol);

      if (col.cursorY + b.height > wa.y + wa.height - 24 && col.cursorY > wa.y + MARGIN_TOP + 1) {
        curCol++;
        col = getCol(curCol);
      }

      let tx = col.x;
      let ty = col.cursorY;
      if (isBottom) {
        ty = wa.y + wa.height - b.height - (col.cursorY - wa.y);
      }
      placements.push({ w, x: tx, y: ty, w2: b.width, h2: b.height });
      col.cursorY = Math.max(col.cursorY, ty + b.height + gap);
    }

    // Center: shift block
    if (isCenter && columns.length > 0) {
      const totalW = columns.length * cw + (columns.length - 1) * gap;
      const offset = Math.round((wa.width - totalW) / 2);
      placements.forEach((p) => { p.x += offset; });
    }

    // Animate with staggered delays for a cascading bubble feel
    placements.forEach((p, i) => {
      animateTo(p.w, clampToScreen({ x: p.x, y: p.y, width: p.w2, height: p.h2 }, d), 340, i * 40);
    });
  }

  function repack() {
    arrange();
  }

  // Settle after drop: snap the dropped widget, then push overlapping ones away.
  function settle(w) {
    const t = typeOf(w);
    if (!t || w.isDestroyed()) return;
    const cur = w.getBounds();
    const d = screen.getDisplayMatching(cur);
    const r = place(cur, d, w);

    if (!prefs().gridCollisions) { animateTo(w, r); return; }

    // Animate dropped widget to its snapped position
    animateTo(w, r);

    const allWins = Object.entries(wins()).filter(([, x]) => !x.isDestroyed() && x.isVisible());

    // For each other widget that overlaps the dropped target, push it away
    for (const [k, ow] of allWins) {
      if (k === t) continue;
      const ob = ow.getBounds();
      if (!hit(r, ob, 6)) continue;

      const dir = pushDirection(r, ob);
      const occupied = allWins
        .filter(([k2, x2]) => k2 !== k)
        .map(([, x2]) => x2.getBounds())
        .concat([r]);
      const target = findFree(ob, d, occupied, dir);
      if (target) animateTo(ow, target, 300, 60);
    }

    // Chain resolution: if dropped widget still overlaps after pushes, nudge it
    setTimeout(() => {
      if (w.isDestroyed()) return;
      const actual = w.getBounds();
      const others = otherBounds(w);
      if (others.some((ob) => hit(actual, ob, 6))) {
        const target = findFree(actual, d, others, null);
        if (target) animateTo(w, target, 300);
      }
    }, 380);
  }

  function defaultRect(width, height, d) {
    const wa = d.workArea;
    const cw = effColW();
    const gap = getGap();
    const active = otherBounds(null);

    let curCol = 0;
    let curY = wa.y + MARGIN_TOP;
    for (;;) {
      const x = colX(curCol, cw, d);
      const cand = { x, y: curY, width, height };
      if (curY + height > wa.y + wa.height - 20) {
        curCol++;
        curY = wa.y + MARGIN_TOP;
        if (curCol > 8) return clampToScreen(cand, d);
        continue;
      }
      if (!active.some((b) => hit(cand, b, 6))) return cand;
      curY += height + gap;
    }
  }

  function showGridOverlay(d) {
    if (overlayWin || !prefs().snapToGrid) return;
    const wa = d.workArea;
    const s = getScale();
    const cw = effColW();
    const gap = getGap();
    const rowH = Math.round(BASE_ROW_HEIGHT * s);
    const anchor = prefs().arrangeAnchor || 'top-right';
    const isRight = anchor.includes('right');
    const originY = wa.y + MARGIN_TOP;

    overlayWin = new BrowserWindow({
      x: wa.x, y: wa.y, width: wa.width, height: wa.height,
      transparent: true, frame: false, hasShadow: false, resizable: false,
      skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
    });
    overlayWin.setIgnoreMouseEvents(true);

    let linesHtml = '';
    let dotsHtml = '';
    const maxCols = Math.ceil((wa.width - 48) / (cw + gap)) + 2;
    for (let c = 0; c <= maxCols; c++) {
      const x = colX(c, cw, d) - Math.round(gap / 2);
      if (x <= wa.x + 4 || x >= wa.x + wa.width - 4) continue;
      if (c > 0) linesHtml += `<div class="vl" style="left:${x}px"></div>`;
      const maxRows = Math.ceil((wa.height - MARGIN_TOP * 2) / (rowH + gap));
      for (let r = 0; r <= maxRows; r++) {
        const y = originY + r * (rowH + gap) - Math.round(gap / 2);
        if (y > wa.y + 4 && y < wa.y + wa.height - 4) {
          dotsHtml += `<div class="dot" style="left:${x}px;top:${y}px"></div>`;
        }
      }
    }
    const maxRows = Math.ceil((wa.height - MARGIN_TOP * 2) / (rowH + gap));
    for (let r = 1; r <= maxRows; r++) {
      const y = originY + r * (rowH + gap) - Math.round(gap / 2);
      if (y > wa.y + 4 && y < wa.y + wa.height - 4) {
        linesHtml += `<div class="hl" style="top:${y}px"></div>`;
      }
    }

    const html = `<!DOCTYPE html><html><head><style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { width: 100vw; height: 100vh; overflow: hidden; background: transparent; animation: fadeIn 0.25s ease-out; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      .vl { position: absolute; top: 0; bottom: 0; width: 1px; background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.06) 15%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.06) 85%, transparent 100%); }
      .hl { position: absolute; left: 0; right: 0; height: 1px; background: linear-gradient(to right, transparent 0%, rgba(255,255,255,0.06) 15%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.06) 85%, transparent 100%); }
      .dot { position: absolute; width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px; border-radius: 50%; background: rgba(255,255,255,0.15); }
    </style></head><body>${linesHtml}${dotsHtml}</body></html>`;

    overlayWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    overlayWin.once('ready-to-show', () => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.showInactive(); });
  }

  function hideGridOverlay() {
    if (!overlayWin || overlayWin.isDestroyed()) { overlayWin = null; return; }
    try {
      overlayWin.webContents.executeJavaScript('document.body.style.animation="fadeOut 0.2s ease-in forwards"').catch(() => {});
      setTimeout(() => {
        if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
        overlayWin = null;
      }, 200);
    } catch { overlayWin = null; }
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
    clearTimeout(w.__animDelay);
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
