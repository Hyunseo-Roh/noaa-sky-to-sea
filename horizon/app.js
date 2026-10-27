'use strict';

(() => {
  // The viewer stands on the ocean side of north Key Largo (a demo location).
  const VIEWER = { lat: 25.2156, lon: -80.3467 };

  // bearing/elev in degrees. `follow` pins a place to the sky in front of you, whichever way you face.
  const PLACES = {
    'carysfort-reef': { lat: 25.2219472, lon: -80.21145, elev: 0, name: 'Carysfort Reef' },
    'florida-keys-sanctuary': { bearing: 77, elev: -1.3 },
    'weather': { follow: -6.5, elev: 11 },
  };

  // The sample photo (2400 x 1800): where the lighthouse and the horizon sit in its pixels.
  const PHOTO = { w: 2400, h: 1800, lighthouseX: 1314, horizonY: 1115, heightToScreen: 1180 / 844 };
  const SAMPLE_FOV = 63;   // degrees across the screen height in the sample view
  const CAMERA_FOV = 60;   // degrees across the long side of the camera image
  const SAMPLE_HORIZON = 401 / 844;
  const LIGHTHOUSE_OFFSET = 2.76; // the sample view opens with the lighthouse just right of centre

  const $ = (s) => document.querySelector(s);
  const screen = $('#screen');
  const feed = $('#feed');
  const video = $('#live');
  const hline = $('#hline');
  const facing = $('#facing');
  const note = $('#note');
  const hint = $('#hint');
  const startBtn = $('#start');
  const startLabel = $('#start-label');
  const edge = $('#edge');
  const sheet = $('#sheet');
  const sheetBody = $('#sheet-body');
  const markers = [...document.querySelectorAll('.mk')];
  const leads = [...document.querySelectorAll('.lead[data-lead]')];
  const topBlock = $('.top');
  const hintBlock = $('.hint');

  const rad = (d) => d * Math.PI / 180;
  const deg = (r) => r * 180 / Math.PI;
  const wrap = (d) => ((d % 360) + 540) % 360 - 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const dir8 = (b) => DIRS[Math.round((((b % 360) + 360) % 360) / 45) % 8];

  function bearing(a, b) {
    const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lon - a.lon);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function miles(a, b) {
    const p1 = rad(a.lat), p2 = rad(b.lat), dp = p2 - p1, dl = rad(b.lon - a.lon);
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.sqrt(h)) / 1.609344;
  }
  for (const p of Object.values(PLACES)) {
    if (p.lat != null) { p.bearing = bearing(VIEWER, p); p.miles = miles(VIEWER, p); }
  }
  const REEF = PLACES['carysfort-reef'];

  // Heading of the back camera from absolute device orientation (Android).
  function compassFromEuler(alpha, beta, gamma) {
    const x = rad(beta), y = rad(gamma), z = rad(alpha);
    const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
    const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
    let h = Math.atan(vx / vy);
    if (vy < 0) h += Math.PI; else if (vx < 0) h += 2 * Math.PI;
    return deg(h);
  }

  const S = {
    mode: 'sample',        // 'sample' (photo) or 'live' (camera)
    h: REEF.bearing - LIGHTHOUSE_OFFSET, th: REEF.bearing - LIGHTHOUSE_OFFSET,
    p: 0, tp: 0,           // camera tilt: + is up
    compass: false,
    drag: null,
    stream: null,
    pushed: false,
    hintOverride: '',
  };

  const canCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
  const isTouch = matchMedia('(pointer: coarse)').matches;

  function geometry() {
    const W = screen.clientWidth, H = screen.clientHeight;
    let ppd = H / SAMPLE_FOV, horizonY = H * SAMPLE_HORIZON;
    if (S.mode === 'live') {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) {
        const s = Math.max(W / vw, H / vh);
        ppd = (vh >= vw ? vh * s : vw * s) / CAMERA_FOV;
      }
      horizonY = H / 2 + S.p * ppd;
    }
    return { W, H, cx: W / 2, ppd, horizonY };
  }

  // In the sample view you can only look as far as the photo reaches.
  function sampleLimits(g) {
    const s = g.H * PHOTO.heightToScreen / PHOTO.h;
    return {
      s,
      min: REEF.bearing + (g.cx - PHOTO.lighthouseX * s) / g.ppd,
      max: REEF.bearing + (g.cx + (PHOTO.w - PHOTO.lighthouseX) * s - g.W) / g.ppd,
    };
  }
  function limitHeading(th) {
    if (S.mode !== 'sample') return th;
    const lim = sampleLimits(geometry());
    return REEF.bearing + clamp(wrap(th - REEF.bearing), lim.min - REEF.bearing, lim.max - REEF.bearing);
  }

  let lastFacing = '';
  let lastScale = 0;
  function render() {
    const g = geometry();

    if (S.mode === 'sample') {
      const lim = sampleLimits(g);
      const lx = g.cx + wrap(REEF.bearing - S.h) * g.ppd;
      feed.style.width = `${PHOTO.w * lim.s}px`;
      feed.style.height = `${PHOTO.h * lim.s}px`;
      feed.style.transform = `translate(${lx - PHOTO.lighthouseX * lim.s}px, ${g.horizonY - PHOTO.horizonY * lim.s}px)`;
    }
    hline.style.top = `${g.horizonY}px`;

    // Places stay between the location block at the top and the hint at the bottom.
    const box = screen.getBoundingClientRect();
    const ceiling = topBlock.getBoundingClientRect().bottom - box.top + 12;
    const floor = (sheet.hidden ? hintBlock.getBoundingClientRect().top : sheet.getBoundingClientRect().top) - box.top - 12;

    // The leader lines were drawn for an 844 px tall screen; keep the same spacing on other heights.
    const k = clamp(g.H / 844, 0.7, 1.15);
    if (k !== lastScale) {
      for (const l of leads) l.style.height = `${Math.round(Number(l.dataset.lead) * k)}px`;
      lastScale = k;
    }

    let reefX = null, reefY = null;
    for (const m of markers) {
      const id = m.dataset.place, pl = PLACES[id];
      const b = pl.follow != null ? S.h + pl.follow : pl.bearing;
      const x = g.cx + wrap(b - S.h) * g.ppd;
      let y = g.horizonY - pl.elev * g.ppd;
      if (id === 'carysfort-reef') { reefX = x; reefY = y; }
      let visible = x > -40 && x < g.W + 40;
      if (visible) {
        m.hidden = false;
        const dot = m.querySelector('.dot');
        const anchor = dot.offsetTop + dot.offsetHeight / 2;
        if (pl.follow != null) y = clamp(y, ceiling + anchor, floor);
        visible = y - anchor >= ceiling && y <= floor;
        if (visible) m.style.transform = `translate(${Math.round(x - m.offsetWidth / 2)}px, ${Math.round(y - anchor)}px)`;
      }
      m.hidden = !visible;
    }

    const off = reefX < -40 || reefX > g.W + 40;
    edge.hidden = !off || !sheet.hidden;
    if (off) {
      const side = reefX < 0 ? 'left' : 'right';
      edge.classList.toggle('left', side === 'left');
      edge.classList.toggle('right', side === 'right');
      edge.style.top = `${clamp(reefY - 18, ceiling, floor - 36)}px`;
      edge.setAttribute('aria-label', `Carysfort Reef is to your ${side}`);
    }

    const f = `Facing ${dir8(S.h)}`;
    if (f !== lastFacing) { facing.textContent = f; lastFacing = f; }
  }

  function tick() {
    if (S.compass) S.h = (S.h + wrap(S.th - S.h) * 0.2 + 360) % 360;
    else S.h = S.th;
    S.p += (S.tp - S.p) * 0.2;
    render();
    requestAnimationFrame(tick);
  }

  function updateText() {
    note.textContent = S.mode === 'live' ? 'Demo location' : 'Demo location, sample view';
    let t;
    if (S.hintOverride) t = S.hintOverride;
    else if (S.mode === 'live' && S.compass) t = "Tap a place to see NOAA's work there.";
    else if (S.mode === 'live') t = 'Drag to line up the places with the view.';
    else t = 'Drag to look around, then tap a place.';
    hint.textContent = t;

    const needCompass = S.mode === 'live' && !S.compass && typeof window.DeviceOrientationEvent?.requestPermission === 'function';
    startBtn.hidden = !(canCamera && isTouch) || (S.mode === 'live' && !needCompass);
    startLabel.textContent = S.mode === 'live' ? 'Turn on the compass' : 'Turn on the camera';
  }

  function onOrient(e) {
    let hd = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) hd = e.webkitCompassHeading;
    else if (e.absolute === true && e.alpha != null) hd = compassFromEuler(e.alpha, e.beta, e.gamma);
    if (hd != null && S.mode === 'live') {
      S.th = hd;
      if (!S.compass) { S.compass = true; S.h = hd; S.hintOverride = ''; updateText(); }
    }
    if (e.beta != null && S.mode === 'live') S.tp = clamp(e.beta - 90, -60, 60);
  }
  addEventListener('deviceorientationabsolute', onOrient);
  addEventListener('deviceorientation', onOrient);

  async function startCamera(auto) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      video.srcObject = stream;
      await video.play();
      S.stream = stream;
      S.mode = 'live';
      screen.dataset.mode = 'live';
      S.hintOverride = '';
      try { sessionStorage.setItem('horizon:live', '1'); } catch (_) { /* private mode */ }
      updateText();
      return true;
    } catch (_) {
      if (!auto) { S.hintOverride = 'Camera is off. Showing a sample view.'; updateText(); }
      return false;
    }
  }

  startBtn.addEventListener('click', async () => {
    const DOE = window.DeviceOrientationEvent;
    const motion = DOE && typeof DOE.requestPermission === 'function'
      ? DOE.requestPermission().catch(() => 'denied')
      : Promise.resolve('granted');
    if (S.mode !== 'live') await startCamera(false);
    await motion;
    setTimeout(updateText, 1500);
  });

  // Look around by dragging (sample view, or a camera without a compass).
  screen.addEventListener('pointerdown', (e) => {
    if (S.compass || e.target.closest('button, a, .sheet, .tabs')) return;
    S.drag = { x: e.clientX, th: S.th, id: e.pointerId };
    screen.setPointerCapture(e.pointerId);
  });
  screen.addEventListener('pointermove', (e) => {
    if (!S.drag || e.pointerId !== S.drag.id) return;
    S.th = limitHeading(S.drag.th - (e.clientX - S.drag.x) / geometry().ppd);
  });
  const endDrag = () => { S.drag = null; };
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);
  screen.addEventListener('keydown', (e) => {
    if (e.target !== screen || S.compass) return;
    if (e.key === 'ArrowLeft') { S.th = limitHeading(S.th - 5); e.preventDefault(); }
    if (e.key === 'ArrowRight') { S.th = limitHeading(S.th + 5); e.preventDefault(); }
  });

  // Place previews. The open place lives in the URL hash, so Back closes it.
  function sheetIs(id) { return !sheet.hidden && sheet.dataset.place === id; }

  function openSheet(id) {
    const tpl = document.getElementById(`tpl-${id}`);
    if (!tpl) { closeSheet(); return; }
    sheetBody.replaceChildren(tpl.content.cloneNode(true));
    sheet.dataset.place = id;
    const d = sheetBody.querySelector('[data-distance]');
    if (d && PLACES[id].miles != null) d.textContent = `About ${Math.round(PLACES[id].miles)} mi ${dir8(PLACES[id].bearing)}`;
    sheet.hidden = false;
    screen.classList.add('has-sheet');
    for (const m of markers) {
      const on = m.dataset.place === id;
      m.classList.toggle('on', on);
      m.setAttribute('aria-expanded', String(on));
    }
    sheetBody.querySelector('h2')?.focus({ preventScroll: true });
    if (id === 'weather') loadForecast();
  }
  function closeSheet() {
    const was = sheet.dataset.place;
    if (!sheet.hidden && was && sheet.contains(document.activeElement)) {
      document.querySelector(`.mk[data-place="${was}"]`)?.focus({ preventScroll: true });
    }
    sheet.hidden = true;
    delete sheet.dataset.place;
    screen.classList.remove('has-sheet');
    for (const m of markers) { m.classList.remove('on'); m.setAttribute('aria-expanded', 'false'); }
  }
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (PLACES[id]) openSheet(id); else closeSheet();
  }
  function dismiss() {
    if (S.pushed) { history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    closeSheet();
  }
  function select(id) {
    if (location.hash === `#${id}`) return;
    S.pushed = true;
    location.hash = id;
  }

  for (const m of markers) m.addEventListener('click', () => select(m.dataset.place));
  edge.addEventListener('click', () => {
    if (!S.compass) S.th = limitHeading(REEF.bearing - LIGHTHOUSE_OFFSET);
    select('carysfort-reef');
  });
  $('#close').addEventListener('click', dismiss);
  $('#tab-view').addEventListener('click', (e) => { e.preventDefault(); if (!sheet.hidden) dismiss(); });
  addEventListener('hashchange', () => { if (!location.hash) S.pushed = false; route(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) dismiss(); });

  // Live forecast for the viewer's spot, from the National Weather Service.
  const FORECAST_KEY = 'horizon:forecast';
  async function getJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/geo+json' } });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  async function loadForecast() {
    const what = sheetBody.querySelector('[data-forecast]');
    const when = sheetBody.querySelector('[data-period]');
    try {
      let f = null;
      try {
        const c = JSON.parse(sessionStorage.getItem(FORECAST_KEY) || 'null');
        if (c && Date.now() - c.at < 20 * 60 * 1000) f = c.f;
      } catch (_) { /* no storage */ }
      if (!f) {
        const pt = await getJSON(`https://api.weather.gov/points/${VIEWER.lat.toFixed(4)},${VIEWER.lon.toFixed(4)}`);
        const fc = await getJSON(pt.properties.forecast);
        const p = fc.properties.periods[0];
        f = { name: p.name, temp: p.temperature, unit: p.temperatureUnit, short: p.shortForecast, day: p.isDaytime };
        try { sessionStorage.setItem(FORECAST_KEY, JSON.stringify({ at: Date.now(), f })); } catch (_) { /* no storage */ }
      }
      if (!sheetIs('weather')) return;
      what.textContent = f.short.charAt(0).toUpperCase() + f.short.slice(1).toLowerCase();
      when.textContent = `${f.name}, ${f.day ? 'high' : 'low'} ${f.temp}°${f.unit}`;
    } catch (_) {
      if (!sheetIs('weather')) return;
      what.textContent = "The forecast didn't load";
      when.textContent = 'Try again in a moment.';
    }
  }

  // Coming back to the page: pick the camera up again if it was on.
  addEventListener('pageshow', (e) => {
    const track = S.stream && S.stream.getVideoTracks()[0];
    if (e.persisted && S.mode === 'live' && (!track || track.readyState === 'ended')) startCamera(true);
  });

  // Opening or refreshing the app always starts on the sample view. The camera comes back on by itself
  // only when you return from a story you opened from the camera.
  let wasLive = false;
  try { wasLive = sessionStorage.getItem('horizon:live') === '1'; } catch (_) { /* no storage */ }
  const navType = performance.getEntriesByType('navigation')[0]?.type || 'navigate';
  let fromStory = false;
  try { fromStory = new URL(document.referrer).pathname.endsWith('/horizon/back-to-the-reef.html'); } catch (_) { /* no referrer */ }
  const returning = navType === 'back_forward' || (navType === 'navigate' && fromStory);
  if (wasLive && canCamera && returning) startCamera(true).then(() => setTimeout(updateText, 1500));
  else { try { sessionStorage.removeItem('horizon:live'); } catch (_) { /* no storage */ } }

  updateText();
  route();
  requestAnimationFrame(tick);
})();
