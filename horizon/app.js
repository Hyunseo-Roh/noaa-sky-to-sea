'use strict';

(() => {
  const G = window.HorizonGeo;
  const NWS = window.HorizonNWS;
  const SANCTUARIES = window.HorizonSanctuaries || [];
  const SUN = window.HorizonSun;
  const DEMO = G.DEMO;
  const DEMO_TZ = 'America/New_York';

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
  const nbPanel = $('#nearby');
  const svPanel = $('#saved');
  const svList = $('#sv-list');
  const svEmpty = $('#sv-empty');
  const nbSub = $('#nb-sub');
  const nbState = $('#nb-state');
  const nbList = $('#nb-list');
  const nbRetry = $('#nb-retry');
  const tabView = $('#tab-view');
  const tabNearby = $('#tab-nearby');
  const tabSaved = $('#tab-saved');
  const alertRow = $('#alert-row');
  const alertBtn = $('#alert');
  const alertLabel = $('#alert-label');
  const alertMore = $('#alert-more');
  const topBlock = $('.top');
  const hintBlock = $('.hint');
  const intro = $('#intro');
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
    at: null,              // the hash last routed, so one navigation is handled once
    next: null,            // a tab to open once Back has returned to the view
    hintOverride: '',
    alerts: [], alertsKey: null, alertsFailed: false,
    tz: DEMO_TZ,           // the time zone where you stand, for sunrise, sunset and tide times
  };
  const anyPanel = () => !nbPanel.hidden || !svPanel.hidden;

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
    if (moved && (S.mode === 'live' || !nbPanel.hidden)) loadNearby();
    if (moved) { loadAlerts(); loadTimeZone(v); }
  }
  function loadTimeZone(v) {
    S.tz = v === DEMO ? DEMO_TZ : null;
    updateSun();
    if (v === DEMO) return;
    NWS.points(v).then((pt) => {
      if (NWS.spot(S.viewer) !== NWS.spot(v) || !pt.tz || pt.tz === S.tz) return;
      S.tz = pt.tz;
      updateSun(true);
    }, () => { /* outside the NWS area: the phone's own time zone */ });
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
    const below = !intro.hidden ? intro : !sheet.hidden ? sheet : hintBlock;
    const floor = below.getBoundingClientRect().top - box.top - 12;

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
        const lead = m.querySelector('.lead');
        let anchor = dot.offsetTop + dot.offsetHeight / 2;
        const half = m.offsetWidth / 2;
        let shift = 0;
        if (pl.follow != null) {
          x = clamp(x, half + 12, g.W - half - 12);
          y = clamp(y, ceiling + anchor, floor);
        } else {
          shift = clamp(x, half + 8, g.W - half - 8) - x;
          // When the label would reach into the header, its line gets shorter instead of the place disappearing.
          const base = Math.round(Number(lead.dataset.lead) * k);
          const full = anchor - lead.offsetHeight + base;
          const lh = y - full < ceiling ? Math.max(24, base - Math.ceil(ceiling - (y - full))) : base;
          if (lh !== lead.offsetHeight) lead.style.height = `${lh}px`;
          anchor = full - base + lh;
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
      const ph = w.b - w.t;
      for (let i = 0; i < 4; i++) {
        // another label touching this label, or crossing its line and dot
        const hit = pills.filter((p) => !p.follow && (
          (p.l < w.r + 8 && w.l < p.r + 8 && p.t < t + ph + 8 && t < p.b + 8) ||
          (p.l < w.x + 10 && w.x - 10 < p.r && p.t < t + w.anchor + 10 && t + ph < p.b)));
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
    edge.hidden = !off || anyPanel();
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
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    S.at = location.hash;
    closeSheet();
    showPanel(null);
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
    return best ? sanctuaryPlace(best.s) : null;
  }
  function sanctuaryPlace(s) {
    return {
      id: `sanctuary-${s.id}`, kind: 'sanctuary', lat: s.lat, lon: s.lon,
      name: s.name, short: s.short, what: 'National marine sanctuary', office: 'National Ocean Service',
      link: s.link || null, linkText: 'Visit the sanctuary',
    };
  }
  // The weather follows you, so a saved or shared weather is the forecast for one spot.
  const forecastId = (v) => `forecast-${NWS.spot(v)}`;
  // A forecast for the spot you stand on is "where you are", not "about 1 mi north".
  const isHere = (p) => p.kind === 'forecast' && G.miles(S.viewer, p) < 2;
  function forecastPlace(v, name) {
    const n = name || (v.name ? `Weather ${/^-?\d/.test(v.name) ? 'at' : 'in'} ${v.name}` : `Weather at ${G.coordsName(v)}`);
    return {
      id: forecastId(v), kind: 'forecast', lat: v.lat, lon: v.lon, name: n, short: n,
      what: 'Forecast', office: 'National Weather Service',
      link: `https://forecast.weather.gov/MapClick.php?lat=${v.lat.toFixed(4)}&lon=${v.lon.toFixed(4)}`, linkText: 'See the full forecast',
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
      const [near, tide] = await Promise.all([
        NWS.nearby(v).catch(() => { NB.error = true; return []; }),
        NWS.tides(v).catch(() => null),
      ]);
      found.push(...near);
      if (tide && G.miles(v, tide) <= NEAR_MILES) found.push(tide);
      if (NB.key !== key) return;
      for (const id of Object.keys(PLACES)) if (PLACES[id].found) delete PLACES[id];
      for (const p of found) PLACES[p.id] = { ...p, elev: 0, found: true };
      refreshPlaces();
      NB.status = 'ready';
      syncMarkers();
      renderNearby();
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && PLACES[id] && sheet.hidden && !anyPanel()) route();
    })();
    return NB.promise;
  }

  // One label in the view for each found place within reach, nearest with the shortest leader line.
  function syncMarkers() {
    for (const m of document.querySelectorAll('.mk[data-found]')) m.remove();
    const found = Object.entries(PLACES)
      .filter(([, p]) => p.found && p.miles <= LABEL_MILES)
      .sort((a, b) => a[1].miles - b[1].miles);
    const sun = Object.entries(PLACES).filter(([, p]) => p.sun);
    // Labels near each other in direction get different line lengths, so they stack instead of overlapping.
    const taken = Object.entries(PLACES)
      .filter(([id, p]) => !p.found && !p.sun && p.bearing != null && !p.away && document.querySelector(`.mk[data-place="${id}"] .lead`))
      .map(([id, p]) => ({ b: p.bearing, len: Number(document.querySelector(`.mk[data-place="${id}"] .lead`).dataset.lead) }));
    const lineFor = (p) => {
      const near = taken.filter((t) => Math.abs(wrap(t.b - p.bearing)) < 24).map((t) => t.len);
      const len = LADDER.find((l) => near.every((n) => Math.abs(n - l) >= 40)) ?? LADDER[near.length % LADDER.length];
      taken.push({ b: p.bearing, len });
      return len;
    };
    [...found, ...sun].forEach(([id, p]) => {
      const b = document.createElement('button');
      b.className = 'mk'; b.type = 'button'; b.dataset.place = id; b.dataset.found = '';
      b.setAttribute('aria-label', p.name);
      const pill = document.createElement('span'); pill.className = 'pill t-meta'; pill.textContent = p.short;
      const lead = document.createElement('span'); lead.className = 'lead'; lead.dataset.lead = String(lineFor(p));
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
    alert: '<path d="M12 4.2l8.6 15.3H3.4z"/><path d="M12 10v4.4M12 16.9v.2"/>',
    sun: '<path d="M7.5 17a4.5 4.5 0 0 1 9 0"/><path d="M3 17h18"/><path d="M12 7.5v2M6.2 10.2l1.4 1.4M17.8 10.2l-1.4 1.4"/>',
    tide: '<path d="M3 18c1.8 0 1.8-1.5 3.6-1.5s1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5"/><path d="M12 13V4.5M9 7.5l3-3 3 3"/>',
    sanctuary: '<path d="M3 9.5c1.8 0 1.8-1.5 3.6-1.5s1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5"/><path d="M3 15c1.8 0 1.8-1.5 3.6-1.5S8.4 15 10.2 15s1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5"/>',
  };
  const PHOTOS = { 'carysfort-reef': '../images/coral-replanting-carysfort.jpg', 'florida-keys-sanctuary': '../images/mangroves-aerial.jpg', 'sanctuary-florida-keys': '../images/mangroves-aerial.jpg' };
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const readingText = (r) => `${r.text}${r.age ? `, ${r.age}` : ''}`;
  const forecastText = (f) => `${f.short}, ${f.day ? 'high' : 'low'} ${f.temp}°${f.unit}`;

  // Clock times in the time zone where you stand: "7:05 AM", or "7:05 AM PDT" with the zone.
  function clock(date, tz, zone) {
    const o = { hour: 'numeric', minute: '2-digit' };
    if (zone) o.timeZoneName = 'short';
    try { return new Intl.DateTimeFormat('en-US', { ...o, timeZone: tz || undefined }).format(date); } catch (_) { return new Intl.DateTimeFormat('en-US', o).format(date); }
  }
  // "today", "tomorrow" or the weekday, where you stand.
  function dayWord(date, tz) {
    const f = (x) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, year: 'numeric', month: 'numeric', day: 'numeric' }).format(x); } catch (_) { return x.toDateString(); } };
    if (f(date) === f(new Date())) return 'today';
    if (f(date) === f(new Date(Date.now() + 864e5))) return 'tomorrow';
    try { return new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, weekday: 'long' }).format(date); } catch (_) { return ''; }
  }
  // "Rising. High tide 6.7 ft at 9:56 AM, then low tide 1.8 ft at 4:10 PM"
  function tideText(p) {
    const now = Date.now();
    const next = (p.predictions || []).filter((x) => Date.parse(x.t) > now);
    if (!next.length) return null;
    const tz = p.tz || S.tz;
    const zone = !!p.tz && p.tz !== S.tz; // a station in another time zone says which
    const w = (x) => {
      const d = new Date(x.t), dw = dayWord(d, tz);
      return `${x.type === 'H' ? 'high' : 'low'} tide ${x.v} ft at ${clock(d, tz, zone)}${dw === 'today' ? '' : ` ${dw}`}`;
    };
    const [a, b] = next;
    return `${a.type === 'H' ? 'Rising' : 'Falling'}. ${capital(w(a))}${b ? `, then ${w(b)}` : ''}`;
  }

  // Sunrise and sunset sit on the horizon in their real direction, with their time.
  function updateSun(force) {
    const v = S.viewer;
    const n = SUN.next(new Date(), v.lat, v.lon);
    let changed = !!force;
    for (const [id, e, label] of [['sunrise', n.rise, 'Sunrise'], ['sunset', n.set, 'Sunset']]) {
      if (!e) { if (PLACES[id]) { delete PLACES[id]; changed = true; } continue; }
      const short = `${label} ${clock(e.at, S.tz)}`;
      const old = PLACES[id];
      if (!old || old.short !== short || Math.abs(old.bearing - e.az) > 0.05) changed = true;
      PLACES[id] = { kind: 'sun', sun: true, bearing: e.az, elev: 0, name: label, short, at: e.at, daylight: e.daylight };
    }
    if (!changed) return;
    syncMarkers();
    const open = sheet.dataset.place;
    if (!sheet.hidden && (open === 'sunrise' || open === 'sunset')) openSheet(open, false);
    renderNearby();
  }
  setInterval(() => { if (!document.hidden) updateSun(); }, 60 * 1000);

  function row(id, title, line, live, kind, face = true) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'row';
    if (kind === undefined) kind = PLACES[id] && PLACES[id].found ? PLACES[id].kind : (id === 'weather' ? 'weather' : null);
    if (kind === 'forecast') kind = 'weather';
    const lead = PHOTOS[id] ? `<img src="${PHOTOS[id]}" alt="">` : `<span class="tile${kind === 'alert' ? ' is-alert' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind] || ICONS.sanctuary}</svg></span>`;
    b.innerHTML = `${lead}<span><b class="t-row"></b><span class="t t-meta"></span>${live ? '<span class="t t-meta now"></span>' : ''}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
    b.querySelector('b').textContent = title;
    b.querySelector('.t').textContent = line;
    if (live) b.querySelector('.now').textContent = live;
    b.addEventListener('click', () => { if (face) faceToward(id); select(id); });
    li.append(b);
    return li;
  }
  function setLive(li, text) {
    const n = li.querySelector('.now');
    if (n) n.textContent = text;
  }

  function renderNearby() {
    if (nbPanel.hidden) return;
    nbRetry.hidden = true;
    if (NB.status === 'loading') { nbState.hidden = false; nbState.textContent = "Finding NOAA's work near you…"; }
    else nbState.hidden = true;

    const items = [];
    for (const a of S.alerts) items.push(row(a.id, a.name, `${a.ends ? capital(untilText(a.ends, a.tz)) : 'In effect now'}, National Weather Service`, null, 'alert', false));
    items.push(row('weather', 'Weather for this sky', `Forecast for ${S.viewer.name}`, NB.forecast || null));
    for (const id of ['sunrise', 'sunset'].filter((k) => PLACES[k]).sort((a, b) => PLACES[a].at - PLACES[b].at)) {
      const p = PLACES[id];
      items.push(row(id, p.name, `${capital(dayWord(p.at, S.tz))} at ${clock(p.at, S.tz)}, toward the ${G.dir8(p.bearing)}`, null, 'sun'));
    }
    const places = Object.entries(PLACES)
      .filter(([id, p]) => id !== 'weather' && !p.away && (p.found || id === 'carysfort-reef' || id === 'florida-keys-sanctuary'))
      .sort((a, b) => (a[1].miles ?? 0) - (b[1].miles ?? 0));
    for (const [id, p] of places) {
      const where = p.miles != null ? lower(G.distanceText(S.viewer, p)) : 'the water in front of you';
      const live = p.kind === 'station' ? (p.reading ? readingText(p.reading) : 'No recent reading') : p.kind === 'tide' ? tideText(p) : null;
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
      NB.forecast = forecastText(f);
    } catch (_) { NB.forecast = null; }
    renderNearby();
  }

  // Place previews and the Nearby list live in the URL hash, so Back closes them.
  function sheetIs(id) { return !sheet.hidden && sheet.dataset.place === id; }

  function openSheet(id, focus = true) {
    const pl = PLACES[id];
    const generic = pl && (pl.found || pl.kept || pl.sun);
    const tpl = document.getElementById(pl && pl.alert ? 'tpl-alert' : generic ? 'tpl-place' : `tpl-${id}`);
    if (!tpl || !pl || pl.away) { closeSheet(); return; }
    sheetBody.replaceChildren(tpl.content.cloneNode(true));
    sheet.dataset.place = id;
    sheet.dataset.kind = pl.alert ? 'alert' : (pl.kind || id);
    if (pl.alert) fillAlert(pl);
    else if (pl.sun) {
      const dw = dayWord(pl.at, S.tz);
      const mins = Math.round(pl.daylight);
      sheetBody.querySelector('[data-name]').textContent = pl.name;
      sheetBody.querySelector('[data-kind]').textContent = `${capital(dw)} at ${clock(pl.at, S.tz, true)}`;
      sheetBody.querySelector('[data-distance]').textContent = `Toward the ${G.dir8(pl.bearing)}, ${Math.round(pl.bearing)}°`;
      sheetBody.querySelector('[data-reading]').textContent = `${Math.floor(mins / 60)} h ${mins % 60} min of daylight ${dw === 'today' || dw === 'tomorrow' ? dw : `on ${dw}`}`;
      sheetBody.querySelector('[data-office]').textContent = 'Global Monitoring Laboratory';
      const a = sheetBody.querySelector('[data-link]');
      a.href = 'https://gml.noaa.gov/grad/solcalc/';
      a.textContent = "Open NOAA's solar calculator";
    } else if (generic) {
      sheetBody.querySelector('[data-name]').textContent = pl.name;
      sheetBody.querySelector('[data-kind]').textContent = pl.what;
      const r = sheetBody.querySelector('[data-reading]');
      if (pl.kind === 'station') {
        if (pl.reading || !pl.kept) r.textContent = pl.reading ? capital(readingText(pl.reading)) : 'No recent reading';
        else {
          r.textContent = 'Loading the latest reading…';
          NWS.latest(pl.code).then((x) => { if (sheetIs(id)) r.textContent = x ? capital(readingText(x)) : 'No recent reading'; });
        }
      } else if (pl.kind === 'tide') {
        const t = tideText(pl);
        if (t) r.textContent = t;
        else if (pl.kept) {
          r.textContent = 'Loading the tides…';
          NWS.tideStation(pl.code).then(
            (x) => { pl.predictions = x.predictions; pl.tz = x.tz; if (sheetIs(id)) r.textContent = tideText(x) || 'No tide predictions right now'; },
            () => { if (sheetIs(id)) r.textContent = "The tides didn't load. Try again in a moment."; },
          );
        } else r.textContent = 'No tide predictions right now';
      } else if (pl.kind === 'forecast') {
        r.textContent = 'Loading the forecast…';
        NWS.forecast(pl).then(
          (f) => { if (sheetIs(id)) r.textContent = `${f.name}: ${lower(forecastText(f))}`; },
          () => { if (sheetIs(id)) r.textContent = "The forecast didn't load. Try again in a moment."; },
        );
      } else r.remove();
      sheetBody.querySelector('[data-office]').textContent = pl.office || 'NOAA';
      const a = sheetBody.querySelector('[data-link]');
      if (pl.link) { a.href = pl.link; a.textContent = pl.linkText; } else a.remove();
    }
    if (!pl.alert && !pl.sun) { sheetBody.append(actions()); syncActs(); }
    const d = sheetBody.querySelector('[data-distance]');
    if (d && pl.lat != null) d.textContent = isHere(pl) ? 'Where you are' : G.distanceText(S.viewer, pl);
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
    if (id === 'weather') { loadForecast(); alertsLine(); }
  }
  function closeSheet() {
    const was = sheet.dataset.place;
    if (!sheet.hidden && was && sheet.contains(document.activeElement)) {
      document.querySelector(`.mk[data-place="${was}"]`)?.focus({ preventScroll: true });
    }
    sheet.hidden = true;
    delete sheet.dataset.place;
    delete sheet.dataset.kind;
    screen.classList.remove('has-sheet');
    for (const m of markers) { m.classList.remove('on'); m.setAttribute('aria-expanded', 'false'); }
  }
  // Nearby and Saved are lists over the view; the View tab closes them.
  function showPanel(name) {
    const cur = !nbPanel.hidden ? 'nearby' : !svPanel.hidden ? 'saved' : null;
    if (cur === (name || null)) return;
    nbPanel.hidden = name !== 'nearby';
    svPanel.hidden = name !== 'saved';
    for (const [n, t] of [['view', tabView], ['nearby', tabNearby], ['saved', tabSaved]]) {
      if (n === (name || 'view')) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    }
    if (name === 'nearby') {
      renderNearby();
      loadNearby();
      loadNearbyForecast();
      nbPanel.scrollTop = 0;
      $('#nb-t').focus({ preventScroll: true });
    }
    if (name === 'saved') {
      renderSaved();
      svPanel.scrollTop = 0;
      $('#sv-t').focus({ preventScroll: true });
    }
  }
  function route() {
    S.at = location.hash;
    closeIntro();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id === 'nearby' || id === 'saved') { closeSheet(); showPanel(id); return; }
    showPanel(null);
    if (PLACES[id]) { openSheet(id); return; }
    closeSheet();
    // a saved place or a shared link: look the place up, then open it if you are still on it
    if (id) {
      resolvePlace(id).then((p) => {
        if (p && decodeURIComponent(location.hash.slice(1)) === id && sheet.hidden && !anyPanel()) openSheet(id);
      });
    }
  }

  // Each step into a list or a preview adds one history entry, so Back closes them in turn.
  const depth = () => (history.state && history.state.d) || 0;
  function push(id) {
    history.pushState({ d: depth() + 1 }, '', `#${id}`);
    route();
  }
  function select(id) {
    if (location.hash === `#${id}`) return;
    push(id);
  }
  function dismiss() {
    if (depth() > 0) { history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
  // A tab starts from the view: go back to it first, then open the tab's list.
  function goTab(name) {
    const target = name === 'view' ? '' : name;
    if (location.hash.slice(1) === target && sheet.hidden) return;
    const d = depth();
    if (d > 0) { S.next = target; history.go(-d); return; }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (target) push(target); else route();
  }
  function nav() {
    if (S.next !== null) {
      const t = S.next;
      S.next = null;
      if (t) push(t); else route();
      return;
    }
    if (location.hash === S.at) return;
    route();
  }

  for (const m of markers) m.addEventListener('click', () => select(m.dataset.place));
  edge.addEventListener('click', () => {
    const id = edge.dataset.place || 'carysfort-reef';
    faceToward(id);
    if (!sheetIs(id)) select(id);
  });
  $('#close').addEventListener('click', dismiss);
  tabView.addEventListener('click', (e) => { e.preventDefault(); goTab('view'); });
  tabNearby.addEventListener('click', (e) => { e.preventDefault(); goTab('nearby'); });
  tabSaved.addEventListener('click', (e) => { e.preventDefault(); goTab('saved'); });
  addEventListener('popstate', nav);
  addEventListener('hashchange', nav);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!intro.hidden) closeIntro();
    else if (!sheet.hidden || anyPanel()) dismiss();
  });

  // A place you open from Saved or from a shared link, when it is not one of the places around you.
  const LINKED = /^(station|radar|sanctuary|forecast|tide)-(.+)$/;
  async function resolvePlace(id) {
    if (PLACES[id]) return PLACES[id];
    const m = id.match(LINKED);
    if (!m) return null;
    const snap = saved.find((x) => x.id === id);
    let p = null;
    try {
      if (m[1] === 'sanctuary') {
        const s = SANCTUARIES.find((x) => x.id === m[2]);
        p = s ? sanctuaryPlace(s) : null;
      } else if (m[1] === 'forecast') {
        const [lat, lon] = m[2].split(',').map(Number);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          let name = snap && snap.name;
          if (!name) {
            try { const pt = await NWS.points({ lat, lon }); if (pt.city) name = forecastPlace({ lat, lon, name: pt.city }).name; } catch (_) { /* keep the coordinates */ }
          }
          p = forecastPlace({ lat, lon }, name);
        }
      } else if (snap) p = { ...snap };
      else if (m[1] === 'station') p = await NWS.station(m[2]);
      else if (m[1] === 'radar') p = await NWS.radar(m[2]);
      else if (m[1] === 'tide') p = await NWS.tideStation(m[2]);
    } catch (_) { p = null; }
    if (PLACES[id]) return PLACES[id];
    if (!p) return null;
    PLACES[id] = { ...p, id, elev: 0, kept: true };
    refreshPlaces();
    return PLACES[id];
  }

  // Saved places stay on this phone.
  const SAVED_KEY = 'horizon:saved';
  let saved = [];
  try {
    const a = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    if (Array.isArray(a)) saved = a.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string');
  } catch (_) { /* no storage */ }
  function storeSaved() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch (_) { /* no storage */ }
  }
  // The lasting name of the place in the open preview.
  function keepId(id) {
    if (id === 'weather') return forecastId(S.viewer);
    if (id === 'florida-keys-sanctuary') return 'sanctuary-florida-keys';
    return id;
  }
  function keptPlace(id) {
    if (id === 'weather') return forecastPlace(S.viewer);
    if (id === 'florida-keys-sanctuary') {
      const s = SANCTUARIES.find((x) => x.id === 'florida-keys');
      return s ? sanctuaryPlace(s) : null;
    }
    const p = PLACES[id];
    if (!p) return null;
    if (id === 'carysfort-reef') return { id, kind: 'reef', lat: p.lat, lon: p.lon, name: p.name, short: p.short, what: p.what };
    const { id: _id, kind, code, lat, lon, name, short, what, office, link, linkText } = p;
    return { id, kind, code, lat, lon, name, short, what, office, link, linkText };
  }
  function toggleSave(id) {
    const k = keepId(id);
    const i = saved.findIndex((x) => x.id === k);
    if (i >= 0) saved.splice(i, 1);
    else {
      const p = keptPlace(id);
      if (!p) return;
      saved.unshift({ ...p, savedAt: Date.now() });
    }
    storeSaved();
    syncActs();
  }

  const ACT_ICONS = {
    save: '<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>',
    share: '<path d="M12 14.5V3.5"/><path d="M7.8 7.7L12 3.5l4.2 4.2"/><path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16"/>',
  };
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  function actions() {
    const d = document.createElement('div');
    d.className = 'acts';
    d.innerHTML = `<button class="btn secondary" type="button" data-save aria-pressed="false">${svg(ACT_ICONS.save)}<span>Save</span></button><button class="btn secondary" type="button" data-share>${svg(ACT_ICONS.share)}<span>Share</span></button>`;
    d.querySelector('[data-save]').addEventListener('click', () => toggleSave(sheet.dataset.place));
    d.querySelector('[data-share]').addEventListener('click', (e) => share(sheet.dataset.place, e.currentTarget));
    return d;
  }
  function syncActs() {
    const b = sheetBody.querySelector('[data-save]');
    if (!b || !sheet.dataset.place) return;
    const on = saved.some((x) => x.id === keepId(sheet.dataset.place));
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = on ? 'Saved' : 'Save';
  }

  // Share a place with the phone's share sheet. The link opens the same preview in Horizon.
  async function share(id, btn) {
    const p = keptPlace(id);
    if (!p) return;
    const url = new URL(`${location.pathname}#${keepId(id)}`, location.origin).href;
    const name = p.name.replace(/\u200B/g, '');
    const data = { title: name, text: `${name}, seen on Horizon.`, url };
    if (navigator.share) {
      try { await navigator.share(data); } catch (_) { /* closed without sharing */ }
      return;
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (_) { /* no clipboard */ }
    const label = btn.querySelector('span');
    label.textContent = ok ? 'Link copied' : "Couldn't copy the link";
    setTimeout(() => { if (label.isConnected) label.textContent = 'Share'; }, 2000);
  }

  function renderSaved() {
    if (svPanel.hidden) return;
    svEmpty.hidden = saved.length > 0;
    svList.hidden = saved.length === 0;
    svList.replaceChildren(...saved.map((x) => {
      const where = x.lat == null ? '' : isHere(x) ? 'where you are' : lower(G.distanceText(S.viewer, x));
      const live = x.kind === 'station' ? 'Loading the latest reading…' : x.kind === 'forecast' ? 'Loading the forecast…' : x.kind === 'tide' ? 'Loading the tides…' : null;
      const li = row(x.id, x.name, where ? `${x.what}, ${where}` : x.what, live, x.kind, false);
      if (x.kind === 'station') NWS.latest(x.code).then((r) => setLive(li, r ? readingText(r) : 'No recent reading'));
      if (x.kind === 'forecast') NWS.forecast(x).then((f) => setLive(li, forecastText(f)), () => setLive(li, "The forecast didn't load"));
      if (x.kind === 'tide') NWS.tideStation(x.code).then((t) => setLive(li, tideText(t) || 'No tide predictions right now'), () => setLive(li, "The tides didn't load"));
      return li;
    }));
  }

  // Weather alerts in effect where you are, from the National Weather Service.
  // "until 6 PM PDT", "until tomorrow 6 PM PDT", "until Thursday 6 PM PDT"; short for the banner: "until Thu 6 PM".
  function untilText(iso, tz, short) {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '';
    let zone = tz || undefined;
    const fmt = (o) => { try { return new Intl.DateTimeFormat('en-US', { ...o, timeZone: zone }).format(d); } catch (_) { zone = undefined; return new Intl.DateTimeFormat('en-US', o).format(d); } };
    const time = fmt(short ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).replace(':00', '');
    const day = (x) => new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).format(x);
    if (day(d) === day(new Date())) return `until ${time}`;
    if (day(d) === day(new Date(Date.now() + 864e5))) return `until tomorrow ${time}`;
    return `until ${fmt({ weekday: short ? 'short' : 'long' })} ${time}`;
  }
  async function loadAlerts() {
    const v = S.viewer, key = NWS.spot(v);
    let list = [], failed = false;
    try { list = await NWS.alerts(v); } catch (_) { failed = true; }
    if (NWS.spot(S.viewer) !== key) return;
    for (const id of Object.keys(PLACES)) if (PLACES[id].alert) delete PLACES[id];
    for (const a of list) PLACES[a.id] = { ...a, alert: true };
    S.alerts = list; S.alertsKey = key; S.alertsFailed = failed;
    renderAlerts();
    alertsLine();
    renderNearby();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id.startsWith('alert-') && PLACES[id] && sheet.hidden && !anyPanel()) route();
  }
  function renderAlerts() {
    const a = S.alerts[0];
    alertRow.hidden = !a;
    if (!a) return;
    alertLabel.textContent = a.ends ? `${a.name} ${untilText(a.ends, a.tz, true)}` : a.name;
    const more = S.alerts.length - 1;
    alertMore.hidden = more < 1;
    alertMore.textContent = `+${more}`;
    const full = a.ends ? `${a.name} ${untilText(a.ends, a.tz)}` : a.name;
    alertBtn.setAttribute('aria-label', more ? `${full}, and ${more} more weather alert${more > 1 ? 's' : ''}` : full);
  }
  alertBtn.addEventListener('click', () => { if (S.alerts.length) select(S.alerts.length > 1 ? 'nearby' : S.alerts[0].id); });
  function alertsLine() {
    const el = sheetIs('weather') && sheetBody.querySelector('[data-alerts]');
    if (!el || S.alertsKey !== NWS.spot(S.viewer) || S.alertsFailed) return;
    el.hidden = false;
    const n = S.alerts.length;
    el.textContent = n ? `${n} weather alert${n > 1 ? 's' : ''} in effect` : 'No weather alerts here right now';
  }
  function fillAlert(a) {
    sheetBody.querySelector('[data-name]').textContent = a.name;
    sheetBody.querySelector('[data-when]').textContent = a.ends ? capital(untilText(a.ends, a.tz)) : 'In effect now';
    const area = sheetBody.querySelector('[data-area]');
    if (a.area) area.textContent = a.area; else area.remove();
    const t = sheetBody.querySelector('[data-text]');
    if (a.what) t.textContent = a.what; else t.remove();
    const l = sheetBody.querySelector('[data-link]');
    l.href = a.link; l.textContent = a.linkText;
  }
  setInterval(() => { if (!document.hidden) loadAlerts(); }, 5 * 60 * 1000);

  // The first time you open Horizon, a short note says what it does. It is remembered on the phone.
  const INTRO_KEY = 'horizon:intro';
  function openIntro() {
    intro.hidden = false;
    screen.classList.add('has-intro');
    $('#in-t').focus({ preventScroll: true });
  }
  function closeIntro() {
    if (intro.hidden) return;
    intro.hidden = true;
    screen.classList.remove('has-intro');
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (_) { /* no storage */ }
  }
  $('#intro-go').addEventListener('click', () => {
    closeIntro();
    (startBtn.hidden ? screen : startBtn).focus({ preventScroll: true });
  });

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
  const lastWhere = G.savedViewer();
  if (wasLive && canCamera && returning) {
    startCamera(true).then((on) => {
      if (on && lastWhere) useLocation(lastWhere);
      else if (on) loadNearby();
      setTimeout(updateText, 1500);
    });
  } else {
    try { sessionStorage.removeItem('horizon:live'); } catch (_) { /* no storage */ }
    G.saveViewer(null);
  }

  refreshPlaces();
  updateText();
  updateSun(true);
  route();
  loadAlerts();
  let introSeen = false;
  try { introSeen = localStorage.getItem(INTRO_KEY) === '1'; } catch (_) { /* no storage */ }
  if (!introSeen && !location.hash && !(wasLive && canCamera && returning)) openIntro();
  requestAnimationFrame(tick);
})();
