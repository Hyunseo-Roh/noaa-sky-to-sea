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
  const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  async function points(v) {
    const key = `horizon:points2:${spot(v)}`;
    const hit = cacheGet(key, 24 * 60 * 60 * 1000);
    if (hit) return hit;
    const p = (await getJSON(`${API}/points/${v.lat.toFixed(4)},${v.lon.toFixed(4)}`)).properties;
    const rl = p.relativeLocation && p.relativeLocation.properties;
    const out = {
      forecast: p.forecast,
      stations: p.observationStations || null,
      radar: p.radarStation || null,
      city: rl && rl.city ? `${rl.city}, ${STATES[rl.state] || rl.state}` : null,
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
    let age = '';
    const t = Date.parse(o.timestamp);
    if (!Number.isNaN(t)) {
      const min = Math.max(1, Math.round((Date.now() - t) / 60000));
      age = min < 90 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
    }
    return { text: parts.join(', '), age };
  }

  // Up to three weather stations closest to you, each with its latest reading, and the radar that covers you.
  async function nearby(v) {
    const key = `horizon:nearby:${spot(v)}`;
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
        // a break chance after each slash, so "Burbank/Glendale/Pasadena Airport" can wrap
        return typeof lat === 'number' && code ? { code, name: (f.properties.name || code).replace(/\//g, '/\u200B'), lat, lon } : null;
      })
      .filter((s) => s && !seen.has(s.code) && seen.add(s.code))
      .sort((a, b) => G.miles(v, a) - G.miles(v, b))
      .slice(0, 3);
    await Promise.all(stations.map(async (s) => {
      let r = null;
      try { r = reading((await getJSON(`${API}/stations/${s.code}/observations/latest`)).properties); } catch (_) { /* no recent reading */ }
      out.push({
        id: `station-${s.code}`, kind: 'station', code: s.code, lat: s.lat, lon: s.lon,
        name: s.name, short: `${s.name.split(/[/,]/)[0].trim()} station`,
        what: 'Weather station', office: 'National Weather Service',
        reading: r, link: `https://www.weather.gov/wrh/timeseries?site=${s.code}`, linkText: "See this station's readings",
      });
    }));
    if (rd && rd.geometry && rd.properties) {
      const [lon, lat] = rd.geometry.coordinates;
      const code = rd.properties.id || pt.radar;
      const town = rd.properties.name ? titleCase(rd.properties.name) : code;
      out.push({
        id: `radar-${code}`, kind: 'radar', code, lat, lon,
        name: `${town} weather radar`, short: `Radar ${code}`,
        what: rd.properties.stationType === 'TDWR' ? `Airport weather radar ${code}` : `Doppler weather radar ${code}`,
        office: 'National Weather Service',
        link: `https://radar.weather.gov/station/${code.toLowerCase()}/standard`, linkText: 'See the radar',
      });
    }
    cacheSet(key, out);
    return out;
  }

  return { points, forecast, nearby, spot };
})();
