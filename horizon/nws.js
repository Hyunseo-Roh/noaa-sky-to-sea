'use strict';

// National Weather Service data for a spot: its town, forecast, nearby weather stations and radar.
// api.weather.gov is open, needs no key and allows calls from the browser.
window.HorizonNWS = (() => {
  const G = window.HorizonGeo;
  const API = 'https://api.weather.gov';

  const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands' };

  async function getJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/geo+json' } });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  function cacheGet(key, maxAge) {
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.at < maxAge) return c.v;
    } catch (_) { /* no storage */ }
    return null;
  }
  function cacheSet(key, v) {
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch (_) { /* no storage */ }
  }
  const spot = (v) => `${v.lat.toFixed(3)},${v.lon.toFixed(3)}`;
  const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  // Station names sometimes come in capitals ("LOS ANGELES DOWNTOWN/USC"). Keep short codes like USC as they are.
  const KEEP_CAPS = /^(USC|UCLA|AFB|ARB|ANGB|NAS|NAF|MCAS|AAF|USCG|NWS|RAWS|II|III|IV)$/;
  const nameCase = (s) => (s === s.toUpperCase()
    ? s.split(/(\s+|\/|-)/).map((w) => (KEEP_CAPS.test(w) ? w : titleCase(w))).join('')
    : s);
  const FRESH_MIN = 180; // a reading older than three hours counts as no recent reading
  const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  async function points(v) {
    const key = `horizon:points3:${spot(v)}`;
    const hit = cacheGet(key, 24 * 60 * 60 * 1000);
    if (hit) return hit;
    const p = (await getJSON(`${API}/points/${v.lat.toFixed(4)},${v.lon.toFixed(4)}`)).properties;
    const rl = p.relativeLocation && p.relativeLocation.properties;
    const out = {
      forecast: p.forecast,
      stations: p.observationStations || null,
      radar: p.radarStation || null,
      city: rl && rl.city ? `${rl.city}, ${STATES[rl.state] || rl.state}` : null,
      tz: p.timeZone || null,
    };
    cacheSet(key, out);
    return out;
  }

  async function forecast(v) {
    const key = `horizon:forecast:${spot(v)}`;
    const hit = cacheGet(key, 20 * 60 * 1000);
    if (hit) return hit;
    const p = (await getJSON((await points(v)).forecast)).properties.periods[0];
    const f = { name: p.name, temp: p.temperature, unit: p.temperatureUnit, short: sentence(p.shortForecast), day: p.isDaytime };
    cacheSet(key, f);
    return f;
  }

  // A station's latest reading, in the words the app uses: "64°F, clear, wind 5 mph from the west".
  function reading(o) {
    const parts = [];
    const c = o.temperature && o.temperature.value;
    if (typeof c === 'number') parts.push(`${Math.round(c * 9 / 5 + 32)}°F`);
    if (o.textDescription) parts.push(o.textDescription.toLowerCase());
    const kmh = o.windSpeed && o.windSpeed.value;
    if (typeof kmh === 'number') {
      const mph = Math.round(kmh / 1.609344);
      const from = o.windDirection && typeof o.windDirection.value === 'number' ? ` from the ${G.dir8(o.windDirection.value)}` : '';
      parts.push(mph === 0 ? 'calm' : `wind ${mph} mph${from}`);
    }
    if (!parts.length) return null;
    const t = Date.parse(o.timestamp);
    if (Number.isNaN(t)) return null;
    const min = Math.max(1, Math.round((Date.now() - t) / 60000));
    if (min > FRESH_MIN) return null;
    const age = min < 90 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
    return { text: parts.join(', '), age };
  }

  // A station's latest reading, cached for ten minutes.
  async function latest(code) {
    const key = `horizon:obs:${code}`;
    const hit = cacheGet(key, 10 * 60 * 1000);
    if (hit) return hit.r;
    let r = null;
    try { r = reading((await getJSON(`${API}/stations/${code}/observations/latest`)).properties); } catch (_) { r = null; }
    cacheSet(key, { r });
    return r;
  }

  // a break chance after each slash, so "Burbank/Glendale/Pasadena Airport" can wrap
  const stationName = (name, code) => nameCase(name || code).replace(/\//g, '/\u200B');
  function stationPlace(s) {
    return {
      id: `station-${s.code}`, kind: 'station', code: s.code, lat: s.lat, lon: s.lon,
      name: s.name, short: `${s.name.split(/\s+-\s+|[/,]/)[0].trim()} station`,
      what: 'Weather station', office: 'National Weather Service',
      reading: s.reading, link: `https://www.weather.gov/wrh/timeseries?site=${s.code}`, linkText: "See this station's readings",
    };
  }
  function radarPlace(rd, fallback) {
    const [lon, lat] = rd.geometry.coordinates;
    const code = rd.properties.id || fallback;
    const town = rd.properties.name ? titleCase(rd.properties.name) : code;
    return {
      id: `radar-${code}`, kind: 'radar', code, lat, lon,
      name: `${town} weather radar`, short: `Radar ${code}`,
      what: rd.properties.stationType === 'TDWR' ? `Airport weather radar ${code}` : `Doppler weather radar ${code}`,
      office: 'National Weather Service',
      link: `https://radar.weather.gov/station/${code.toLowerCase()}/standard`, linkText: 'See the radar',
    };
  }

  // One station or radar by its code, for a saved place or a shared link.
  async function station(code) {
    const f = await getJSON(`${API}/stations/${encodeURIComponent(code)}`);
    const [lon, lat] = f.geometry.coordinates;
    const id = (f.properties && f.properties.stationIdentifier) || code;
    return stationPlace({ code: id, name: stationName(f.properties && f.properties.name, id), lat, lon, reading: await latest(id) });
  }
  async function radar(code) {
    const rd = await getJSON(`${API}/radar/stations/${encodeURIComponent(code)}`);
    return radarPlace(rd, code);
  }

  // The three closest weather stations that reported in the last three hours, and the radar that covers you.
  async function nearby(v) {
    const key = `horizon:nearby2:${spot(v)}`;
    const hit = cacheGet(key, 10 * 60 * 1000);
    if (hit) return hit;
    const pt = await points(v);
    const [st, rd] = await Promise.all([
      pt.stations ? getJSON(pt.stations).catch(() => null) : null,
      pt.radar ? getJSON(`${API}/radar/stations/${pt.radar}`).catch(() => null) : null,
    ]);
    const out = [];
    const seen = new Set();
    const stations = ((st && st.features) || [])
      .map((f) => {
        const [lon, lat] = (f.geometry && f.geometry.coordinates) || [];
        const code = f.properties && f.properties.stationIdentifier;
        return typeof lat === 'number' && code ? { code, name: stationName(f.properties.name, code), lat, lon } : null;
      })
      .filter((s) => s && !seen.has(s.code) && seen.add(s.code))
      .sort((a, b) => G.miles(v, a) - G.miles(v, b))
      .slice(0, 6);
    await Promise.all(stations.map(async (s) => {
      s.reading = await latest(s.code);
    }));
    // Stations that are not reporting are left out; if none is, the closest one shows with "No recent reading".
    let shown = stations.filter((s) => s.reading).slice(0, 3);
    if (!shown.length && stations.length) shown = stations.slice(0, 1);
    for (const s of shown) out.push(stationPlace(s));
    if (rd && rd.geometry && rd.properties) out.push(radarPlace(rd, pt.radar));
    cacheSet(key, out);
    return out;
  }

  // Weather alerts in effect where you are (warnings, watches, advisories), most severe first.
  const SEVERITY = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };
  const shortId = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  function alertWhat(p) {
    const d = (p.description || '').replace(/\r/g, '');
    const m = d.match(/\*\s*WHAT\.\.\.([\s\S]*?)(?:\n\s*\n|\n\*|$)/);
    let t = m ? m[1] : (d.split(/\n\s*\n/)[0] || p.headline || '');
    t = t.replace(/\s+/g, ' ').trim();
    if (t && t === t.toUpperCase()) t = sentence(t);
    return t;
  }
  async function alerts(v) {
    const key = `horizon:alerts:${spot(v)}`;
    const hit = cacheGet(key, 5 * 60 * 1000);
    if (hit) return hit;
    const fc = await getJSON(`${API}/alerts/active?point=${v.lat.toFixed(4)},${v.lon.toFixed(4)}`);
    let tz = null;
    try { tz = (await points(v)).tz; } catch (_) { /* no time zone: the phone's own is used */ }
    const now = Date.now();
    const out = ((fc && fc.features) || [])
      .map((f) => f.properties || {})
      .filter((p) => p.event && p.status === 'Actual' && p.messageType !== 'Cancel')
      .filter((p) => { const end = Date.parse(p.ends || p.expires); return Number.isNaN(end) || end > now; })
      .sort((a, b) => (SEVERITY[a.severity] ?? 4) - (SEVERITY[b.severity] ?? 4))
      .map((p) => ({
        id: `alert-${shortId(p.id || p['@id'] || p.event)}`, kind: 'alert',
        name: p.event, short: p.event, severity: p.severity || 'Unknown',
        what: alertWhat(p), area: p.areaDesc || '', ends: p.ends || p.expires || null, tz,
        office: 'National Weather Service',
        link: `https://forecast.weather.gov/MapClick.php?lat=${v.lat.toFixed(4)}&lon=${v.lon.toFixed(4)}`, linkText: 'See the full alert',
      }));
    cacheSet(key, out);
    return out;
  }

  // Tides come from NOAA's tide stations (CO-OPS) through the app's own /api/tides, which finds the nearest station.
  const TIDES = new URL('../api/tides', document.baseURI).href;
  function tidePlace(j) {
    const st = j.station;
    const town = st.name.split(',')[0].trim();
    return {
      id: `tide-${st.id}`, kind: 'tide', code: st.id, lat: st.lat, lon: st.lon,
      name: `Tides at ${st.name}`, short: `${town} tides`,
      what: 'Tide predictions', office: 'National Ocean Service',
      predictions: j.predictions || [],
      link: `https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=${encodeURIComponent(st.id)}`, linkText: 'See the tide chart',
    };
  }
  async function tidesFrom(url, key) {
    const hit = cacheGet(key, 30 * 60 * 1000);
    if (hit) return hit;
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const out = tidePlace(await r.json());
    // the station's own time zone, so its tide times read right from anywhere
    try { out.tz = (await points(out)).tz || null; } catch (_) { out.tz = null; }
    cacheSet(key, out);
    return out;
  }
  const tides = (v) => tidesFrom(`${TIDES}?lat=${v.lat.toFixed(2)}&lon=${v.lon.toFixed(2)}`, `horizon:tides:${v.lat.toFixed(2)},${v.lon.toFixed(2)}`);
  const tideStation = (id) => tidesFrom(`${TIDES}?station=${encodeURIComponent(id)}`, `horizon:tide:${id}`);

  return { points, forecast, nearby, latest, station, radar, alerts, tides, tideStation, spot };
})();
