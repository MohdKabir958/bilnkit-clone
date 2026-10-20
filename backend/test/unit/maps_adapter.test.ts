import { searchLocations, routeBetween } from '../../src/services/maps';

describe('configurable maps adapters', () => {
  const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  test('no provider is silently selected when configuration is absent', async () => {
    await expect(searchLocations('Bengaluru', {})).rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
  });
  test('normalizes Photon results and filters non-Indian or invalid coordinates', async () => {
    const transport = jest.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toContain('q=Bengaluru');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-fixture' });
      return response({ features: [{ geometry: { coordinates: [77.59, 12.97] }, properties: { name: 'Central', city: 'Bengaluru', state: 'Karnataka', postcode: '560001' } }, { geometry: { coordinates: [0, 0] }, properties: { name: 'Wrong country' } }] });
    });
    expect(await searchLocations('Bengaluru', { MAPS_GEOCODER_URL: 'https://maps.example/search', MAPS_PROVIDER_TOKEN: 'test-fixture' }, transport as typeof fetch)).toEqual([{ label: 'Central, Bengaluru, Karnataka, 560001', lat: 12.97, lng: 77.59, city: 'Bengaluru', state: 'Karnataka', pinCode: '560001' }]);
  });
  test('provider errors and credentials are not returned to callers', async () => {
    await expect(searchLocations('Delhi', { MAPS_GEOCODER_URL: 'https://maps.example/search' }, (async () => new Response('sensitive provider body', { status: 401 })) as typeof fetch)).rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE', status: 503 });
  });
  test('insecure configured endpoints are refused before sending a token', async () => {
    const transport = jest.fn();
    await expect(searchLocations('Delhi', { MAPS_GEOCODER_URL: 'http://maps.example/search' }, transport)).rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
    expect(transport).not.toHaveBeenCalled();
  });
  test('normalizes routes into metres/seconds and validated coordinate pairs', async () => {
    const transport = jest.fn(async (url: URL | RequestInfo) => {
      expect(String(url)).toContain('/77.59,12.97;77.6,12.98');
      return response({ routes: [{ distance: 1750.5, duration: 600.3, geometry: { coordinates: [[77.59, 12.97], [77.6, 12.98]] } }] });
    });
    expect(await routeBetween({ lat: 12.97, lng: 77.59 }, { lat: 12.98, lng: 77.6 }, { MAPS_ROUTER_URL: 'https://maps.example/route/v1/driving' }, transport as typeof fetch)).toMatchObject({ distanceMeters: 1751, durationSeconds: 600 });
  });
});
