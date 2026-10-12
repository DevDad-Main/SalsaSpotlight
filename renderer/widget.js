const type = new URLSearchParams(location.search).get('type');
const el = document.getElementById('content');
const card = document.querySelector('.card');
document.getElementById('x').addEventListener('click', () => window.api.closeWidget());

const $ = (s, r = el) => r.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const head = (t, extra = '') => `<div class="label"><i class="dot"></i>${t}${extra}</div>`;
const gb = (b) => (b / 1024 ** 3).toFixed(b > 1e11 ? 0 : 1) + ' GB';
const sparkSvg = '<svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none"><path id="sa" class="sa"/><path id="sl" class="sl"/></svg>';

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
  };
  const body = I[name] || I.sparkles;
  return `<svg class="lucide lucide-${name} ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function drawSpark(hist, max) {
  const pts = hist.map((v, i) => `${(i * 200) / (hist.length - 1)},${38 - (v / max) * 36}`).join('L');
  $('#sl').setAttribute('d', 'M' + pts);
  $('#sa').setAttribute('d', `M0,40L${pts}L200,40Z`);
}

let timers = [], tasks = [], paused = false, state = null, mountKey = '', mountSeq = 0;
const every = (fn, ms) => { fn(); tasks.push(fn); timers.push(setInterval(() => { if (!paused) fn(); }, ms)); };

const CIRC = 2 * Math.PI * 38;
const gauge = (id, cls, label, attr = '') => `<div class="g" ${attr}><svg viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="38"/><circle class="fg ${cls}" id="${id}" cx="46" cy="46" r="38" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg><div class="v"><span id="${id}v">0%</span><small>${label}</small></div></div>`;
function setGauge(id, pct) {
  const c = $('#' + id);
  c.style.strokeDashoffset = CIRC * (1 - Math.min(pct, 100) / 100);
  c.classList.toggle('o', pct > 90);
  $('#' + id + 'v').textContent = Math.round(pct) + '%';
}

const WX = (code, day = true) => {
  if (code === 0) return [day ? lucide('sun', '', 48) : lucide('moon', '', 48), 'Clear sky'];
  if (code <= 2) return [day ? lucide('cloudSun', '', 48) : lucide('cloud', '', 48), 'Partly cloudy'];
  if (code === 3) return [lucide('cloud', '', 48), 'Overcast'];
  if (code <= 48) return [lucide('cloudFog', '', 48), 'Fog'];
  if (code <= 57) return [lucide('cloudRain', '', 48), 'Drizzle'];
  if (code <= 67) return [lucide('cloudRain', '', 48), 'Rain'];
  if (code <= 77) return [lucide('cloudSnow', '', 48), 'Snow'];
  if (code <= 82) return [lucide('cloudRain', '', 48), 'Showers'];
  if (code <= 86) return [lucide('cloudSnow', '', 48), 'Snow showers'];
  return [lucide('cloudLightning', '', 48), 'Thunderstorm'];
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
      el.innerHTML = `${head('Clock')}<div class="analog"><svg viewBox="-50 -50 100 100">${ticks}<line id="hh" class="hand h" y2="-24"/><line id="mh" class="hand m" y2="-34"/><line id="sh" class="hand s" y2="-38"/><circle r="2.5" class="pin"/></svg><div><div class="bigday grad" id="dd"></div><div class="date" id="dm"></div></div></div>`;
      if (!o.seconds) $('#sh').style.display = 'none';
      every(() => {
        const n = new Date(), s = n.getSeconds(), m = n.getMinutes();
        $('#hh').style.transform = `rotate(${(n.getHours() % 12 + m / 60) * 30}deg)`;
        $('#mh').style.transform = `rotate(${(m + s / 60) * 6}deg)`;
        $('#sh').style.transform = `rotate(${s * 6}deg)`;
        $('#dd').textContent = n.toLocaleDateString([], { weekday: 'long' });
        $('#dm').textContent = n.toLocaleDateString([], { month: 'long', day: 'numeric' });
      }, 1000);
      return;
    }
    el.innerHTML = `${head('Local time')}<div class="time grad"><span id="hm"></span><small id="sc"></small></div><div class="date" id="d"></div><div class="bar"><i id="sb"></i></div>`;
    every(() => {
      const n = new Date(), H = n.getHours();
      $('#hm').textContent = `${o.h24 ? pad(H) : h12(H)}:${pad(n.getMinutes())}`;
      $('#sc').textContent = (o.seconds ? `:${pad(n.getSeconds())}` : '') + (o.h24 ? '' : (o.seconds ? ' ' : '') + (H < 12 ? 'AM' : 'PM'));
      $('#d').textContent = n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      $('#sb').style.width = (o.seconds ? (n.getSeconds() + 1) / 60 : (n.getMinutes() * 60 + n.getSeconds()) / 3600) * 100 + '%';
    }, 1000);
  },

  worldclock(o, prefs) {
    const zones = o.zones.split(',').map((z) => z.trim()).filter(Boolean).slice(0, 5);
    el.innerHTML = `${head('World clock')}<div class="rows"></div>`;
    const rows = $('.rows');
    every(() => {
      const now = new Date();
      const local = now.toLocaleDateString('en-CA');
      rows.replaceChildren();
      zones.forEach((z) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.animation = 'none';
        try {
          const f = (opt) => new Intl.DateTimeFormat([], { timeZone: z, ...opt });
          const hour = Number(f({ hour: 'numeric', hour12: false }).format(now)) % 24;
          const day = new Intl.DateTimeFormat('en-CA', { timeZone: z }).format(now);
          const rel = day === local ? 'Today' : day > local ? 'Tomorrow' : 'Yesterday';
          const ri = hour >= 6 && hour < 19 ? lucide('sun', 'ri-svg', 16) : lucide('moon', 'ri-svg', 16);
          row.innerHTML = `<span class="ri">${ri}</span><div><b class="c"></b><small class="r"></small></div><div class="rt grad"></div>`;
          $('.c', row).textContent = z.split('/').pop().replace(/_/g, ' ');
          $('.r', row).textContent = rel;
          $('.rt', row).textContent = f({ hour: prefs.widgetOpts.clock.h24 ? '2-digit' : 'numeric', minute: '2-digit', hour12: !prefs.widgetOpts.clock.h24 }).format(now);
        } catch {
          row.innerHTML = `<span class="ri">${lucide('globe', 'ri-svg', 16)}</span><div><b class="c"></b><small>Unknown time zone</small></div>`;
          $('.c', row).textContent = z;
        }
        rows.append(row);
      });
    }, 5000);
  },

  async weather(o) {
    el.innerHTML = `${head('Weather')}<div class="wx"><div class="wmsg">Loading...</div></div>`;
    const tk = mountSeq;
    every(async () => {
      const d = await window.api.weather(o.city, o.units);
      if (tk !== mountSeq) return;
      const box = $('.wx');
      if (d.error) { box.innerHTML = '<div class="wmsg"></div>'; $('.wmsg').textContent = `${d.error} - set a city in Settings`; return; }
      const [icon, text] = WX(d.code, d.isDay);
      const c = d.code;
      card.dataset.sky = c >= 95 ? 'storm' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) ? 'rain' : c === 3 || (c >= 45 && c <= 48) ? 'cloud' : d.isDay ? 'day' : 'night';
      const hours = d.hours.map((h) => `<div class="hour">${esc(h.h.slice(0, 2))}<span>${WX(h.code, true)[0]}</span><b>${Math.round(h.t)}°</b></div>`).join('');
      box.innerHTML = `<div class="wcity">${esc(d.city)}, ${esc(d.country || '')} <span class="muted">- ${esc(text)}</span></div><div class="wmain"><div class="wicon">${icon}</div><div class="wtemp grad">${Math.round(d.temp)}${esc(d.unit)}</div></div>`
        + `<div class="wmeta"><span>Feels ${Math.round(d.feels)}°</span><span>H ${Math.round(d.hi)}° L ${Math.round(d.lo)}°</span><span>${lucide('droplet', '', 13)} ${d.humidity}%</span><span>${lucide('wind', '', 13)} ${Math.round(d.wind)} ${esc(d.windUnit)}</span></div>`
        + `<div class="wmeta"><span>${lucide('sunrise', '', 13)} ${esc(d.sunrise)}</span><span>${lucide('sunset', '', 13)} ${esc(d.sunset)}</span></div><div class="hours">${hours}</div>`;
    }, 15 * 60 * 1000);
  },

  system(o) {
    const row = (id, iconSvg, label, hidden) => `<div class="row" id="r${id}"${hidden ? ' hidden' : ''}><span class="ri">${iconSvg}</span><div><small>${label}</small><b id="i${id}">...</b></div></div>`;
    el.innerHTML = `${head('System')}<div class="gauges">${gauge('c', 'a', 'CPU')}${gauge('m', 'g', 'RAM')}${o.gpu ? gauge('u', 'p', 'GPU', 'id="gw" hidden') : ''}</div>`
      + (o.graph ? sparkSvg : '')
      + (o.info ? `<div class="rows">${row(1, lucide('cpu', 'ri-svg', 16), 'Processor')}${row(2, lucide('memory', 'ri-svg', 16), 'Memory')}${o.gpu ? row(3, lucide('gpu', 'ri-svg', 16), 'Graphics', true) : ''}</div>` : '')
      + '<div class="foot" id="f"></div>';
    const tk = mountSeq;
    if (o.info) {
      window.api.specs().then((sp) => { if (tk === mountSeq && $('#i1')) $('#i1').textContent = `${sp.cpu} (${sp.cores})`; }).catch(() => {});
      window.api.specsGpu().then((h) => { if (tk === mountSeq && h.cpu && $('#i1')) $('#i1').textContent = `${h.cpu} (${h.cores})`; }).catch(() => {});
    }
    const hist = Array(40).fill(0);
    every(async () => {
      const [s, g] = await Promise.all([window.api.stats(), o.gpu ? window.api.gpuStats() : null]);
      if (tk !== mountSeq || !$('#c')) return;
      setGauge('c', s.cpu);
      setGauge('m', s.mem);
      if (o.graph) { hist.push(s.cpu); hist.shift(); drawSpark(hist, 100); }
      if (o.info) $('#i2').textContent = `${s.memUsed.toFixed(1)} / ${s.memTotal.toFixed(1)} GB (${(s.memTotal - s.memUsed).toFixed(1)} free)`;
      if (g && o.gpu) {
        $('#gw').hidden = false;
        setGauge('u', g.util ?? 0);
        if (o.info) {
          $('#r3').hidden = false;
          const vr = g.memUsed != null && g.memTotal ? ` | ${(g.memUsed / 1024).toFixed(1)}/${(g.memTotal / 1024).toFixed(0)} GB` : '';
          $('#i3').textContent = `${g.name}${vr}${g.temp != null ? ` | ${g.temp}°C` : ''}`;
        }
      }
      let batt = '';
      if (o.battery) { try { const b = await navigator.getBattery(); if (b.level < 1 || !b.charging) batt = ` | ${lucide('battery', 'ri-svg', 13)} ${Math.round(b.level * 100)}%${b.charging ? ' charging' : ''}`; } catch { /* no battery */ } }
      $('#f').innerHTML = `${lucide('clock', 'ri-svg', 12)} Up ${Math.floor(s.uptime / 3600)}h ${Math.floor(s.uptime / 60) % 60}m${batt}`;
    }, 1500);
  },

  async specs(o) {
    const tk = mountSeq;
    el.innerHTML = `${head('PC Specs')}<div class="rows"><div class="wmsg">Reading hardware...</div></div>`;
    let base;
    try { base = await window.api.specs(); } catch { base = null; }
    if (tk !== mountSeq) return;
    if (!base) { $('.rows').innerHTML = '<div class="wmsg">Could not read hardware info</div>'; return; }
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
      const box = $('.rows');
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
    window.api.specsGpu().then((hw) => draw({ ...base, ...Object.fromEntries(Object.entries(hw).filter(([, v]) => v != null)) })).catch(() => {});
  },

  disks() {
    el.innerHTML = `${head('Storage')}<div class="dl"></div>`;
    every(async () => {
      const list = await window.api.disks();
      const box = $('.dl');
      if (!box) return;
      box.replaceChildren();
      list.slice(0, 5).forEach((d) => {
        const used = ((d.total - d.free) / d.total) * 100;
        const n = document.createElement('div');
        n.className = 'disk';
        n.innerHTML = `<div class="top"><b style="display:flex;align-items:center;gap:6px">${lucide('hardDrive', '', 14)} ${esc(d.name)}</b><span class="muted">${gb(d.free)} free of ${gb(d.total)}</span></div><div class="track"><div class="fill${used > 88 ? ' warn' : ''}"></div></div>`;
        box.append(n);
        requestAnimationFrame(() => requestAnimationFrame(() => { $('.fill', n).style.width = used + '%'; }));
      });
    }, 60000);
  },

  gpu() {
    el.innerHTML = `${head('GPU')}<div class="gpu">${gauge('u', 'p', 'GPU')}<div class="gst" id="gs"></div></div>`
      + '<div class="vr"><div class="top"><span class="muted">VRAM</span><span id="vt"></span></div><div class="track"><div class="fill" id="vf"></div></div></div><div class="foot" id="gn"></div>';
    const tk = mountSeq;
    every(async () => {
      const g = await window.api.gpuStats();
      if (tk !== mountSeq || !$('#u')) return;
      if (!g) { $('#gn').textContent = 'No NVIDIA GPU detected'; return; }
      setGauge('u', g.util ?? 0);
      const dash = (v, unit) => (v == null ? '-' : `${Math.round(v)}${unit}`);
      $('#gs').innerHTML = [['Temperature', dash(g.temp, '°C')], ['Power', dash(g.power, ' W')], ['Clock', dash(g.clock, ' MHz')]]
        .map(([l, v]) => `<div class="st"><small>${l}</small><b>${esc(v)}</b></div>`).join('');
      if (g.memTotal) {
        $('#vt').textContent = `${(g.memUsed / 1024).toFixed(1)} / ${(g.memTotal / 1024).toFixed(0)} GB`;
        $('#vf').style.width = (g.memUsed / g.memTotal) * 100 + '%';
      }
      $('#gn').textContent = g.name;
    }, 1500);
  },

  network() {
    el.innerHTML = `${head('Network')}<div class="net"><div><small>Download</small><b id="nd">0 KB/s</b></div><div><small>Upload</small><b id="nu">0 KB/s</b></div></div>${sparkSvg}<div class="foot" id="f"></div>`;
    const tk = mountSeq;
    const fmt = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${Math.round(b / 1e3)} KB/s`);
    const hist = Array(40).fill(0);
    let ip = '';
    window.api.specs().then((s) => { ip = s.ip || ''; }).catch(() => {});
    every(async () => {
      const n = await window.api.net();
      if (tk !== mountSeq || !$('#nd')) return;
      if (!n) { $('#f').textContent = 'Network stats unavailable'; return; }
      hist.push(n.down); hist.shift();
      drawSpark(hist, Math.max(1e5, ...hist));
      $('#nd').textContent = fmt(n.down);
      $('#nu').textContent = fmt(n.up);
      $('#f').textContent = `${n.iface}${ip ? ` | ${ip}` : ''}`;
    }, 2000);
  },

  countdown(o) {
    const target = new Date(`${o.date}T00:00:00`);
    el.innerHTML = `${head('Countdown')}<div class="cd"><div class="cdn" id="cn"></div><div class="cdl" id="cl"></div></div><div class="foot" id="cs"></div>`;
    every(() => {
      if (!$('#cn')) return;
      if (Number.isNaN(target.getTime())) { $('#cn').textContent = '?'; $('#cl').textContent = 'Set a date (YYYY-MM-DD) in Settings'; return; }
      const diff = target - new Date();
      const days = Math.ceil(diff / 864e5);
      $('#cn').textContent = days === 0 ? '🎉' : String(Math.abs(days));
      $('#cl').textContent = days === 0 ? `Today: ${o.title}` : days > 0 ? `day${days === 1 ? '' : 's'} until ${o.title}` : `day${days === -1 ? '' : 's'} since ${o.title}`;
      $('#cs').textContent = diff > 0 ? `${Math.floor(diff / 36e5) % 24}h ${Math.floor(diff / 6e4) % 60}m to go today` : '';
    }, 30000);
  },

  quote() {
    const [text, who] = QUOTES[Math.floor(Date.now() / 864e5) % QUOTES.length];
    el.innerHTML = `${head('Quote of the day')}<div class="qt"></div><div class="qa muted"></div>`;
    $('.qt').textContent = `\u201C${text}\u201D`;
    $('.qa').textContent = `- ${who}`;
  },

  calendar(o) {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    el.innerHTML = `${head('Calendar')}<div class="cal-head"><button id="pv">&lsaquo;</button><span id="mn"></span><button id="nx">&rsaquo;</button></div><div class="grid" id="gr"></div>`;
    const draw = () => {
      $('#mn').textContent = new Date(y, m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
      const gr = $('#gr');
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
    $('#pv').onclick = () => go(-1);
    $('#nx').onclick = () => go(1);
    $('#mn').onclick = () => { y = now.getFullYear(); m = now.getMonth(); draw(); };
    draw();
  },

  async progress() {
    const tk = mountSeq;
    let user = 'there';
    try { user = (await window.api.specs()).user; } catch { /* keep default */ }
    if (tk !== mountSeq) return;
    el.innerHTML = `${head('Progress')}<div class="hello grad" id="hi"></div><div id="pl"></div>`;
    const draw = () => {
      const n = new Date(), H = n.getHours();
      $('#hi').textContent = `Good ${H < 5 ? 'night' : H < 12 ? 'morning' : H < 18 ? 'afternoon' : 'evening'}, ${user}`;
      const day = (n - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5;
      const wd = ((n.getDay() + 6) % 7 + day) / 7;
      const dim = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
      const mo = (n.getDate() - 1 + day) / dim;
      const ys = new Date(n.getFullYear(), 0, 1), ye = new Date(n.getFullYear() + 1, 0, 1);
      const yr = (n - ys) / (ye - ys);
      const bars = [['Today', day, `${Math.round((1 - day) * 24)}h left`], ['This week', wd, `${Math.ceil((1 - wd) * 7)} days left`],
        ['This month', mo, `${dim - n.getDate()} days left`], [String(n.getFullYear()), yr, `${Math.ceil((ye - n) / 864e5)} days left`]];
      const box = $('#pl');
      if (!box.children.length) bars.forEach(() => { const d = document.createElement('div'); d.className = 'pr'; d.innerHTML = '<div class="top"><span></span><span></span></div><div class="track"><div class="fill"></div></div>'; box.append(d); });
      bars.forEach(([l, v, t], i) => {
        const d = box.children[i];
        d.children[0].children[0].textContent = l;
        d.children[0].children[1].textContent = `${Math.round(v * 100)}% - ${t}`;
        setTimeout(() => { d.querySelector('.fill').style.width = v * 100 + '%'; }, 60 + i * 90);
      });
    };
    every(draw, 60000);
  },

  timer() {
    let total = 25 * 60, left = total, end = 0, run = false;
    el.innerHTML = `${head('Timer')}<div class="ringwrap" id="rw"><svg viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="38"/><circle class="fg" id="rg" cx="46" cy="46" r="38" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg><div class="tm" id="tm"></div></div>`
      + '<div class="btns" id="pre"><button data-m="5">5m</button><button data-m="10">10m</button><button data-m="25">25m</button><button data-m="45">45m</button></div>'
      + '<div class="btns"><button class="main" id="go">Start</button><button id="rs">Reset</button></div>';
    const draw = () => {
      $('#tm').textContent = `${pad(Math.floor(left / 60))}:${pad(Math.ceil(left) % 60)}`;
      $('#rg').style.strokeDashoffset = CIRC * (1 - left / total);
      $('#go').textContent = run ? 'Pause' : 'Start';
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
        const rw = $('#rw'); rw.classList.add('done'); setTimeout(() => rw.classList.remove('done'), 2200);
      }
      draw();
    }, 200));
    $('#go').onclick = () => { if (!run && left <= 0) left = total; run = !run; end = Date.now() + left * 1000; draw(); };
    $('#rs').onclick = () => { run = false; left = total; draw(); };
    $('#pre').onclick = (e) => { const m = e.target.dataset.m; if (m) { total = left = m * 60; run = false; draw(); } };
    draw();
  },

  todo() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('todos') || '[]'); } catch { /* corrupt */ }
    el.innerHTML = `${head('To-do', '<span class="muted" id="cnt" style="margin-left:auto;margin-right:20px"></span>')}<input class="inp" id="in" placeholder="Add a task and press Enter"><div class="list" id="ls"></div>`;
    const save = () => localStorage.setItem('todos', JSON.stringify(list));
    const draw = () => {
      const ls = $('#ls');
      ls.replaceChildren();
      list.forEach((t, i) => {
        const r = document.createElement('div');
        r.className = 'todo' + (t.d ? ' done' : '');
        r.innerHTML = '<div class="cb">✓</div><span></span><button class="del">&times;</button>';
        $('span', r).textContent = t.t;
        $('.cb', r).onclick = () => { t.d = !t.d; save(); draw(); };
        $('.del', r).onclick = () => { list.splice(i, 1); save(); draw(); };
        ls.append(r);
      });
      $('#cnt').textContent = `${list.filter((t) => !t.d).length} left`;
    };
    $('#in').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      list.unshift({ t: e.target.value.trim(), d: false });
      e.target.value = '';
      save(); draw();
    });
    draw();
  },

  notes() {
    el.innerHTML = `${head('Notes')}<textarea class="inp" id="n" placeholder="Jot something down..."></textarea><div class="saved" id="sv">Saved</div>`;
    const n = $('#n');
    n.value = localStorage.getItem('note') || '';
    let t;
    n.addEventListener('input', () => {
      $('#sv').style.opacity = 0.2; $('#sv').textContent = 'Saving...';
      clearTimeout(t);
      t = setTimeout(() => { localStorage.setItem('note', n.value); $('#sv').textContent = `Saved - ${n.value.length} chars`; $('#sv').style.opacity = 1; }, 400);
    });
    $('#sv').textContent = `${n.value.length} chars`;
  },

  dock() {
    el.innerHTML = `${head('Frequent apps')}<div class="tiles" id="tl"></div>`;
    every(async () => {
      const apps = await window.api.topApps();
      const box = $('#tl');
      if (!box) return;
      box.replaceChildren();
      if (!apps.length) { box.innerHTML = '<div class="wmsg" style="grid-column:1/-1">Apps you open from Spotlight will show up here.</div>'; return; }
      apps.forEach((a) => {
        const t = document.createElement('div');
        t.className = 'tile';
        t.innerHTML = '<img alt=""><span></span>';
        $('span', t).textContent = a.n;
        t.title = a.n;
        t.onclick = () => window.api.openPath(a.p);
        window.api.icon(a.p).then((u) => { if (u) $('img', t).src = u; });
        box.append(t);
      });
    }, 30000);
  },

  clipboard() {
    el.innerHTML = `<div class="head-row">${head('Clipboard')}<button id="cl">Clear</button></div><div class="list" id="ls"></div>`;
    const draw = (items) => {
      const ls = $('#ls');
      if (!ls) return;
      ls.replaceChildren();
      if (!items.length) { ls.innerHTML = '<div class="wmsg">Copied text appears here.<br>Click an item to copy it again.</div>'; return; }
      items.forEach((t, i) => {
        const c = document.createElement('div');
        c.className = 'clip';
        c.textContent = t;
        c.onclick = () => { window.api.clipCopy(i); c.classList.add('ok'); setTimeout(() => c.classList.remove('ok'), 700); };
        ls.append(c);
      });
    };
    $('#cl').onclick = () => window.api.clipClear();
    window.api.clipGet().then(draw);
    onClip = draw;
  },
};
let onClip = () => {};
window.api.onClip((l) => onClip(l));

function applyCss(p) {
  const r = document.documentElement.style;
  r.setProperty('--accent', p.accent);
  r.setProperty('--wo', p.widgetOpacity);
  r.setProperty('--radius', p.widgetRadius + 'px');
  document.body.classList.toggle('noanim', !p.animations);
  document.body.classList.toggle('noborder', !p.widgetBorder);
  document.body.classList.toggle('noshadow', !p.widgetShadow);
}

function mount() {
  mountSeq++;
  timers.forEach(clearInterval);
  timers = [];
  tasks = [];
  el.replaceChildren();
  onClip = () => {};
  card.className = 'card w-' + type;
  const p = state.prefs;
  if (W[type]) W[type]({ ...(p.widgetOpts[type] || {}) }, p);
}

function onState(s) {
  state = s;
  applyCss(s.prefs);
  const key = JSON.stringify([s.prefs.widgetOpts[type], type === 'worldclock' ? s.prefs.widgetOpts.clock : null]);
  if (key !== mountKey) { mountKey = key; mount(); }
}

// Drag by hand so the main process can snap to the grid and push other widgets out of the way.
let press = null;
card.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, input, textarea, select, .list, .tile, .clip, .cb, .cal-head span')) return;
  press = { x: e.screenX, y: e.screenY, dragging: false, id: e.pointerId };
  card.setPointerCapture(e.pointerId);
});
card.addEventListener('pointermove', (e) => {
  if (!press || press.dragging) return;
  if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < 5) return;
  press.dragging = true;
  card.classList.add('dragging');
  window.api.dragStart();
});
const release = () => {
  if (press?.dragging) { card.classList.remove('dragging'); window.api.dragEnd(); }
  press = null;
};
card.addEventListener('pointerup', release);
card.addEventListener('pointercancel', release);
card.addEventListener('contextmenu', (e) => { e.preventDefault(); window.api.widgetMenu(); });
window.api.onResized(() => { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); });

window.api.onVis((v) => {
  paused = !v;
  document.body.classList.toggle('hidden', !v);
  if (v) tasks.forEach((f) => f());
});
window.api.onState(onState);
window.api.getState().then(onState);
