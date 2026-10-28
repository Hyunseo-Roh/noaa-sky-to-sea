'use strict';

// Tide predictions from NOAA's tide stations (CO-OPS, National Ocean Service).
//   /api/tides?lat=34.17&lon=-118.19   the station nearest that point
//   /api/tides?station=9410840         one station
// It answers with the station and its next high and low tides (times in UTC, heights in feet above MLLW).
// It runs on Vercel, so the app reads the data from its own address.

const STATIONS = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';
const DATA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const HEADERS = { 'User-Agent': 'Horizon app (noaa-sky-to-sea.vercel.app)', Accept: 'application/json' };

let list = null;
let listAt = 0;

const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const nameCase = (s) => (s === s.toUpperCase() ? titleCase(s) : s);

async function stations() {
  if (list && Date.now() - listAt < 24 * 3600e3) return list;
  const r = await fetch(STATIONS, { headers: HEADERS });
  if (!r.ok) throw new Error(`stations ${r.status}`);
  const j = await r.json();
  list = (j.stations || [])
    .map((s) => ({ id: String(s.id), name: nameCase(String(s.name || s.id)), state: s.state || '', lat: Number(s.lat), lon: Number(s.lng) }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  listAt = Date.now();
  return list;
}

function miles(a, b) {
  const rad = (d) => d * Math.PI / 180;
  const dp = rad(b.lat - a.lat), dl = rad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h)) / 1.609344;
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const q = req.query || {};
    const all = await stations();
    let st = null;
    let mi = null;
    if (q.station) {
      st = all.find((s) => s.id === String(q.station)) || null;
    } else {
      const here = { lat: Number(q.lat), lon: Number(q.lon) };
      if (!(Math.abs(here.lat) <= 90 && Math.abs(here.lon) <= 180)) {
        res.status(400).json({ error: 'Give lat and lon, or a station.' });
        return;
      }
      for (const s of all) {
        const m = miles(here, s);
        if (mi === null || m < mi) { st = s; mi = m; }
      }
    }
    if (!st) {
      res.status(404).json({ error: 'No tide station found.' });
      return;
    }

    const begin = new Date(Date.now() - 12 * 3600e3);
    const url = `${DATA}?product=predictions&application=Horizon&begin_date=${ymd(begin)}&range=96&datum=MLLW`
      + `&station=${encodeURIComponent(st.id)}&time_zone=gmt&units=english&interval=hilo&format=json`;
    const r = await fetch(url, { headers: HEADERS });
    const j = r.ok ? await r.json() : null;
    if (!j || !Array.isArray(j.predictions)) {
      res.status(502).json({ error: 'Tide predictions did not load.' });
      return;
    }
    const now = Date.now();
    const predictions = j.predictions
      .map((p) => ({ t: new Date(`${String(p.t).replace(' ', 'T')}:00Z`).toISOString(), v: Math.round(parseFloat(p.v) * 10) / 10, type: p.type === 'H' ? 'H' : 'L' }))
      .filter((p) => Date.parse(p.t) > now - 12 * 3600e3)
      .slice(0, 10);

    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({ station: st, miles: mi === null ? null : Math.round(mi * 10) / 10, predictions });
  } catch (_) {
    res.status(502).json({ error: 'Tide data did not load.' });
  }
};
