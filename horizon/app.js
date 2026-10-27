'use strict';

(() => {
  const G = window.HorizonGeo;
  const NWS = window.HorizonNWS;
  const SANCTUARIES = window.HorizonSanctuaries || [];
  const DEMO = G.DEMO;

  // bearing/elev in degrees. `follow` pins a place to the sky in front of you, whichever way you face.
  // `near` shows a place only when you are within `radius` miles of it.
  // Places found around you (weather stations, radar, the nearest sanctuary) are added with `found: true`.
  const PLACES = {
    'carysfort-reef': { lat: 25.2219472, lon: -80.21145, elev: 0, name: 'Carysfort Reef', short: 'Carysfort Reef', what: 'Coral restoration' },
    'florida-keys-sanctuary': { bearing: 77, elev: -1.3, near: { lat: DEMO.lat, lon: DEMO.lon, radius: 40 }, name: 'Florida Keys sanctuary', short: 'Florida Keys sanctuary', what: 'Marine sanctuary' },
    'weather': { follow: -6.5, elev: 11, name: 'Weather for this sky', short: 'Weather for this sky' },
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
  const LABEL_MILES = 150;  // places found around you get a label in the view up to this far
  const LADDER = [64, 112, 160, 208]; // leader-line heights for found places, nearest first
  const LEAD_STACK = [64, 112, 160, 208]; // line lengths that set the drawing order: shorter on top

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
  const stopBtn = $('#stop');
  const edge = $('#edge');
  const edgeLabel = $('#edge-label');
  const sheet = $('#sheet');
  const sheetBody = $('#sheet-body');
  const panel = $('#nearby');
  const nbSub = $('#nb-sub');
  const nbState = $('#nb-state');
  const nbList = $('#nb-list');
  const nbRetry = $('#nb-retry');
  const tabView = $('#tab-view');
  const tabNearby = $('#tab-nearby');
  const topBlock = $('.top');
  const hintBlock = $('.hint');
  let markers = [...document.querySelectorAll('.mk')];
  let leads = [...document.querySelectorAll('.lead[data-lead]')];

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
    const moved = !S.viewer || NWS.spot(S.viewer) !== NWS.spot(v);
    S.viewer = v;
    if (moved) clearFound();
    refreshPlaces();
    G.saveViewer(v);
    updateText();
    if (!sheet.hidden) openSheet(sheet.dataset.place, false);
    if (moved && (S.mode === 'live' || !panel.hidden)) loadNearby();
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
  // Turn the view toward a place when there is no compass doing it for you.
  function faceToward(id) {
    const pl = PLACES[id];
    if (S.compass || !pl || pl.follow != null || pl.bearing == null) return;
    S.th = S.mode === 'sample' ? limitHeading(id === 'carysfort-reef' ? REEF_FROM_DEMO - LIGHTHOUSE_OFFSET : pl.bearing) : pl.bearing;
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
      for (const l of leads) {
        l.style.height = `${Math.round(Number(l.dataset.lead) * k)}px`;
        // a label with a shorter line sits on top, so long lines pass behind the labels they cross
        l.parentElement.style.zIndex = String(3 + LEAD_STACK.filter((n) => Number(l.dataset.lead) <= n).length);
      }
      lastScale = k;
    }

    const at = {};
    const pills = []; // where each shown label sits, to keep the weather label clear of the others
    for (const m of markers) {
      const id = m.dataset.place, pl = PLACES[id];
      if (!pl) { m.hidden = true; continue; }
      const b = pl.follow != null ? S.h + pl.follow : pl.bearing;
      let x = g.cx + wrap(b - S.h) * g.ppd;
      let y = g.horizonY - pl.elev * g.ppd;
      at[id] = { x, y };
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
          const pw = pill.offsetWidth / 2;
          pills.push({ m, follow: pl.follow != null, x, half, anchor, l: x + shift - pw, r: x + shift + pw, t: y - anchor, b: y - anchor + pill.offsetHeight });
        }
      }
      m.hidden = !visible;
    }
    // The weather label can sit anywhere in the sky, so when it lands on another label it moves down below it.
    for (const w of pills.filter((p) => p.follow)) {
      let t = w.t;
      for (let i = 0; i < 4; i++) {
        const hit = pills.filter((p) => !p.follow && p.l < w.r + 8 && w.l < p.r + 8 && p.t < t + (w.b - w.t) + 8 && t < p.b + 8);
        if (!hit.length) break;
        t = Math.max(...hit.map((p) => p.b)) + 8;
      }
      if (t !== w.t && t + w.anchor <= floor) w.m.style.transform = `translate(${Math.round(w.x - w.half)}px, ${Math.round(t)}px)`;
    }

    // The way-finding pill points to the place you opened, or to the reef when it is near you.
    const open = !sheet.hidden ? sheet.dataset.place : null;
    let target = null;
    if (open && at[open] && PLACES[open].follow == null && !PLACES[open].away) target = open;
    else if (!open && REEF.miles <= NEAR_MILES) target = 'carysfort-reef';
    const t = target && at[target];
    const off = t && (t.x < EDGE_IN || t.x > g.W - EDGE_IN);
    edge.hidden = !off || !panel.hidden;
    if (off) {
      const side = t.x < g.cx ? 'left' : 'right';
      edge.classList.toggle('left', side === 'left');
      edge.classList.toggle('right', side === 'right');
      edge.style.top = `${clamp(t.y - 18, ceiling, floor - 36)}px`;
      edge.dataset.place = target;
      if (edgeLabel.textContent !== PLACES[target].short) edgeLabel.textContent = PLACES[target].short;
      edge.setAttribute('aria-label', `${PLACES[target].name} is to your ${side}`);
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
    stopBtn.hidden = S.mode !== 'live';
    nbSub.textContent = S.viewer.real ? `NOAA's work around ${S.viewer.name}` : `NOAA's work around ${S.viewer.name}, the demo location`;
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

  // Back to the sample photo: the camera stops and you return to the Key Largo demo spot the photo was taken from.
  function stopCamera() {
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null;
    video.srcObject = null;
    S.mode = 'sample';
    screen.dataset.mode = 'sample';
    S.compass = false;
    S.p = 0; S.tp = 0;
    S.h = S.th = REEF_FROM_DEMO - LIGHTHOUSE_OFFSET;
    S.hintOverride = '';
    try { sessionStorage.removeItem('horizon:live'); } catch (_) { /* no storage */ }
    if (location.hash) { history.replaceState(null, '', location.pathname + location.search); S.pushed = false; }
    closeSheet();
    showPanel(false);
    setViewer(DEMO);
    updateText();
    startBtn.focus({ preventScroll: true });
  }
  stopBtn.addEventListener('click', stopCamera);

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
      const pt = await NWS.points(v);
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
      if (on && c && S.mode === 'live') useLocation(c);
      else if (on && S.mode === 'live') loadNearby();
    }
    await motion;
    setTimeout(updateText, 1500);
  });

  // Look around by dragging (sample view, or a camera without a compass).
  screen.addEventListener('pointerdown', (e) => {
    if (S.compass || e.target.closest('button, a, .sheet, .tabs, .panel')) return;
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

  // Places found around you: weather stations and radar (NWS) and the nearest marine sanctuary.
  const NB = { key: null, status: 'idle', error: false, promise: null };

  function clearFound() {
    for (const id of Object.keys(PLACES)) if (PLACES[id].found) delete PLACES[id];
    NB.key = null; NB.status = 'idle'; NB.error = false;
    syncMarkers();
    renderNearby();
  }
  function nearestSanctuary(v) {
    if (!PLACES['florida-keys-sanctuary'].away) return null; // in the Keys, the water in front of you is the sanctuary
    let best = null;
    for (const s of SANCTUARIES) {
      const mi = G.miles(v, s);
      if (!best || mi < best.mi) best = { s, mi };
    }
    if (!best) return null;
    const s = best.s;
    return {
      id: `sanctuary-${s.id}`, kind: 'sanctuary', lat: s.lat, lon: s.lon,
      name: s.name, short: s.short, what: 'National marine sanctuary', office: 'National Ocean Service',
      link: s.link || null, linkText: 'Visit the sanctuary',
    };
  }

  async function loadNearby(force) {
    const v = S.viewer, key = NWS.spot(v);
    if (!force && NB.key === key && NB.status !== 'idle') return NB.promise;
    NB.key = key; NB.status = 'loading'; NB.error = false;
    renderNearby();
    NB.promise = (async () => {
      const found = [];
      const sanct = nearestSanctuary(v);
      if (sanct) found.push(sanct);
      try { found.push(...await NWS.nearby(v)); } catch (_) { NB.error = true; }
      if (NB.key !== key) return;
      for (const id of Object.keys(PLACES)) if (PLACES[id].found) delete PLACES[id];
      for (const p of found) PLACES[p.id] = { ...p, elev: 0, found: true };
      refreshPlaces();
      NB.status = 'ready';
      syncMarkers();
      renderNearby();
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && PLACES[id] && sheet.hidden && panel.hidden) route();
    })();
    return NB.promise;
  }

  // One label in the view for each found place within reach, nearest with the shortest leader line.
  function syncMarkers() {
    for (const m of document.querySelectorAll('.mk[data-found]')) m.remove();
    const found = Object.entries(PLACES)
      .filter(([, p]) => p.found && p.miles <= LABEL_MILES)
      .sort((a, b) => a[1].miles - b[1].miles);
    found.forEach(([id, p], i) => {
      const b = document.createElement('button');
      b.className = 'mk'; b.type = 'button'; b.dataset.place = id; b.dataset.found = '';
      b.setAttribute('aria-label', p.name);
      const pill = document.createElement('span'); pill.className = 'pill t-meta'; pill.textContent = p.short;
      const lead = document.createElement('span'); lead.className = 'lead'; lead.dataset.lead = String(LADDER[i % LADDER.length]);
      const dot = document.createElement('span'); dot.className = 'dot';
      b.append(pill, lead, dot);
      b.addEventListener('click', () => select(id));
      edge.before(b);
    });
    markers = [...document.querySelectorAll('.mk')];
    leads = [...document.querySelectorAll('.lead[data-lead]')];
    lastScale = 0;
  }

  const ICONS = {
    weather: '<path d="M7 18h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.2 3.2 0 0 0 7 18z"/>',
    station: '<path d="M10 13.6V5a2 2 0 0 1 4 0v8.6a4 4 0 1 1-4 0z"/><path d="M12 9v6"/>',
    radar: '<path d="M12 12l6.4-6.4"/><path d="M19.1 7.6A8.5 8.5 0 1 1 16.4 4.9"/><path d="M15.4 10.2A3.8 3.8 0 1 1 13.8 8.6"/>',
    sanctuary: '<path d="M3 9.5c1.8 0 1.8-1.5 3.6-1.5s1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5"/><path d="M3 15c1.8 0 1.8-1.5 3.6-1.5S8.4 15 10.2 15s1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5"/>',
  };
  const PHOTOS = { 'carysfort-reef': '../images/coral-replanting-carysfort.jpg', 'florida-keys-sanctuary': '../images/mangroves-aerial.jpg' };
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

  function row(id, title, line, live) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'row';
    const kind = PLACES[id].found ? PLACES[id].kind : (id === 'weather' ? 'weather' : null);
    const lead = PHOTOS[id] ? `<img src="${PHOTOS[id]}" alt="">` : `<span class="tile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind] || ICONS.sanctuary}</svg></span>`;
    b.innerHTML = `${lead}<span><b class="t-row"></b><span class="t t-meta"></span>${live ? '<span class="t t-meta now"></span>' : ''}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
    b.querySelector('b').textContent = title;
    b.querySelector('.t').textContent = line;
    if (live) b.querySelector('.now').textContent = live;
    b.addEventListener('click', () => { faceToward(id); select(id); });
    li.append(b);
    return li;
  }

  function renderNearby() {
    if (panel.hidden) return;
    nbRetry.hidden = true;
    if (NB.status === 'loading') { nbState.hidden = false; nbState.textContent = "Finding NOAA's work near you…"; }
    else nbState.hidden = true;

    const items = [];
    items.push(row('weather', 'Weather for this sky', `Forecast for ${S.viewer.name}`, NB.forecast || null));
    const places = Object.entries(PLACES)
      .filter(([id, p]) => id !== 'weather' && !p.away && (p.found || id === 'carysfort-reef' || id === 'florida-keys-sanctuary'))
      .sort((a, b) => (a[1].miles ?? 0) - (b[1].miles ?? 0));
    for (const [id, p] of places) {
      const where = p.miles != null ? lower(G.distanceText(S.viewer, p)) : 'the water in front of you';
      const live = p.kind === 'station' ? (p.reading ? `${p.reading.text}${p.reading.age ? `, ${p.reading.age}` : ''}` : 'No recent reading') : null;
      items.push(row(id, p.name, `${p.what}, ${where}`, live));
    }
    nbList.replaceChildren(...items);
    if (NB.status === 'ready' && NB.error) {
      nbState.hidden = false;
      nbState.textContent = "Weather stations and radar didn't load.";
      nbRetry.hidden = false;
    }
  }
  nbRetry.addEventListener('click', () => loadNearby(true));

  async function loadNearbyForecast() {
    try {
      const f = await NWS.forecast(S.viewer);
      NB.forecast = `${f.short}, ${f.day ? 'high' : 'low'} ${f.temp}°${f.unit}`;
    } catch (_) { NB.forecast = null; }
    renderNearby();
  }

  // Place previews and the Nearby list live in the URL hash, so Back closes them.
  function sheetIs(id) { return !sheet.hidden && sheet.dataset.place === id; }

  function openSheet(id, focus = true) {
    const pl = PLACES[id];
    const tpl = document.getElementById(pl && pl.found ? 'tpl-place' : `tpl-${id}`);
    if (!tpl || !pl || pl.away) { closeSheet(); return; }
    sheetBody.replaceChildren(tpl.content.cloneNode(true));
    sheet.dataset.place = id;
    if (pl.found) {
      sheetBody.querySelector('[data-name]').textContent = pl.name;
      sheetBody.querySelector('[data-kind]').textContent = pl.what;
      const r = sheetBody.querySelector('[data-reading]');
      if (pl.kind === 'station') r.textContent = pl.reading ? `${pl.reading.text.charAt(0).toUpperCase()}${pl.reading.text.slice(1)}${pl.reading.age ? `, ${pl.reading.age}` : ''}` : 'No recent reading';
      else r.remove();
      sheetBody.querySelector('[data-office]').textContent = pl.office;
      const a = sheetBody.querySelector('[data-link]');
      if (pl.link) { a.href = pl.link; a.textContent = pl.linkText; } else a.remove();
    }
    const d = sheetBody.querySelector('[data-distance]');
    if (d && pl.lat != null) d.textContent = G.distanceText(S.viewer, pl);
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
  function showPanel(on) {
    if (on === !panel.hidden) return;
    panel.hidden = !on;
    tabView.toggleAttribute('aria-current', !on);
    tabNearby.toggleAttribute('aria-current', on);
    if (on) {
      tabNearby.setAttribute('aria-current', 'page');
      renderNearby();
      loadNearby();
      loadNearbyForecast();
      panel.scrollTop = 0;
      $('#nb-t').focus({ preventScroll: true });
    } else {
      tabView.setAttribute('aria-current', 'page');
    }
  }
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id === 'nearby') { closeSheet(); showPanel(true); return; }
    showPanel(false);
    if (PLACES[id]) { openSheet(id); return; }
    closeSheet();
    if (/^(station|radar|sanctuary)-/.test(id)) loadNearby();
  }
  function dismiss() {
    if (S.pushed) { history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
  function select(id) {
    if (location.hash === `#${id}`) return;
    S.pushed = true;
    location.hash = id;
  }

  for (const m of markers) m.addEventListener('click', () => select(m.dataset.place));
  edge.addEventListener('click', () => {
    const id = edge.dataset.place || 'carysfort-reef';
    faceToward(id);
    if (!sheetIs(id)) select(id);
  });
  $('#close').addEventListener('click', dismiss);
  tabView.addEventListener('click', (e) => { e.preventDefault(); if (!sheet.hidden || !panel.hidden) dismiss(); });
  tabNearby.addEventListener('click', (e) => { e.preventDefault(); if (panel.hidden) select('nearby'); });
  addEventListener('hashchange', () => { if (!location.hash) S.pushed = false; route(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && (!sheet.hidden || !panel.hidden)) dismiss(); });

  async function loadForecast() {
    const what = sheetBody.querySelector('[data-forecast]');
    const when = sheetBody.querySelector('[data-period]');
    const v = S.viewer;
    try {
      const f = await NWS.forecast(v);
      if (!sheetIs('weather') || S.viewer !== v) return;
      what.textContent = f.short;
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
      else if (on) loadNearby();
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
