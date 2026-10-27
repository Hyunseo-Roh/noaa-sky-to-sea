'use strict';

// Where the viewer stands, and how far and which way a place is from there.
window.HorizonGeo = (() => {
  // Used when the phone's location is off: the ocean side of north Key Largo, Florida.
  const DEMO = { lat: 25.2156, lon: -80.3467, name: 'Key Largo, Florida', real: false };
  const WHERE_KEY = 'horizon:where';

  const rad = (d) => d * Math.PI / 180;
  const deg = (r) => r * 180 / Math.PI;
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
  function distanceText(from, to) {
    const mi = miles(from, to);
    const n = mi < 100 ? Math.max(1, Math.round(mi)) : Math.round(mi / 10) * 10;
    return `About ${n.toLocaleString('en-US')} mi ${dir8(bearing(from, to))}`;
  }
  function coordsName(v) {
    const ns = v.lat >= 0 ? 'N' : 'S', ew = v.lon >= 0 ? 'E' : 'W';
    return `${Math.abs(v.lat).toFixed(2)}° ${ns}, ${Math.abs(v.lon).toFixed(2)}° ${ew}`;
  }

  // The phone's location lasts for this visit only, so the story page can use it too.
  function savedViewer() {
    try {
      const v = JSON.parse(sessionStorage.getItem(WHERE_KEY) || 'null');
      if (v && typeof v.lat === 'number' && typeof v.lon === 'number') return { ...v, real: true };
    } catch (_) { /* no storage */ }
    return null;
  }
  function saveViewer(v) {
    try {
      if (v && v.real) sessionStorage.setItem(WHERE_KEY, JSON.stringify({ lat: v.lat, lon: v.lon, name: v.name }));
      else sessionStorage.removeItem(WHERE_KEY);
    } catch (_) { /* no storage */ }
  }

  return { DEMO, bearing, miles, dir8, distanceText, coordsName, savedViewer, saveViewer };
})();
