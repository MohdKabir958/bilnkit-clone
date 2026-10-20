import { AppError } from '../utils/appError';
import { indianPoint } from './geography';

type Env = Record<string, string | undefined>;
const unavailable = () => new AppError(503, 'MAPS_UNAVAILABLE', 'Location search or routing is unavailable. You can enter the address manually or use GPS.');
const endpoint = (value: string | undefined): URL => {
  if (!value) throw unavailable();
  let u: URL;
  try { u = new URL(value); } catch { throw unavailable(); }
  if (u.protocol !== 'https:' || u.username || u.password) throw unavailable();
  return u;
};
const get = async (url: URL, env: Env, transport: typeof fetch) => {
  try {
    const response = await transport(url, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json', ...(env.MAPS_PROVIDER_TOKEN ? { Authorization: `Bearer ${env.MAPS_PROVIDER_TOKEN}` } : {}) } });
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 1_000_000) throw unavailable();
    const reader = response.body?.getReader();
    if (!reader) throw unavailable();
    let length = 0;
    const parts: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 1_000_000) { await reader.cancel(); throw unavailable(); }
      parts.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch { throw unavailable(); }
};
const clean = (v: unknown) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 150) : '';

// Photon-compatible GeoJSON, usually from an owned/self-hosted service. No public service is assumed.
export async function searchLocations(query: unknown, env: Env = process.env, transport: typeof fetch = fetch) {
  if (typeof query !== 'string' || query.trim().length < 3 || query.length > 150) throw new AppError(400, 'BAD_QUERY', 'Enter 3–150 characters to search for an address.');
  const url = endpoint(env.MAPS_GEOCODER_URL);
  url.searchParams.set('q', query.trim()); url.searchParams.set('limit', '10');
  const raw = await get(url, env, transport);
  if (!Array.isArray(raw.features)) throw unavailable();
  return raw.features.slice(0, 10).flatMap((f: any) => {
    const [lng, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : [];
    if (!indianPoint(lat, lng)) return [];
    const p = f.properties ?? {};
    const label = [p.name, p.street, p.city, p.state, p.postcode].map(clean).filter(Boolean).join(', ');
    return label ? [{ label, lat, lng, city: clean(p.city), state: clean(p.state), pinCode: /^[1-9]\d{5}$/.test(p.postcode ?? '') ? p.postcode : null }] : [];
  });
}

// OSRM-compatible routes. The caller supplies server-authorized order pins, never an arbitrary provider URL.
export async function routeBetween(from: { lat: number; lng: number }, to: { lat: number; lng: number }, env: Env = process.env, transport: typeof fetch = fetch) {
  if (!indianPoint(from.lat, from.lng) || !indianPoint(to.lat, to.lng)) throw unavailable();
  const url = endpoint(env.MAPS_ROUTER_URL);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${from.lng},${from.lat};${to.lng},${to.lat}`;
  url.searchParams.set('overview', 'full'); url.searchParams.set('geometries', 'geojson'); url.searchParams.set('steps', 'false');
  const raw = await get(url, env, transport), route = raw.routes?.[0];
  if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance < 0 || route.duration < 0 || route.distance > 2_000_000 || route.duration > 172800) throw unavailable();
  const line = route.geometry?.coordinates;
  if (!Array.isArray(line) || line.length < 2 || line.length > 10000 || line.some((p: any) => !Array.isArray(p) || !indianPoint(p[1], p[0]))) throw unavailable();
  return { distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration), coordinates: line.map((p: number[]) => ({ lat: p[1], lng: p[0] })) };
}
