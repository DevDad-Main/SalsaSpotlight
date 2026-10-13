const { screen, BrowserWindow } = require('electron');

const GAP = 16;
const MARGIN_RIGHT = 24;
const MARGIN_TOP = 24;
const BASE_COL_WIDTH = 330;

function hit(a, b, pad = 6) {
  return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
}

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
  const getColW = () => Math.round(BASE_COL_WIDTH * getScale());

  function clampToScreen(r, d) {
    const wa = d.workArea;
    return {
      ...r,
      x: Math.max(wa.x + 8, Math.min(r.x, wa.x + wa.width - r.width - 8)),
      y: Math.max(wa.y + 8, Math.min(r.y, wa.y + wa.height - r.height - 8)),
    };
  }

  function otherBounds(excludeW) {
    return Object.values(wins())
      .filter((w) => w !== excludeW && !w.isDestroyed() && w.isVisible())
      .map((w) => w.getBounds());
  }

  function colX(idx, cw, d) {
    const wa = d.workArea;
    const anchor = prefs().arrangeAnchor || 'top-right';
    if (anchor === 'top-left' || anchor === 'bottom-left') {
      return wa.x + MARGIN_RIGHT + idx * (cw + getGap());
    }
    return wa.x + wa.width - (idx + 1) * cw - idx * getGap() - MARGIN_RIGHT;
  }

  // Snap X to nearest column, Y flush against column neighbours.
  function snap(r, d, excludeW) {
    const wa = d.workArea;
    const cw = getColW();
    const gap = getGap();

    let bestCol = 0, bestDist = Infinity;
    const maxCols = Math.ceil(wa.width / (cw + gap)) + 2;
    for (let c = 0; c <= maxCols; c++) {
      const x = colX(c, cw, d);
      if (x < wa.x - cw || x > wa.x + wa.width) continue;
      const dist = Math.abs(x - r.x);
      if (dist < bestDist) { bestDist = dist; bestCol = c; }
    }
    const targetX = colX(bestCol, cw, d);

    // Find vertical slots: top of screen, below each widget in this column
    const colL = targetX;
    const colR = targetX + cw;
    const cands = [wa.y + MARGIN_TOP];
    for (const ob of otherBounds(excludeW)) {
      if (ob.x < colR && ob.x + ob.width > colL) {
        cands.push(ob.y + ob.height + gap);
        cands.push(ob.y - gap - r.height);
      }
    }

    let targetY = wa.y + MARGIN_TOP, bestY = Infinity;
    for (const y of cands) {
      const yy = Math.round(y);
      const cand = { ...r, x: targetX, y: yy };
      if (otherBounds(excludeW).some((ob) => hit(cand, ob, 4))) continue;
      const dist = Math.abs(yy - r.y);
      if (dist < bestY) { bestY = dist; targetY = yy; }
    }

    return clampToScreen({ ...r, x: targetX, y: targetY }, d);
  }

  const place = (r, d, excludeW) => (prefs().snapToGrid ? snap(r, d, excludeW) : clampToScreen(r, d));

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

  // Find nearest free column-slot for a rect of uniform column width.
  function findFree(rect, d, occupied, direction) {
    const wa = d.workArea;
    const cw = getColW();
    const gap = getGap();
    const free = (r) => !occupied.some((o) => hit(r, o, 4));

    const maxCols = Math.ceil(wa.width / (cw + gap)) + 2;
    const cands = [];

    for (let c = 0; c <= maxCols; c++) {
      const x = colX(c, cw, d);
      if (x + cw < wa.x || x > wa.x + wa.width) continue;
      const tryY = (y) => {
        const r = clampToScreen({ ...rect, x, y: Math.round(y) }, d);
        if (free(r)) cands.push(r);
      };
      tryY(wa.y + MARGIN_TOP);
      for (const ob of occupied) {
        if (ob.x < x + cw && ob.x + ob.width > x) {
          tryY(ob.y + ob.height + gap);
          tryY(ob.y - gap - rect.height);
        }
      }
    }

    if (!cands.length) return null;
    cands.sort((a, b) => {
      const score = (r) => {
        let s = 0;
        if (direction === 'down') s += r.y - rect.y;
        else if (direction === 'up') s += rect.y - r.y;
        else if (direction === 'right') s += r.x - rect.x;
        else if (direction === 'left') s += rect.x - r.x;
        if (direction === 'down' && r.y < rect.y) s -= 10000;
        if (direction === 'up' && r.y > rect.y) s -= 10000;
        if (direction === 'right' && r.x < rect.x) s -= 10000;
        if (direction === 'left' && r.x > rect.x) s -= 10000;
        s -= Math.abs(r.y - rect.y) * 0.7 + Math.abs(r.x - rect.x) * 0.3;
        return s;
      };
      return score(b) - score(a);
    });
    return cands[0];
  }

  function pushDirection(droppedRect, otherRect) {
    const dcx = (droppedRect.x + droppedRect.width / 2) - (otherRect.x + otherRect.width / 2);
    const dcy = (droppedRect.y + droppedRect.height / 2) - (otherRect.y + otherRect.height / 2);
    if (Math.abs(dcy) >= Math.abs(dcx)) return dcy > 0 ? 'up' : 'down';
    return dcx > 0 ? 'left' : 'right';
  }

  // Pack widgets into columns. All same width → trivially aligned.
  function arrange(targetDisplay, dropped) {
    const d = targetDisplay || screen.getPrimaryDisplay();
    const wa = d.workArea;
    const gap = getGap();
    const cw = getColW();
    const anchor = prefs().arrangeAnchor || 'top-right';
    const isBottom = anchor.includes('bottom');
    const isCenter = anchor === 'center';

    const activeWins = Object.values(wins()).filter((w) => !w.isDestroyed() && w.isVisible());
    if (!activeWins.length) return;

    let pinned = null;
    let flowWins = [...activeWins];
    if (dropped && !dropped.w.isDestroyed()) {
      pinned = dropped;
      flowWins = flowWins.filter((w) => w !== dropped.w);
    }

    flowWins.sort((a, b) => b.getBounds().height - a.getBounds().height);

    const columns = [];
    const getCol = (i) => {
      while (columns.length <= i) {
        columns.push({ x: colX(columns.length, cw, d), cursorY: wa.y + MARGIN_TOP });
      }
      return columns[i];
    };

    const placements = [];

    if (pinned) {
      const pr = pinned.rect;
      let pc = 0, pdist = Infinity;
      for (let c = 0; c < 20; c++) {
        const dist = Math.abs(colX(c, cw, d) - pr.x);
        if (dist < pdist) { pdist = dist; pc = c; }
      }
      const col = getCol(pc);
      col.cursorY = Math.max(col.cursorY, pr.y + pr.height + gap);
      placements.push({ w: pinned.w, x: colX(pc, cw, d), y: pr.y });
    }

    let curCol = 0;
    for (const w of flowWins) {
      const b = w.getBounds();
      let col = getCol(curCol);
      if (col.cursorY + b.height > wa.y + wa.height - 24 && col.cursorY > wa.y + MARGIN_TOP + 1) {
        curCol++;
        col = getCol(curCol);
      }
      let ty = col.cursorY;
      if (isBottom) ty = wa.y + wa.height - b.height - (col.cursorY - wa.y);
      placements.push({ w, x: col.x, y: ty });
      col.cursorY = Math.max(col.cursorY, ty + b.height + gap);
    }

    if (isCenter && columns.length > 0) {
      const totalW = columns.length * cw + (columns.length - 1) * gap;
      const offset = Math.round((wa.width - totalW) / 2);
      placements.forEach((p) => { p.x += offset; });
    }

    placements.forEach((p, i) => {
      const w = p.w;
      const b = w.getBounds();
      animateTo(w, clampToScreen({ x: p.x, y: p.y, width: b.width, height: b.height }, d), 340, i * 40);
    });
  }

  function repack() { arrange(); }

  function settle(w) {
    const t = typeOf(w);
    if (!t || w.isDestroyed()) return;
    const cur = w.getBounds();
    const d = screen.getDisplayMatching(cur);
    const r = place(cur, d, w);

    animateTo(w, r);

    if (!prefs().gridCollisions) return;

    const allWins = Object.entries(wins()).filter(([, x]) => !x.isDestroyed() && x.isVisible());

    // Push overlapping widgets away from the dropped one
    const pushes = [];
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
      if (target) pushes.push({ ow, target });
    }
    pushes.forEach(({ ow, target }, i) => animateTo(ow, target, 300, 60 + i * 40));

    // Chain: after pushes settle, ensure no residual overlap
    setTimeout(() => {
      if (w.isDestroyed()) return;
      const others = otherBounds(w);
      if (others.some((ob) => hit(w.getBounds(), ob, 6))) {
        const target = findFree(w.getBounds(), d, others, null);
        if (target) animateTo(w, target, 300);
      }
    }, 400);
  }

  function defaultRect(width, height, d) {
    const wa = d.workArea;
    const cw = getColW();
    const gap = getGap();
    const active = otherBounds(null);

    let curCol = 0, curY = wa.y + MARGIN_TOP;
    for (;;) {
      const x = colX(curCol, cw, d);
      const cand = { x, y: curY, width, height };
      if (curY + height > wa.y + wa.height - 20) {
        curCol++; curY = wa.y + MARGIN_TOP;
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
    const cw = getColW();
    const gap = getGap();
    const rowH = Math.round(160 * s);
    const anchor = prefs().arrangeAnchor || 'top-right';
    const originY = wa.y + MARGIN_TOP;

    overlayWin = new BrowserWindow({
      x: wa.x, y: wa.y, width: wa.width, height: wa.height,
      transparent: true, frame: false, hasShadow: false, resizable: false,
      skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
    });
    overlayWin.setIgnoreMouseEvents(true);

    let linesHtml = '';
    let dotsHtml = '';
    const maxCols = Math.ceil(wa.width / (cw + gap)) + 2;
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
