const { screen } = require('electron');

const GAP = 4;
const hit = (a, b) => a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y;

// Grid placement, drag handling and collision pushing for widget windows.
module.exports = ({ prefs, wins, persist }) => {
  const unit = (d) => Math.max(16, Math.round(d.workArea.height / 36));
  const typeOf = (w) => Object.keys(wins()).find((t) => wins()[t] === w);

  const clampRect = (r, d) => {
    const wa = d.workArea, m = unit(d) / 2;
    return {
      ...r,
      x: Math.max(wa.x + m, Math.min(r.x, wa.x + wa.width - r.width - m)),
      y: Math.max(wa.y + m, Math.min(r.y, wa.y + wa.height - r.height - m)),
    };
  };

  const snap = (r, d) => {
    const u = unit(d), wa = d.workArea;
    return clampRect({ ...r, x: wa.x + u + Math.round((r.x - wa.x - u) / u) * u, y: wa.y + u + Math.round((r.y - wa.y - u) / u) * u }, d);
  };

  const place = (r, d) => (prefs().snapToGrid ? snap(r, d) : clampRect(r, d));

  function findFree(rect, d, occupied) {
    const u = unit(d), wa = d.workArea;
    const start = place(rect, d);
    const free = (r) => !occupied.some((o) => hit(r, o));
    if (free(start)) return start;
    for (let ring = 1; ring <= 80; ring++) {
      const cand = [];
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cand.push([dx, dy]);
      cand.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
      for (const [dx, dy] of cand) {
        const r = { ...start, x: start.x + dx * u, y: start.y + dy * u };
        if (r.x < wa.x || r.y < wa.y || r.x + r.width > wa.x + wa.width || r.y + r.height > wa.y + wa.height) continue;
        if (free(r)) return r;
      }
    }
    return null;
  }

  function animateTo(w, to, ms = 240) {
    if (!w || w.isDestroyed()) return;
    clearInterval(w.__anim);
    const b = w.getBounds();
    if (b.x === to.x && b.y === to.y) { persist(w); return; }
    const t0 = Date.now();
    w.__anim = setInterval(() => {
      if (w.isDestroyed()) { clearInterval(w.__anim); return; }
      const p = Math.min(1, (Date.now() - t0) / ms), e = 1 - (1 - p) ** 3;
      w.setPosition(Math.round(b.x + (to.x - b.x) * e), Math.round(b.y + (to.y - b.y) * e));
      if (p >= 1) { clearInterval(w.__anim); w.__anim = null; persist(w); }
    }, 16);
  }

  // Snap a widget to the grid and push any widgets it overlaps into the nearest free cells.
  function settle(w) {
    const t = typeOf(w);
    if (!t || w.isDestroyed()) return;
    const cur = w.getBounds();
    const d = screen.getDisplayMatching(cur);
    const r = place(cur, d);
    if (!prefs().gridCollisions) { animateTo(w, r); return; }
    const planned = {};
    for (const [k, x] of Object.entries(wins())) if (!x.isDestroyed()) planned[k] = x.getBounds();
    planned[t] = r;
    const displaced = Object.keys(planned).filter((k) => k !== t && hit(planned[k], r));
    animateTo(w, r);
    for (const k of displaced) {
      const occupied = Object.entries(planned).filter(([kk]) => kk !== k).map(([, v]) => v);
      const f = findFree(planned[k], d, occupied);
      if (f) { planned[k] = f; animateTo(wins()[k], f); }
    }
  }

  function defaultRect(width, height, d) {
    const wa = d.workArea, u = unit(d);
    const occupied = Object.values(wins()).filter((x) => !x.isDestroyed()).map((x) => x.getBounds());
    return findFree({ x: wa.x + wa.width - width - u, y: wa.y + u, width, height }, d, occupied) || { x: wa.x + u, y: wa.y + u };
  }

  function arrange() {
    const d = screen.getPrimaryDisplay(), wa = d.workArea, u = unit(d);
    const planned = [];
    for (const w of Object.values(wins())) {
      if (w.isDestroyed()) continue;
      const b = w.getBounds();
      const f = findFree({ ...b, x: wa.x + wa.width - b.width - u, y: wa.y + u }, d, planned);
      if (!f) continue;
      planned.push(f);
      animateTo(w, f, 320);
    }
  }

  let drag = null;
  function endDrag(drop) {
    if (!drag) return;
    clearInterval(drag.timer);
    clearTimeout(drag.guard);
    const w = drag.w;
    drag = null;
    if (drop && !w.isDestroyed()) settle(w);
  }
  function startDrag(w) {
    endDrag(false);
    clearInterval(w.__anim);
    const c = screen.getCursorScreenPoint(), b = w.getBounds();
    const d = { w, ox: c.x - b.x, oy: c.y - b.y, width: b.width, height: b.height };
    d.timer = setInterval(() => {
      if (w.isDestroyed()) { endDrag(false); return; }
      const p = screen.getCursorScreenPoint();
      w.setBounds({ x: p.x - d.ox, y: p.y - d.oy, width: d.width, height: d.height });
    }, 8);
    d.guard = setTimeout(() => endDrag(true), 30000);
    drag = d;
  }

  return { settle, animateTo, arrange, defaultRect, startDrag, endDrag };
};
