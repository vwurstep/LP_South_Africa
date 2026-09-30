/* Day/night appearance. Mode is 'auto' | 'day' | 'night' (saved on the device).
   Auto = night between sunset and sunrise at the given position, computed offline
   (NOAA sunrise equation, accurate to a few minutes — plenty for switching a theme). */

const KEY = 'lp.appearance';
export function loadMode() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } }
export function saveMode(m) { try { localStorage.setItem(KEY, m); } catch {} }

const rad = Math.PI / 180;

/** Sunrise and sunset (Date objects) for `date` at lat/lng; null if polar day/night. */
export function sunTimes(date, lat, lng) {
  const noonLocal = new Date(date); noonLocal.setHours(12, 0, 0, 0);  // pick the right day's cycle
  const day = Math.round(noonLocal.getTime() / 86400000 + 2440587.5 - 2451545 - 0.0009 - lng / 360);  // Julian cycle
  const M = (357.5291 + 0.98560028 * day) % 360;                      // solar mean anomaly
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;                           // ecliptic longitude
  const noon = 2451545 + day + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad) - lng / 360;
  const dec = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));   // declination
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / rad / 360;
  const toDate = (jd) => new Date((jd - 2440587.5) * 86400000);
  return { sunrise: toDate(noon - H), sunset: toDate(noon + H) };
}

/** 'day' or 'night' for a mode at a position and time. */
export function resolve(mode, pos, now = new Date()) {
  if (mode === 'day' || mode === 'night') return mode;
  const t = pos && sunTimes(now, pos.lat, pos.lng);
  if (!t) return 'day';
  return now >= t.sunrise && now < t.sunset ? 'day' : 'night';
}

export const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
