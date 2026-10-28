'use strict';

// Sunrise and sunset: when, and in which direction on the horizon.
// The equations are the ones in NOAA's Solar Calculator (Global Monitoring Laboratory).
window.HorizonSun = (() => {
  const rad = (d) => d * Math.PI / 180;
  const deg = (r) => r * 180 / Math.PI;
  const ZENITH = 90.833; // the sun's upper edge on the horizon, with the air bending its light

  // Declination (degrees) and the equation of time (minutes) for a Julian century.
  function solar(jc) {
    const L0 = ((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360 + 360) % 360;
    const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    const C = Math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
      + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc)
      + Math.sin(rad(3 * M)) * 0.000289;
    const omega = 125.04 - 1934.136 * jc;
    const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
    const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(rad(omega));
    const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
    const y = Math.tan(rad(eps / 2)) ** 2;
    const eot = 4 * deg(
      y * Math.sin(2 * rad(L0))
      - 2 * e * Math.sin(rad(M))
      + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
      - 0.5 * y * y * Math.sin(4 * rad(L0))
      - 1.25 * e * e * Math.sin(2 * rad(M)),
    );
    return { decl, eot };
  }

  // Sunrise and sunset for the UTC day that starts at `utc0` (ms). null when the sun stays up or down all day.
  function day(utc0, lat, lon) {
    const jd = utc0 / 864e5 + 2440587.5;
    const jc = (min) => (jd + min / 1440 - 2451545) / 36525;
    let noon = 720 - 4 * lon;
    let s = solar(jc(noon));
    noon = 720 - 4 * lon - s.eot;
    s = solar(jc(noon));
    const cosH = Math.cos(rad(ZENITH)) / (Math.cos(rad(lat)) * Math.cos(rad(s.decl))) - Math.tan(rad(lat)) * Math.tan(rad(s.decl));
    if (cosH > 1 || cosH < -1) return null;
    const H = deg(Math.acos(cosH));
    const cosA = (Math.sin(rad(s.decl)) - Math.sin(rad(lat)) * Math.cos(rad(ZENITH))) / (Math.cos(rad(lat)) * Math.sin(rad(ZENITH)));
    const A = deg(Math.acos(Math.max(-1, Math.min(1, cosA))));
    return {
      rise: new Date(utc0 + (noon - 4 * H) * 60000),
      set: new Date(utc0 + (noon + 4 * H) * 60000),
      riseAz: A,
      setAz: 360 - A,
      daylight: 8 * H, // minutes from sunrise to sunset
    };
  }

  // The next sunrise and the next sunset after `now`.
  function next(now, lat, lon) {
    const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let rise = null, set = null;
    for (let k = -1; k <= 2 && (!rise || !set); k++) {
      const d = day(base + k * 864e5, lat, lon);
      if (!d) continue;
      if (!rise && d.rise > now) rise = { at: d.rise, az: d.riseAz, daylight: d.daylight };
      if (!set && d.set > now) set = { at: d.set, az: d.setAz, daylight: d.daylight };
    }
    return { rise, set };
  }

  return { day, next };
})();
