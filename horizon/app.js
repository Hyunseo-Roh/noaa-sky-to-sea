'use strict';

(() => {
  const G = window.HorizonGeo;
  const DEMO = G.DEMO;

  // bearing/elev in degrees. `follow` pins a place to the sky in front of you, whichever way you face.
  // `near` shows a place only when you are within `radius` miles of it.
  const PLACES = {
    'carysfort-reef': { lat: 25.2219472, lon: -80.21145, elev: 0, name: 'Carysfort Reef' },
    'florida-keys-sanctuary': { bearing: 77, elev: -1.3, near: { lat: DEMO.lat, lon: DEMO.lon, radius: 40 } },
    'weather': { follow: -6.5, elev: 11 },
  };
  const REEF = PLACES['carysfort-reef'];
  const REEF_FROM_DEMO = G.bearing(DEMO, REEF);

  // The sample photo (2400 x 1800, taken from Key Largo): where the lighthouse and the horizon sit in its pixels.
  const PHOTO = { w: 2400, h: 1800, lighthouseX: 1314, horizonY: 1115, heightToScreen: 1180 / 844 };
  const SAMPLE_FOV = 63;   // degrees across the screen height in the sample view
  const CAMERA_FOV = 60;   // degrees across the long side of the camera image
  const SAMPLE_HORIZON = 401 / 844;
  const LIGHTHOUSE_OFFSET = 2.76; // the sample view opens with the lighthouse just right of centre
  const EDGE_IN = 16;       // a place's dot must be this far inside the screen to show
  const NEAR_MILES = 100;   // only places this close get a pill at the screen edge when out of view

  const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands' };

  const $ = (s) => document.querySelector(s);
  const screen = $('#screen');
  const feed = $('#feed');
  const video = $('#live');
  const hline = $('#hline');
  const placeName = $('#place-name');
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

  const wrap = (d) => ((d % 360) + 540) % 360 - 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rad = (d) => d * Math.PI / 180;
  const deg = (r) => r * 180 / Math.PI;

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
    viewer: DEMO,          // where you stand: the phone's location, or the Key Largo demo spot
    h: REEF_FROM_DEMO - LIGHTHOUSE_OFFSET, th: REEF_FROM_DEMO - LIGHTHOUSE_OFFSET,
    p: 0, tp: 0,           // camera tilt: + is up
    compass: false,
    drag: null,
    stream: null,
    pushed: false,
    hintOverride: '',
  };

  const canCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
  const isTouch = matchMedia('(pointer: coarse)').matches;

  function refreshPlaces() {
    for (const p of Object.values(PLACES)) {
      if (p.lat != null) { p.bearing = G.bearing(S.viewer, p); p.miles = G.miles(S.viewer, p); }
      p.away = p.near ? G.miles(S.viewer, p.near) > p.near.radius : false;
    }
  }
  function setViewer(v) {
    S.viewer = v;
    refreshPlaces();
    G.saveViewer(v);
    updateText();
    if (!sheet.hidden) openSheet(sheet.dataset.place, false);
  }

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
      min: REEF_FROM_DEMO + (g.cx - PHOTO.lighthouseX * s) / g.ppd,
      max: REEF_FROM_DEMO + (g.cx + (PHOTO.w - PHOTO.lighthouseX) * s - g.W) / g.ppd,
    };
  }
  function limitHeading(th) {
    if (S.mode !== 'sample') return th;
    const lim = sampleLimits(geometry());
    return REEF_FROM_DEMO + clamp(wrap(th - REEF_FROM_DEMO), lim.min - REEF_FROM_DEMO, lim.max - REEF_FROM_DEMO);
  }

  let lastFacing = '';
  let lastScale = 0;
  function render() {
    const g = geometry();

    if (S.mode === 'sample') {
      const lim = sampleLimits(g);
      const lx = g.cx + wrap(REEF_FROM_DEMO - S.h) * g.ppd;
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
      let x = g.cx + wrap(b - S.h) * g.ppd;
      let y = g.horizonY - pl.elev * g.ppd;
      if (id === 'carysfort-reef') { reefX = x; reefY = y; }
      // A place shows while its dot is on screen; its label slides to stay whole near the edges.
      let visible = !pl.away && x >= EDGE_IN && x <= g.W - EDGE_IN;
      if (visible) {
        m.hidden = false;
        const dot = m.querySelector('.dot');
        const pill = m.querySelector('.pill');
        const anchor = dot.offsetTop + dot.offsetHeight / 2;
        const half = m.offsetWidth / 2;
        let shift = 0;
        if (pl.follow != null) {
          x = clamp(x, half + 12, g.W - half - 12);
          y = clamp(y, ceiling + anchor, floor);
        } else {
          shift = clamp(x, half + 8, g.W - half - 8) - x;
        }
        visible = y - anchor >= ceiling && y <= floor;
        if (visible) {
          m.style.transform = `translate(${Math.round(x - half)}px, ${Math.round(y - anchor)}px)`;
          pill.style.transform = shift ? `translateX(${Math.round(shift)}px)` : '';
        }
      }
      m.hidden = !visible;
    }

    // The way-finding pill only points to a place that is near you.
    const off = reefX < EDGE_IN || reefX > g.W - EDGE_IN;
    edge.hidden = !off || !sheet.hidden || REEF.miles > NEAR_MILES;
    if (off) {
      const side = reefX < 0 ? 'left' : 'right';
      edge.classList.toggle('left', side === 'left');
      edge.classList.toggle('right', side === 'right');
      edge.style.top = `${clamp(reefY - 18, ceiling, floor - 36)}px`;
      edge.setAttribute('aria-label', `Carysfort Reef is to your ${side}`);
    }

    const f = `Facing ${G.dir8(S.h)}`;
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
    placeName.textContent = S.viewer.name;
    if (S.mode === 'sample') note.textContent = 'Demo location, sample view';
    else note.textContent = S.viewer.real ? 'Your location' : 'Demo location';

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

  // The phone's location. If it is off or not allowed, you stay at the Key Largo demo spot.
  function requestLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
      );
    });
  }
  async function useLocation(c) {
    const v = { lat: c.lat, lon: c.lon, real: true, name: c.name || G.coordsName(c) };
    setViewer(v);
    if (c.name) return;
    try {
      const pt = await points(v);
      if (pt.city && S.viewer === v) setViewer({ ...v, name: pt.city });
    } catch (_) { /* outside the NWS area: keep the coordinates */ }
  }

  startBtn.addEventListener('click', async () => {
    const DOE = window.DeviceOrientationEvent;
    const motion = DOE && typeof DOE.requestPermission === 'function'
      ? DOE.requestPermission().catch(() => 'denied')
      : Promise.resolve('granted');
    if (S.mode !== 'live') {
      const where = requestLocation();
      const on = await startCamera(false);
      const c = await where;
      if (on && c) useLocation(c);
    }
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

  function openSheet(id, focus = true) {
    const tpl = document.getElementById(`tpl-${id}`);
    if (!tpl || (PLACES[id] && PLACES[id].away)) { closeSheet(); return; }
    sheetBody.replaceChildren(tpl.content.cloneNode(true));
    sheet.dataset.place = id;
    const d = sheetBody.querySelector('[data-distance]');
    if (d && PLACES[id].lat != null) d.textContent = G.distanceText(S.viewer, PLACES[id]);
    const when = sheetBody.querySelector('[data-period]');
    if (when) when.textContent = S.viewer.name;
    const link = sheetBody.querySelector('[data-forecast-link]');
    if (link) link.href = `https://forecast.weather.gov/MapClick.php?lat=${S.viewer.lat.toFixed(4)}&lon=${S.viewer.lon.toFixed(4)}`;
    sheet.hidden = false;
    screen.classList.add('has-sheet');
    for (const m of markers) {
      const on = m.dataset.place === id;
      m.classList.toggle('on', on);
      m.setAttribute('aria-expanded', String(on));
    }
    if (focus) sheetBody.querySelector('h2')?.focus({ preventScroll: true });
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
    if (!S.compass) S.th = S.mode === 'sample' ? limitHeading(REEF_FROM_DEMO - LIGHTHOUSE_OFFSET) : REEF.bearing;
    select('carysfort-reef');
  });
  $('#close').addEventListener('click', dismiss);
  $('#tab-view').addEventListener('click', (e) => { e.preventDefault(); if (!sheet.hidden) dismiss(); });
  addEventListener('hashchange', () => { if (!location.hash) S.pushed = false; route(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) dismiss(); });

  // National Weather Service: the town name and the forecast for where you stand.
  async function getJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/geo+json' } });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  const cacheGet = (key, maxAge) => {
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.at < maxAge) return c.v;
    } catch (_) { /* no storage */ }
    return null;
  };
  const cacheSet = (key, v) => { try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch (_) { /* no storage */ } };
  const spot = (v) => `${v.lat.toFixed(3)},${v.lon.toFixed(3)}`;

  async function points(v) {
    const key = `horizon:points:${spot(v)}`;
    const hit = cacheGet(key, 24 * 60 * 60 * 1000);
    if (hit) return hit;
    const pt = await getJSON(`https://api.weather.gov/points/${v.lat.toFixed(4)},${v.lon.toFixed(4)}`);
    const rl = pt.properties.relativeLocation && pt.properties.relativeLocation.properties;
    const out = { forecast: pt.properties.forecast, city: rl && rl.city ? `${rl.city}, ${STATES[rl.state] || rl.state}` : null };
    cacheSet(key, out);
    return out;
  }

  async function loadForecast() {
    const what = sheetBody.querySelector('[data-forecast]');
    const when = sheetBody.querySelector('[data-period]');
    const v = S.viewer;
    try {
      const key = `horizon:forecast:${spot(v)}`;
      let f = cacheGet(key, 20 * 60 * 1000);
      if (!f) {
        const pt = await points(v);
        const fc = await getJSON(pt.forecast);
        const p = fc.properties.periods[0];
        f = { name: p.name, temp: p.temperature, unit: p.temperatureUnit, short: p.shortForecast, day: p.isDaytime };
        cacheSet(key, f);
      }
      if (!sheetIs('weather') || S.viewer !== v) return;
      what.textContent = f.short.charAt(0).toUpperCase() + f.short.slice(1).toLowerCase();
      when.textContent = `${f.name}, ${f.day ? 'high' : 'low'} ${f.temp}°${f.unit} ${/^-?\d/.test(v.name) ? 'at' : 'in'} ${v.name}`;
    } catch (_) {
      if (!sheetIs('weather') || S.viewer !== v) return;
      what.textContent = "The forecast didn't load";
      when.textContent = 'National Weather Service forecasts cover the United States. Try again in a moment.';
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
  const saved = G.savedViewer();
  if (wasLive && canCamera && returning) {
    startCamera(true).then((on) => {
      if (on && saved) useLocation(saved);
      setTimeout(updateText, 1500);
    });
  } else {
    try { sessionStorage.removeItem('horizon:live'); } catch (_) { /* no storage */ }
    G.saveViewer(null);
  }

  refreshPlaces();
  updateText();
  route();
  requestAnimationFrame(tick);
})();
