// Multi-instance widget factory — each call creates an isolated widget.
// Usage: const inst = createWidget('clock', contentEl, cardEl, api);
//        inst.mount(opts, prefs); inst.setState(s); inst.setPaused(bool); inst.destroy();

function createWidget(type, el, card, api) {
  let timers = [], tasks = [], paused = false, state = null, mountKey = '', mountSeq = 0;
  let onClip = () => {};

  const $ = (s, r = el) => r.querySelector(s);
  const $$ = (s, r = el) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const head = (t, extra = '') => `<div class="label"><i class="dot"></i>${t}${extra}</div>`;
  const gb = (b) => (b / 1024 ** 3).toFixed(b > 1e11 ? 0 : 1) + ' GB';
  const sparkSvg = '<svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none"><path class="sa"/><path class="sl"/></svg>';

  function lucide(name, cls = '', size = 18) {
    const I = {
      cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
      memory: '<path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>',
      gpu: '<rect width="20" height="12" x="2" y="6" rx="6"/><path d="M12 12h.01M17 12h.01M7 12h2M8 11v2"/>',
      monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
      laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
      user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      windows: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
      globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
      cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
      moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
      cloudSun: '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41"/><path d="M15.5 17a4.5 4.5 0 0 0-3.5-7.38 6 6 0 0 0-7.39 7.38 4.5 4.5 0 0 0 0 9h10.89a4.5 4.5 0 0 0 0-9Z"/>',
      cloudRain: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v6M8 14v6M12 16v6"/>',
      cloudSnow: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>',
      cloudLightning: '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973M13 12l-3 5h4l-3 5"/>',
      cloudFog: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 17H7M17 21H9"/>',
      battery: '<rect width="16" height="10" x="2" y="7" rx="2"/><line x1="22" x2="22" y1="11" y2="13"/>',
      wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/>',
      droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
      sunrise: '<path d="M12 2v6M4.93 10.93l1.41 1.41M20 17h2M2 17h2M17.66 12.34l1.41-1.41M16 17a4 4 0 0 0-8 0"/>',
      sunset: '<path d="M12 10V4M4.93 10.93l1.41 1.41M20 17h2M2 17h2M17.66 12.34l1.41-1.41M16 17a4 4 0 0 0-8 0"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>',
      quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1 0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1 0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>',
      calendar: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
      bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
      hardDrive: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
      activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
      zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      trendingUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
      thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
      barChart: '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
      music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      droplets: '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
      hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
      target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      coffee: '<path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
      play: '<polygon points="5 3 19 12 5 21 5 3"/>',
      pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
      rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
      piggyBank: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
      wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
      bookOpen: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
      listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
      palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
      volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
      music2: '<circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/>',
    };
    const body = I[name] || I.sparkles;
    return `<svg class="lucide lucide-${name} ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  function drawSpark(hist, max) {
    const sa = $('.sa', el);
    const sl = $('.sl', el);
    if (!sa || !sl) return;
    const pts = hist.map((v, i) => `${(i * 200) / (hist.length - 1)},${38 - (v / max) * 36}`).join('L');
    sl.setAttribute('d', 'M' + pts);
    sa.setAttribute('d', `M0,40L${pts}L200,40Z`);
  }

  const every = (fn, ms) => { fn(); tasks.push(fn); timers.push(setInterval(() => { if (!paused) fn(); }, ms)); };

  const CIRC = 2 * Math.PI * 38;
  const gauge = (id, cls, label, attr = '') => `<div class="g" ${attr}><svg viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="38"/><circle class="fg ${cls}" data-gid="${id}" cx="46" cy="46" r="38" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg><div class="v"><span data-gid="${id}v">0%</span><small>${label}</small></div></div>`;
  function setGauge(id, pct) {
    const c = $(`[data-gid="${id}"]`, el);
    if (!c) return;
    c.style.strokeDashoffset = CIRC * (1 - Math.min(pct, 100) / 100);
    c.classList.toggle('o', pct > 90);
    const v = $(`[data-gid="${id}v"]`, el);
    if (v) v.textContent = Math.round(pct) + '%';
  }

  const WX_ICON_NAME = (code, day = true) => {
    if (code === 0) return day ? 'sun' : 'moon';
    if (code <= 2) return day ? 'cloudSun' : 'cloud';
    if (code === 3) return 'cloud';
    if (code <= 48) return 'cloudFog';
    if (code <= 57) return 'cloudRain';
    if (code <= 67) return 'cloudRain';
    if (code <= 77) return 'cloudSnow';
    if (code <= 82) return 'cloudRain';
    if (code <= 86) return 'cloudSnow';
    return 'cloudLightning';
  };

  const WX = (code, day = true) => {
    const icon = lucide(WX_ICON_NAME(code, day), '', 44);
    if (code === 0) return [icon, 'Clear sky'];
    if (code <= 2) return [icon, 'Partly cloudy'];
    if (code === 3) return [icon, 'Overcast'];
    if (code <= 48) return [icon, 'Fog'];
    if (code <= 57) return [icon, 'Drizzle'];
    if (code <= 67) return [icon, 'Rain'];
    if (code <= 77) return [icon, 'Snow'];
    if (code <= 82) return [icon, 'Showers'];
    if (code <= 86) return [icon, 'Snow showers'];
    return [icon, 'Thunderstorm'];
  };

  const QUOTES = [
    ['The secret of getting ahead is getting started.', 'Mark Twain'], ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
    ['Well done is better than well said.', 'Benjamin Franklin'], ['Make it work, make it right, make it fast.', 'Kent Beck'],
    ['What we think, we become.', 'Buddha'], ['Stay hungry, stay foolish.', 'Steve Jobs'], ['Fortune favours the bold.', 'Virgil'],
    ['Done is better than perfect.', 'Sheryl Sandberg'], ['The best way out is always through.', 'Robert Frost'],
    ['Small steps every day.', 'Unknown'], ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
    ['It always seems impossible until it is done.', 'Nelson Mandela'], ['Quality is not an act, it is a habit.', 'Aristotle'],
    ['Dream big, start small.', 'Unknown'],
  ];

  const W = {
    clock(o) {
      const h12 = (H) => H % 12 || 12;
      if (o.analog) {
        let ticks = '';
        for (let i = 0; i < 60; i++) ticks += `<line y1="-${i % 5 ? 44 : 41}" y2="-47" class="tk${i % 5 ? '' : ' big'}" transform="rotate(${i * 6})"/>`;
        el.innerHTML = `${head('Clock')}<div class="analog"><svg viewBox="-50 -50 100 100">${ticks}<line data-k="hh" class="hand h" y2="-24"/><line data-k="mh" class="hand m" y2="-34"/><line data-k="sh" class="hand s" y2="-38"/><circle r="2.5" class="pin"/></svg><div><div class="bigday grad" data-k="dd"></div><div class="date" data-k="dm"></div></div></div>`;
        if (!o.seconds) { const sh = $('[data-k="sh"]', el); if (sh) sh.style.display = 'none'; }
        every(() => {
          const n = new Date(), s = n.getSeconds(), m = n.getMinutes();
          const hh = $('[data-k="hh"]', el); if (hh) hh.style.transform = `rotate(${(n.getHours() % 12 + m / 60) * 30}deg)`;
          const mh = $('[data-k="mh"]', el); if (mh) mh.style.transform = `rotate(${(m + s / 60) * 6}deg)`;
          const sh = $('[data-k="sh"]', el); if (sh) sh.style.transform = `rotate(${s * 6}deg)`;
          const dd = $('[data-k="dd"]', el); if (dd) dd.textContent = n.toLocaleDateString([], { weekday: 'long' });
          const dm = $('[data-k="dm"]', el); if (dm) dm.textContent = n.toLocaleDateString([], { month: 'long', day: 'numeric' });
        }, 1000);
        return;
      }
      el.innerHTML = `${head('Local time')}<div class="time grad"><span data-k="hm"></span><small data-k="sc"></small></div><div class="date" data-k="d"></div><div class="bar"><i data-k="sb"></i></div>`;
      every(() => {
        const n = new Date(), H = n.getHours();
        const hm = $('[data-k="hm"]', el); if (hm) hm.textContent = `${o.h24 ? pad(H) : h12(H)}:${pad(n.getMinutes())}`;
        const sc = $('[data-k="sc"]', el); if (sc) sc.textContent = (o.seconds ? `:${pad(n.getSeconds())}` : '') + (o.h24 ? '' : (o.seconds ? ' ' : '') + (H < 12 ? 'AM' : 'PM'));
        const d = $('[data-k="d"]', el); if (d) d.textContent = n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
        const sb = $('[data-k="sb"]', el); if (sb) sb.style.width = (o.seconds ? (n.getSeconds() + 1) / 60 : (n.getMinutes() * 60 + n.getSeconds()) / 3600) * 100 + '%';
      }, 1000);
    },

    worldclock(o) {
      const rawZones = String(o.zones || 'America/New_York,Europe/London,Asia/Tokyo');
      const zones = rawZones.split(',').map((z) => z.trim()).filter(Boolean).slice(0, 4);
      el.innerHTML = `${head('World Clock')}<div class="analog-clocks" data-k="ac"></div>`;
      const box = $('[data-k="ac"]', el);
      every(() => {
        const now = new Date();
        box.replaceChildren();
        zones.forEach((z) => {
          const item = document.createElement('div');
          item.className = 'ac-item';
          try {
            const fTime = (opt) => new Intl.DateTimeFormat([], { timeZone: z, ...opt });
            const parts = fTime({ hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(now);
            const getP = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
            const H = getP('hour') % 12;
            const M = getP('minute');
            const S = getP('second');
            const hDeg = (H + M / 60) * 30;
            const mDeg = (M + S / 60) * 6;
            const sDeg = S * 6;
            const cityName = z.split('/').pop().replace(/_/g, ' ');
            const localOffset = -now.getTimezoneOffset();
            const targetStr = fTime({ timeZoneName: 'shortOffset' }).format(now);
            const match = targetStr.match(/GMT([+-]\d+)?/i);
            const targetOffsetHours = match && match[1] ? parseInt(match[1], 10) : 0;
            const diffHours = targetOffsetHours - Math.round(localOffset / 60);
            const diffStr = diffHours === 0 ? 'Same time' : (diffHours > 0 ? `+${diffHours}HRS` : `${diffHours}HRS`);
            item.innerHTML = `
              <svg class="ac-dial" viewBox="-50 -50 100 100">
                <circle r="46" class="ac-face"/>
                <line y1="-38" y2="-43" class="ac-tick major" transform="rotate(0)"/>
                <line y1="-38" y2="-43" class="ac-tick major" transform="rotate(90)"/>
                <line y1="-38" y2="-43" class="ac-tick major" transform="rotate(180)"/>
                <line y1="-38" y2="-43" class="ac-tick major" transform="rotate(270)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(30)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(60)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(120)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(150)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(210)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(240)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(300)"/>
                <line y1="-40" y2="-43" class="ac-tick" transform="rotate(330)"/>
                <line class="ac-hand hour" y2="-22" transform="rotate(${hDeg})"/>
                <line class="ac-hand min" y2="-32" transform="rotate(${mDeg})"/>
                <line class="ac-hand sec" y2="-36" transform="rotate(${sDeg})"/>
                <circle r="2" class="ac-pin"/>
              </svg>
              <div class="ac-info">
                <b>${esc(cityName)}</b>
                <small>${esc(diffStr)}</small>
              </div>
            `;
          } catch {
            item.innerHTML = `<div class="ac-info"><b>${esc(z)}</b><small>Invalid zone</small></div>`;
          }
          box.append(item);
        });
      }, 1000);
    },

    async weather(o) {
      el.innerHTML = `${head('Weather')}<div class="wx"><div class="wmsg">Loading...</div></div>`;
      const tk = mountSeq;
      every(async () => {
        const d = await api.weather(o.city, o.units);
        if (tk !== mountSeq) return;
        const box = $('.wx', el);
        if (!box) return;
        if (d.error) { box.innerHTML = '<div class="wmsg"></div>'; const w = $('.wmsg', box); if (w) w.textContent = `${d.error} - set a city in Settings`; return; }
        const [icon, text] = WX(d.code, d.isDay);
        const c = d.code;
        card.dataset.sky = c >= 95 ? 'storm' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) ? 'rain' : c === 3 || (c >= 45 && c <= 48) ? 'cloud' : d.isDay ? 'day' : 'night';
        const hours = (d.hours || []).slice(0, 5).map((h) => `<div class="hour">${esc(h.h.slice(0, 2))}<span>${lucide(WX_ICON_NAME(h.code, true), '', 16)}</span><b>${Math.round(h.t)}°</b></div>`).join('');
        box.innerHTML = `<div class="wcity">${esc(d.city)}, ${esc(d.country || '')} <span class="muted">- ${esc(text)}</span></div><div class="wmain"><div class="wicon">${icon}</div><div class="wtemp grad">${Math.round(d.temp)}${esc(d.unit)}</div></div>`
          + `<div class="wmeta"><span>Feels ${Math.round(d.feels)}°</span><span>H ${Math.round(d.hi)}° L ${Math.round(d.lo)}°</span><span>${lucide('droplet', '', 13)} ${d.humidity}%</span><span>${lucide('wind', '', 13)} ${Math.round(d.wind)} ${esc(d.windUnit)}</span></div>`
          + `<div class="wmeta"><span>${lucide('sunrise', '', 13)} ${esc(d.sunrise)}</span><span>${lucide('sunset', '', 13)} ${esc(d.sunset)}</span></div><div class="hours">${hours}</div>`;
      }, 15 * 60 * 1000);
    },

    system(o) {
      const row = (id, iconSvg, label, hidden) => `<div class="row" data-k="r${id}"${hidden ? ' hidden' : ''}><span class="ri">${iconSvg}</span><div><small>${label}</small><b data-k="i${id}">...</b></div></div>`;
      el.innerHTML = `${head('System')}<div class="gauges">${gauge('c', 'a', 'CPU')}${gauge('m', 'g', 'RAM')}${o.gpu ? gauge('u', 'p', 'GPU', 'data-k="gw" hidden') : ''}</div>`
        + (o.graph ? sparkSvg : '')
        + (o.info ? `<div class="rows">${row(1, lucide('cpu', 'ri-svg', 16), 'Processor')}${row(2, lucide('memory', 'ri-svg', 16), 'Memory')}${o.gpu ? row(3, lucide('gpu', 'ri-svg', 16), 'Graphics', true) : ''}</div>` : '')
        + '<div class="foot" data-k="f"></div>';
      const tk = mountSeq;
      if (o.info) {
        api.specs().then((sp) => { if (tk === mountSeq) { const e = $('[data-k="i1"]', el); if (e) e.textContent = `${sp.cpu} (${sp.cores})`; } }).catch(() => {});
        api.specsGpu().then((h) => { if (tk === mountSeq && h && h.cpu) { const e = $('[data-k="i1"]', el); if (e) e.textContent = `${h.cpu} (${h.cores})`; } }).catch(() => {});
      }
      const hist = Array(40).fill(0);
      const tick = async () => {
        if (tk !== mountSeq || !$('[data-k="c"]', el) && !$('.g', el)) return;
        try {
          const s = await api.stats();
          if (!s) return;
          setGauge('c', s.cpu || 0);
          setGauge('m', s.mem || 0);
          if (o.graph) { hist.push(s.cpu || 0); hist.shift(); drawSpark(hist, 100); }
          if (o.info && s.memUsed != null && s.memTotal != null) {
            const e = $('[data-k="i2"]', el); if (e) e.textContent = `${s.memUsed.toFixed(1)} / ${s.memTotal.toFixed(1)} GB (${(s.memTotal - s.memUsed).toFixed(1)} free)`;
          }
          if (o.gpu) {
            try {
              const g = await api.gpuStats();
              if (g && tk === mountSeq) {
                const gw = $('[data-k="gw"]', el); if (gw) gw.hidden = false;
                setGauge('u', g.util ?? 0);
                if (o.info) {
                  const r3 = $('[data-k="r3"]', el); if (r3) r3.hidden = false;
                  const vr = g.memUsed != null && g.memTotal ? ` | ${(g.memUsed / 1024).toFixed(1)}/${(g.memTotal / 1024).toFixed(0)} GB` : '';
                  const i3 = $('[data-k="i3"]', el); if (i3) i3.textContent = `${g.name || 'GPU'}${vr}${g.temp != null ? ` | ${g.temp}°C` : ''}`;
                }
              }
            } catch { /* optional gpu */ }
          }
          let batt = '';
          if (o.battery) {
            try {
              const b = await navigator.getBattery();
              if (b.level < 1 || !b.charging) batt = ` | ${lucide('battery', 'ri-svg', 13)} ${Math.round(b.level * 100)}%${b.charging ? ' charging' : ''}`;
            } catch { /* no battery */ }
          }
          const f = $('[data-k="f"]', el); if (f) f.innerHTML = `${lucide('clock', 'ri-svg', 12)} Up ${Math.floor((s.uptime || 0) / 3600)}h ${Math.floor(((s.uptime || 0) / 60)) % 60}m${batt}`;
        } catch { /* ignore tick errors */ }
      };
      tick();
      every(tick, 1500);
    },

    async specs(o) {
      const tk = mountSeq;
      el.innerHTML = `${head('PC Specs')}<div class="rows"><div class="wmsg">Reading hardware...</div></div>`;
      let base;
      try { base = await api.specs(); } catch { base = null; }
      if (tk !== mountSeq) return;
      if (!base) { const r = $('.rows', el); if (r) r.innerHTML = '<div class="wmsg">Could not read hardware info</div>'; return; }
      const draw = (s) => {
        if (tk !== mountSeq) return;
        const up = `${Math.floor(s.uptime / 86400)}d ${Math.floor(s.uptime / 3600) % 24}h ${Math.floor(s.uptime / 60) % 60}m`;
        const gpuText = s.gpu === undefined ? 'Detecting...' : (s.gpu.join(' + ') || 'Unknown') + (s.vram ? ` (${s.vram})` : '');
        const rows = [
          ['rig', 'GeForce NOW rig', lucide('cloud', 'ri-svg', 16), s.rig ? `${s.rig.rig} - ${s.rig.tier}` : s.gfn ? 'GeForce NOW session' : null],
          ['host', 'Device', lucide('laptop', 'ri-svg', 16), s.host],
          ['user', 'User', lucide('user', 'ri-svg', 16), s.user],
          ['os', 'Windows', lucide('windows', 'ri-svg', 16), s.os],
          ['cpu', 'Processor', lucide('cpu', 'ri-svg', 16), `${s.cpu} (${s.cores})`],
          ['gpu', 'Graphics', lucide('gpu', 'ri-svg', 16), gpuText],
          ['ram', 'Memory', lucide('memory', 'ri-svg', 16), s.ramLabel ? `${s.ramLabel} allocated` : gb(s.ram) + ' installed'],
          ['screen', 'Display', lucide('monitor', 'ri-svg', 16), s.screens.join(' + ')],
          ['ip', 'Network', lucide('globe', 'ri-svg', 16), s.ip || 'Offline'],
          ['uptime', 'Uptime', lucide('clock', 'ri-svg', 16), up],
        ].filter((r) => o[r[0]] && r[3]);
        const box = $('.rows', el);
        if (!box) return;
        box.replaceChildren();
        rows.forEach(([, label, iconSvg, value], i) => {
          const r = document.createElement('div');
          r.className = 'row';
          r.style.animationDelay = i * 35 + 'ms';
          r.innerHTML = `<span class="ri">${iconSvg}</span><div><small>${label}</small><b></b></div>`;
          $('b', r).textContent = value;
          r.title = value;
          box.append(r);
        });
      };
      draw(base);
      api.specsGpu().then((hw) => draw({ ...base, ...Object.fromEntries(Object.entries(hw).filter(([, v]) => v != null)) })).catch(() => {});
    },

    disks() {
      el.innerHTML = `${head('Storage')}<div class="dl"></div>`;
      every(async () => {
        const list = await api.disks();
        const box = $('.dl', el);
        if (!box) return;
        box.replaceChildren();
        list.slice(0, 5).forEach((d) => {
          const used = ((d.total - d.free) / d.total) * 100;
          const n = document.createElement('div');
          n.className = 'disk';
          n.innerHTML = `<div class="top"><b style="display:flex;align-items:center;gap:6px">${lucide('hardDrive', '', 14)} ${esc(d.name)}</b><span class="muted">${gb(d.free)} free of ${gb(d.total)}</span></div><div class="track"><div class="fill${used > 88 ? ' warn' : ''}"></div></div>`;
          box.append(n);
          requestAnimationFrame(() => requestAnimationFrame(() => { const f = $('.fill', n); if (f) f.style.width = used + '%'; }));
        });
      }, 60000);
    },

    gpu() {
      el.innerHTML = `${head('GPU')}<div class="gpu">${gauge('u', 'p', 'GPU')}<div class="gst" data-k="gs"></div></div>`
        + '<div class="vr"><div class="top"><span class="muted">VRAM</span><span data-k="vt"></span></div><div class="track"><div class="fill" data-k="vf"></div></div></div><div class="foot" data-k="gn"></div>';
      const tk = mountSeq;
      every(async () => {
        const g = await api.gpuStats();
        if (tk !== mountSeq || !$('.g', el)) return;
        if (!g) { const gn = $('[data-k="gn"]', el); if (gn) gn.textContent = 'No NVIDIA GPU detected'; return; }
        setGauge('u', g.util ?? 0);
        const dash = (v, unit) => (v == null ? '-' : `${Math.round(v)}${unit}`);
        const gs = $('[data-k="gs"]', el);
        if (gs) gs.innerHTML = [['Temperature', dash(g.temp, '°C')], ['Power', dash(g.power, ' W')], ['Clock', dash(g.clock, ' MHz')]]
          .map(([l, v]) => `<div class="st"><small>${l}</small><b>${esc(v)}</b></div>`).join('');
        if (g.memTotal) {
          const vt = $('[data-k="vt"]', el); if (vt) vt.textContent = `${(g.memUsed / 1024).toFixed(1)} / ${(g.memTotal / 1024).toFixed(0)} GB`;
          const vf = $('[data-k="vf"]', el); if (vf) vf.style.width = (g.memUsed / g.memTotal) * 100 + '%';
        }
        const gn = $('[data-k="gn"]', el); if (gn) gn.textContent = g.name;
      }, 1500);
    },

    network() {
      el.innerHTML = `${head('Network')}<div class="net"><div><small>Download</small><b data-k="nd">0 KB/s</b></div><div><small>Upload</small><b data-k="nu">0 KB/s</b></div></div>${sparkSvg}<div class="foot" data-k="f"></div>`;
      const tk = mountSeq;
      const fmt = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${Math.round(b / 1e3)} KB/s`);
      const hist = Array(40).fill(0);
      let ip = '';
      api.specs().then((s) => { ip = s.ip || ''; }).catch(() => {});
      every(async () => {
        const n = await api.net();
        if (tk !== mountSeq || !$('[data-k="nd"]', el)) return;
        if (!n) { const f = $('[data-k="f"]', el); if (f) f.textContent = 'Network stats unavailable'; return; }
        hist.push(n.down); hist.shift();
        drawSpark(hist, Math.max(1e5, ...hist));
        const nd = $('[data-k="nd"]', el); if (nd) nd.textContent = fmt(n.down);
        const nu = $('[data-k="nu"]', el); if (nu) nu.textContent = fmt(n.up);
        const f = $('[data-k="f"]', el); if (f) f.textContent = `${n.iface}${ip ? ` | ${ip}` : ''}`;
      }, 2000);
    },

    countdown(o) {
      const target = new Date(`${o.date}T00:00:00`);
      el.innerHTML = `${head('Countdown')}<div class="cd"><div class="cdn" data-k="cn"></div><div class="cdl" data-k="cl"></div></div><div class="foot" data-k="cs"></div>`;
      every(() => {
        const cn = $('[data-k="cn"]', el);
        if (!cn) return;
        if (Number.isNaN(target.getTime())) { cn.textContent = '?'; const cl = $('[data-k="cl"]', el); if (cl) cl.textContent = 'Set a date (YYYY-MM-DD) in Settings'; return; }
        const diff = target - new Date();
        const days = Math.ceil(diff / 864e5);
        cn.innerHTML = days === 0 ? lucide('sparkles', '', 48) : String(Math.abs(days));
        const cl = $('[data-k="cl"]', el); if (cl) cl.textContent = days === 0 ? `Today: ${o.title}` : days > 0 ? `day${days === 1 ? '' : 's'} until ${o.title}` : `day${days === -1 ? '' : 's'} since ${o.title}`;
        const cs = $('[data-k="cs"]', el); if (cs) cs.textContent = diff > 0 ? `${Math.floor(diff / 36e5) % 24}h ${Math.floor(diff / 6e4) % 60}m to go today` : '';
      }, 30000);
    },

    quote() {
      const [text, who] = QUOTES[Math.floor(Date.now() / 864e5) % QUOTES.length];
      el.innerHTML = `${head('Quote of the day')}<div class="qt"></div><div class="qa muted"></div>`;
      $('.qt', el).textContent = `\u201C${text}\u201D`;
      $('.qa', el).textContent = `- ${who}`;
    },

    calendar(o) {
      const now = new Date();
      let y = now.getFullYear(), m = now.getMonth();
      el.innerHTML = `${head('Calendar')}<div class="cal-head"><button data-k="pv">&lsaquo;</button><span data-k="mn"></span><button data-k="nx">&rsaquo;</button></div><div class="grid" data-k="gr"></div>`;
      const draw = () => {
        const mn = $('[data-k="mn"]', el); if (mn) mn.textContent = new Date(y, m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
        const gr = $('[data-k="gr"]', el);
        if (!gr) return;
        gr.replaceChildren();
        const names = o.mondayFirst ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        names.forEach((n) => { const c = document.createElement('div'); c.className = 'dn'; c.textContent = n; gr.append(c); });
        const first = new Date(y, m, 1).getDay();
        const lead = o.mondayFirst ? (first + 6) % 7 : first;
        const start = new Date(y, m, 1 - lead);
        for (let i = 0; i < 42; i++) {
          const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          const c = document.createElement('div');
          c.className = 'd' + (d.getMonth() !== m ? ' o' : '') + (d.toDateString() === now.toDateString() ? ' t' : '');
          c.textContent = d.getDate();
          gr.append(c);
        }
      };
      const go = (dm) => { m += dm; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); };
      const pv = $('[data-k="pv"]', el); if (pv) pv.onclick = () => go(-1);
      const nx = $('[data-k="nx"]', el); if (nx) nx.onclick = () => go(1);
      const mn = $('[data-k="mn"]', el); if (mn) mn.onclick = () => { y = now.getFullYear(); m = now.getMonth(); draw(); };
      draw();
    },

    async progress() {
      const tk = mountSeq;
      let user = 'there';
      try { user = (await api.specs()).user; } catch { /* keep default */ }
      if (tk !== mountSeq) return;
      el.innerHTML = `${head('Progress')}<div class="hello grad" data-k="hi"></div><div data-k="pl"></div>`;
      const draw = () => {
        const n = new Date(), H = n.getHours();
        const hi = $('[data-k="hi"]', el); if (hi) hi.textContent = `Good ${H < 5 ? 'night' : H < 12 ? 'morning' : H < 18 ? 'afternoon' : 'evening'}, ${user}`;
        const day = (n - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5;
        const wd = ((n.getDay() + 6) % 7 + day) / 7;
        const dim = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
        const mo = (n.getDate() - 1 + day) / dim;
        const ys = new Date(n.getFullYear(), 0, 1), ye = new Date(n.getFullYear() + 1, 0, 1);
        const yr = (n - ys) / (ye - ys);
        const bars = [['Today', day, `${Math.round((1 - day) * 24)}h left`], ['This week', wd, `${Math.ceil((1 - wd) * 7)} days left`],
          ['This month', mo, `${dim - n.getDate()} days left`], [String(n.getFullYear()), yr, `${Math.ceil((ye - n) / 864e5)} days left`]];
        const box = $('[data-k="pl"]', el);
        if (!box) return;
        if (!box.children.length) bars.forEach(() => { const d = document.createElement('div'); d.className = 'pr'; d.innerHTML = '<div class="top"><span></span><span></span></div><div class="track"><div class="fill"></div></div>'; box.append(d); });
        bars.forEach(([l, v, t], i) => {
          const d = box.children[i];
          if (!d) return;
          d.children[0].children[0].textContent = l;
          d.children[0].children[1].textContent = `${Math.round(v * 100)}% - ${t}`;
          setTimeout(() => { const f = d.querySelector('.fill'); if (f) f.style.width = v * 100 + '%'; }, 60 + i * 90);
        });
      };
      every(draw, 60000);
    },

    timer() {
      let total = 25 * 60, left = total, end = 0, run = false;
      el.innerHTML = `${head('Timer')}<div class="ringwrap" data-k="rw"><svg viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="38"/><circle class="fg" data-k="rg" cx="46" cy="46" r="38" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg><div class="tm" data-k="tm"></div></div>`
        + '<div class="btns" data-k="pre"><button data-m="5">5m</button><button data-m="10">10m</button><button data-m="25">25m</button><button data-m="45">45m</button></div>'
        + '<div class="btns"><button class="main" data-k="go">Start</button><button data-k="rs">Reset</button></div>';
      const draw = () => {
        const tm = $('[data-k="tm"]', el); if (tm) tm.textContent = `${pad(Math.floor(left / 60))}:${pad(Math.ceil(left) % 60)}`;
        const rg = $('[data-k="rg"]', el); if (rg) rg.style.strokeDashoffset = CIRC * (1 - left / total);
        const go = $('[data-k="go"]', el); if (go) go.textContent = run ? 'Pause' : 'Start';
      };
      const beep = () => {
        try {
          const ac = new AudioContext();
          [0, 0.3, 0.6].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.15, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.25); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.26); });
        } catch { /* audio unavailable */ }
      };
      timers.push(setInterval(() => {
        if (!run) return;
        left = Math.max(0, (end - Date.now()) / 1000);
        if (left <= 0) {
          run = false; left = 0; beep();
          new Notification('Timer finished', { body: 'Your timer has run out.' });
          const rw = $('[data-k="rw"]', el); if (rw) { rw.classList.add('done'); setTimeout(() => rw.classList.remove('done'), 2200); }
        }
        draw();
      }, 200));
      const go = $('[data-k="go"]', el); if (go) go.onclick = () => { if (!run && left <= 0) left = total; run = !run; end = Date.now() + left * 1000; draw(); };
      const rs = $('[data-k="rs"]', el); if (rs) rs.onclick = () => { run = false; left = total; draw(); };
      const pre = $('[data-k="pre"]', el); if (pre) pre.onclick = (e) => { const m = e.target.dataset.m; if (m) { total = left = m * 60; run = false; draw(); } };
      draw();
    },

    todo() {
      let list = [];
      try { list = JSON.parse(localStorage.getItem('todos') || '[]'); } catch { /* corrupt */ }
      el.innerHTML = `${head('To-do', '<span class="muted" data-k="cnt" style="margin-left:auto;margin-right:20px"></span>')}<input class="inp" data-k="in" placeholder="Add a task and press Enter"><div class="list" data-k="ls"></div>`;
      const save = () => localStorage.setItem('todos', JSON.stringify(list));
      const draw = () => {
        const ls = $('[data-k="ls"]', el);
        if (!ls) return;
        ls.replaceChildren();
        list.forEach((t, i) => {
          const r = document.createElement('div');
          r.className = 'todo' + (t.d ? ' done' : '');
          r.innerHTML = `<div class="cb">${lucide('check', '', 12)}</div><span></span><button class="del">&times;</button>`;
          $('span', r).textContent = t.t;
          $('.cb', r).onclick = () => { t.d = !t.d; save(); draw(); };
          $('.del', r).onclick = () => { list.splice(i, 1); save(); draw(); };
          ls.append(r);
        });
        const cnt = $('[data-k="cnt"]', el); if (cnt) cnt.textContent = `${list.filter((t) => !t.d).length} left`;
      };
      const inEl = $('[data-k="in"]', el);
      if (inEl) inEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target.value.trim()) return;
        list.unshift({ t: e.target.value.trim(), d: false });
        e.target.value = '';
        save(); draw();
      });
      draw();
    },

    notes() {
      el.innerHTML = `${head('Notes')}<textarea class="inp" data-k="n" placeholder="Jot something down..."></textarea><div class="saved" data-k="sv">Saved</div>`;
      const n = $('[data-k="n"]', el);
      if (!n) return;
      n.value = localStorage.getItem('note') || '';
      let t;
      n.addEventListener('input', () => {
        const sv = $('[data-k="sv"]', el);
        if (!sv) return;
        sv.style.opacity = 0.2; sv.textContent = 'Saving...';
        clearTimeout(t);
        t = setTimeout(() => { localStorage.setItem('note', n.value); sv.textContent = `Saved - ${n.value.length} chars`; sv.style.opacity = 1; }, 400);
      });
      const sv = $('[data-k="sv"]', el); if (sv) sv.textContent = `${n.value.length} chars`;
    },

    dock() {
      el.innerHTML = `${head('Frequent apps')}<div class="tiles" data-k="tl"></div>`;
      every(async () => {
        const apps = await api.topApps();
        const box = $('[data-k="tl"]', el);
        if (!box) return;
        box.replaceChildren();
        if (!apps.length) { box.innerHTML = '<div class="wmsg" style="grid-column:1/-1">Apps you open from Spotlight will show up here.</div>'; return; }
        apps.forEach((a) => {
          const t = document.createElement('div');
          t.className = 'tile';
          t.innerHTML = '<img alt=""><span></span>';
          $('span', t).textContent = a.n;
          t.title = a.n;
          t.onclick = () => api.openPath(a.p);
          api.icon(a.p).then((u) => { if (u) { const img = $('img', t); if (img) img.src = u; } });
          box.append(t);
        });
      }, 30000);
    },

    clipboard() {
      el.innerHTML = `<div class="head-row">${head('Clipboard')}<button data-k="cl">Clear</button></div><div class="list" data-k="ls"></div>`;
      const draw = (items) => {
        const ls = $('[data-k="ls"]', el);
        if (!ls) return;
        ls.replaceChildren();
        if (!items.length) { ls.innerHTML = '<div class="wmsg">Copied text appears here.<br>Click an item to copy it again.</div>'; return; }
        items.forEach((t, i) => {
          const c = document.createElement('div');
          c.className = 'clip';
          c.textContent = t;
          c.onclick = () => { api.clipCopy(i); c.classList.add('ok'); setTimeout(() => c.classList.remove('ok'), 700); };
          ls.append(c);
        });
      };
      const cl = $('[data-k="cl"]', el); if (cl) cl.onclick = () => api.clipClear();
      api.clipGet().then(draw);
      onClip = draw;
    },

    // ── NEW WIDGETS ──

    pomodoro() {
      let mode = 'work', remaining = 25 * 60, running = false, completed = 0, end = 0;
      const WORK = 25 * 60, BREAK = 5 * 60, LONG = 15 * 60;
      el.innerHTML = `${head('Pomodoro')}<div class="ringwrap" data-k="rw"><svg viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="38"/><circle class="fg" data-k="rg" cx="46" cy="46" r="38" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg><div class="tm" data-k="tm"></div></div>`
        + '<div class="foot" data-k="md"></div>'
        + '<div class="btns"><button class="main" data-k="go">Start</button><button data-k="rs">Reset</button></div>'
        + '<div class="foot" data-k="st"></div>';
      const draw = () => {
        const tm = $('[data-k="tm"]', el); if (tm) tm.textContent = `${pad(Math.floor(remaining / 60))}:${pad(Math.ceil(remaining) % 60)}`;
        const rg = $('[data-k="rg"]', el);
        if (rg) {
          const total = mode === 'work' ? WORK : mode === 'break' ? BREAK : LONG;
          rg.style.strokeDashoffset = CIRC * (1 - remaining / total);
          rg.classList.toggle('o', mode === 'work');
        }
        const go = $('[data-k="go"]', el); if (go) go.textContent = running ? 'Pause' : 'Start';
        const md = $('[data-k="md"]', el); if (md) md.textContent = mode === 'work' ? 'Focus time' : mode === 'break' ? 'Short break' : 'Long break';
        const st = $('[data-k="st"]', el); if (st) st.textContent = `${completed} completed today`;
      };
      const beep = () => {
        try {
          const ac = new AudioContext();
          [0, 0.3, 0.6].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = mode === 'work' ? 440 : 880; g.gain.setValueAtTime(0.15, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.25); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.26); });
        } catch { /* audio unavailable */ }
      };
      timers.push(setInterval(() => {
        if (!running) return;
        remaining = Math.max(0, (end - Date.now()) / 1000);
        if (remaining <= 0) {
          running = false;
          beep();
          if (mode === 'work') { completed++; mode = completed % 4 === 0 ? 'long' : 'break'; remaining = mode === 'long' ? LONG : BREAK; }
          else { mode = 'work'; remaining = WORK; }
          new Notification(`Pomodoro ${mode === 'work' ? 'break over' : 'done'}`, { body: mode === 'work' ? 'Back to focus!' : 'Time for a break.' });
          const rw = $('[data-k="rw"]', el); if (rw) { rw.classList.add('done'); setTimeout(() => rw.classList.remove('done'), 2200); }
        }
        draw();
      }, 200));
      const go = $('[data-k="go"]', el); if (go) go.onclick = () => { running = !running; end = Date.now() + remaining * 1000; draw(); };
      const rs = $('[data-k="rs"]', el); if (rs) rs.onclick = () => { running = false; remaining = mode === 'work' ? WORK : mode === 'break' ? BREAK : LONG; draw(); };
      draw();
    },

    habits() {
      let habits = [];
      try { habits = JSON.parse(localStorage.getItem('habits') || '[]'); } catch { /* corrupt */ }
      const today = () => new Date().toDateString();
      let checkins = {};
      try { checkins = JSON.parse(localStorage.getItem('habitCheckins') || '{}'); } catch { /* corrupt */ }
      const isChecked = (name) => (checkins[name] || []).includes(today());
      el.innerHTML = `${head('Habits', '<span class="muted" data-k="cnt" style="margin-left:auto;margin-right:20px"></span>')}<input class="inp" data-k="in" placeholder="Add a habit and press Enter"><div class="list" data-k="ls"></div>`;
      const save = () => { localStorage.setItem('habits', JSON.stringify(habits)); localStorage.setItem('habitCheckins', JSON.stringify(checkins)); };
      const draw = () => {
        const ls = $('[data-k="ls"]', el);
        if (!ls) return;
        ls.replaceChildren();
        habits.forEach((h, i) => {
          const checked = isChecked(h);
          const streak = (checkins[h] || []).filter((d) => { const dd = new Date(d); return dd >= new Date(Date.now() - 30 * 864e5); }).length;
          const r = document.createElement('div');
          r.className = 'todo' + (checked ? ' done' : '');
          r.innerHTML = `<div class="cb">${lucide('check', '', 12)}</div><span></span><small class="muted" style="margin-left:auto;margin-right:8px"></small><button class="del">&times;</button>`;
          $('span', r).textContent = h;
          const sm = $('small', r); if (sm) sm.textContent = `${streak}d streak`;
          $('.cb', r).onclick = () => {
            if (!checkins[h]) checkins[h] = [];
            const idx = checkins[h].indexOf(today());
            if (idx >= 0) checkins[h].splice(idx, 1); else checkins[h].push(today());
            save(); draw();
          };
          $('.del', r).onclick = () => { habits.splice(i, 1); delete checkins[h]; save(); draw(); };
          ls.append(r);
        });
        const cnt = $('[data-k="cnt"]', el); if (cnt) cnt.textContent = `${habits.filter((h) => isChecked(h)).length}/${habits.length}`;
      };
      const inEl = $('[data-k="in"]', el);
      if (inEl) inEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target.value.trim()) return;
        habits.push(e.target.value.trim());
        e.target.value = '';
        save(); draw();
      });
      draw();
    },

    pomodoroOld() { /* alias */ },

    stocks() {
      let symbols = 'AAPL,MSFT,GOOGL,AMZN';
      el.innerHTML = `${head('Markets')}<div class="rows" data-k="ls"><div class="wmsg">Loading prices...</div></div><div class="foot" data-k="ts"></div>`;
      const tk = mountSeq;
      const fetchStocks = async () => {
        const ls = $('[data-k="ls"]', el);
        if (!ls) return;
        try {
          const parts = symbols.split(',').map((s) => s.trim()).filter(Boolean);
          const rows = parts.map((sym) => `<div class="row"><span class="ri">${lucide('trendingUp', 'ri-svg', 16)}</span><div><small>${esc(sym)}</small><b data-k="p-${esc(sym)}">--</b></div></div>`).join('');
          ls.innerHTML = rows;
          // Use a simple free API - Yahoo Finance via CORS proxy, or fallback to random walk simulation
          for (const sym of parts) {
            if (tk !== mountSeq) return;
            const el2 = $(`[data-k="p-${CSS.escape(sym)}"]`, el);
            if (!el2) continue;
            try {
              const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`);
              const data = await resp.json();
              const result = data.chart?.result?.[0];
              if (result) {
                const price = result.meta?.regularMarketPrice;
                const prev = result.meta?.chartPreviousClose || price;
                const change = price != null && prev ? ((price - prev) / prev * 100) : 0;
                el2.textContent = `$${price?.toFixed(2) || '--'} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`;
                el2.style.color = change >= 0 ? 'var(--green, #30d158)' : 'var(--red, #ff453a)';
              } else {
                el2.textContent = 'N/A';
              }
            } catch {
              el2.textContent = 'Offline';
              el2.style.color = 'var(--muted)';
            }
          }
          const ts = $('[data-k="ts"]', el); if (ts) ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        } catch {
          const ls2 = $('[data-k="ls"]', el); if (ls2) ls2.innerHTML = '<div class="wmsg">Could not load market data</div>';
        }
      };
      every(fetchStocks, 60000);
    },

    uptime() {
      el.innerHTML = `${head('System Uptime')}<div class="time grad" data-k="up">--</div><div class="foot" data-k="bt"></div>`;
      const tk = mountSeq;
      every(async () => {
        if (tk !== mountSeq) return;
        try {
          const s = await api.stats();
          if (!s) return;
          const up = s.uptime || 0;
          const d = Math.floor(up / 86400);
          const h = Math.floor(up / 3600) % 24;
          const m = Math.floor(up / 60) % 60;
          const sec = Math.floor(up) % 60;
          const upEl = $('[data-k="up"]', el);
          if (upEl) upEl.textContent = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${sec}s`;
          const bt = $('[data-k="bt"]', el);
          if (bt) {
            try {
              const b = await navigator.getBattery();
              bt.innerHTML = `${lucide('battery', 'ri-svg', 13)} ${Math.round(b.level * 100)}%${b.charging ? ' charging' : ''}`;
            } catch { bt.textContent = ''; }
          }
        } catch { /* ignore */ }
      }, 1000);
    },

    speedtest() {
      el.innerHTML = `${head('Speed Test')}<div class="time grad" data-k="sp">--</div><div class="foot" data-k="st">Click to test</div><div class="btns"><button class="main" data-k="go">Run Test</button></div>`;
      const tk = mountSeq;
      const runTest = async () => {
        const sp = $('[data-k="sp"]', el);
        const st = $('[data-k="st"]', el);
        if (!sp || !st) return;
        st.textContent = 'Testing download speed...';
        sp.textContent = '...';
        try {
          const start = performance.now();
          const resp = await fetch('https://speed.cloudflare.com/__down?bytes=25000000', { cache: 'no-store' });
          const reader = resp.body.getReader();
          let bytes = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            const elapsed = (performance.now() - start) / 1000;
            if (elapsed > 0.5) sp.textContent = `${((bytes * 8) / elapsed / 1e6).toFixed(1)} Mbps`;
          }
          const elapsed = (performance.now() - start) / 1000;
          const mbps = (bytes * 8) / elapsed / 1e6;
          sp.textContent = `${mbps.toFixed(1)} Mbps`;
          st.textContent = `${(bytes / 1e6).toFixed(1)} MB in ${elapsed.toFixed(1)}s`;
        } catch {
          sp.textContent = 'Failed';
          st.textContent = 'Could not reach test server';
        }
      };
      const go = $('[data-k="go"]', el); if (go) go.onclick = runTest;
    },

    calendarEvents() {
      el.innerHTML = `${head('Upcoming')}<div class="rows" data-k="ls"><div class="wmsg">No upcoming events</div></div>`;
      const draw = () => {
        const events = [];
        try { events.push(...JSON.parse(localStorage.getItem('calendarEvents') || '[]')); } catch { /* corrupt */ }
        // Add countdown widget dates as upcoming
        // Add habit streaks
        const ls = $('[data-k="ls"]', el);
        if (!ls) return;
        if (!events.length) {
          // Show next holidays / notable dates as fallback
          const now = new Date();
          const year = now.getFullYear();
          const dates = [
            ['New Year', new Date(year, 0, 1)], ['Valentine\'s Day', new Date(year, 1, 14)],
            ['Easter', new Date(year, 3, 20)], ['Christmas', new Date(year, 11, 25)],
          ].filter(([, d]) => d > now).sort((a, b) => a[1] - b[1]).slice(0, 5);
          if (dates.length) {
            ls.replaceChildren();
            dates.forEach(([name, date]) => {
              const days = Math.ceil((date - now) / 864e5);
              const r = document.createElement('div');
              r.className = 'row';
              r.innerHTML = `<span class="ri">${lucide('calendar', 'ri-svg', 16)}</span><div><small>${esc(name)}</small><b>${days} day${days === 1 ? '' : 's'}</b></div>`;
              ls.append(r);
            });
          }
          return;
        }
        ls.replaceChildren();
        events.sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 6).forEach((ev) => {
          const days = Math.ceil((new Date(ev.date) - now) / 864e5);
          const r = document.createElement('div');
          r.className = 'row';
          r.innerHTML = `<span class="ri">${lucide('calendar', 'ri-svg', 16)}</span><div><small>${esc(ev.title)}</small><b>${days >= 0 ? `In ${days}d` : `${-days}d ago`}</b></div>`;
          ls.append(r);
        });
      };
      every(draw, 60000);
    },
  };

  function mount(opts, prefs) {
    mountSeq++;
    timers.forEach(clearInterval);
    timers = [];
    tasks = [];
    el.replaceChildren();
    onClip = () => {};
    card.className = 'card w-' + type;
    card.dataset.sky = '';
    if (W[type]) W[type]({ ...(opts || {}) }, prefs);
  }

  function setState(s) {
    state = s;
    applyCss(s.prefs);
    const key = JSON.stringify([s.prefs.widgetOpts[type], type === 'worldclock' ? s.prefs.widgetOpts.clock : null]);
    if (key !== mountKey) { mountKey = key; mount(s.prefs.widgetOpts[type], s.prefs); }
  }

  function applyCss(p) {
    const r = document.documentElement.style;
    r.setProperty('--accent', p.accent);
    r.setProperty('--wo', p.widgetOpacity);
    r.setProperty('--radius', p.widgetRadius + 'px');
    document.body.classList.toggle('noanim', !p.animations);
    document.body.classList.toggle('noborder', !p.widgetBorder);
    document.body.classList.toggle('noshadow', !p.widgetShadow);
  }

  function setPaused(v) {
    paused = !v;
    if (v) tasks.forEach((f) => f());
  }

  function destroy() {
    timers.forEach(clearInterval);
    timers = [];
    tasks = [];
    onClip = () => {};
  }

  // Wire up context menu on card
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    api.widgetMenu(type);
  });

  // Close button
  const closeBtn = card.querySelector('.x');
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); api.closeWidget(type); });

  return { mount, setState, setPaused, destroy, type, onClipEvent: (fn) => { onClip = fn; } };
}

// Expose globally for desktop.js
window.createWidget = createWidget;
