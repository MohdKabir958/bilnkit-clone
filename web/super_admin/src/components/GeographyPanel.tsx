import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';

export type DeliveryCity = { id: string; code: string; name: string; state: string; active: boolean };
export type DeliveryZone = { id: string; cityId: string; name: string; centerLat: number; centerLng: number; radiusKm: number; baseFeePaise: number; perKmFeePaise: number; active: boolean };
export type Coverage = { vendorId: string; zoneId: string; active: boolean; radiusKm: number | null };
export type Geography = { cities: DeliveryCity[]; zones: DeliveryZone[]; coverage: Coverage[] };
const money = (s: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(s.trim())) throw new Error('Enter a rupee amount with up to two decimal places.');
  const [whole, fraction = ''] = s.trim().split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(value)) throw new Error('Amount is too large.');
  return value;
};
const mins = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const inputClass = 'mt-1 w-full rounded-lg border border-kraveo-line bg-kraveo-surface2 p-2 text-kraveo-ink';
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm">{label}{children}</label>; }

export function GeographyPanel({ vendors, onChanged, onSessionError }: { onSessionError?: (error: unknown) => void; vendors: { id: string; name: string }[]; onChanged?: () => void }) {
  const [data, setData] = useState<Geography>({ cities: [], zones: [], coverage: [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [city, setCity] = useState({ code: '', name: '', state: '' });
  const [zone, setZone] = useState({ cityId: '', name: '', centerLat: '', centerLng: '', radiusKm: '3', base: '25', perKm: '0' });
  const [editingZone, setEditingZone] = useState('');
  const [store, setStore] = useState({ vendorId: '', cityId: '', pinCode: '', locality: '', address: '', lat: '', lng: '' });
  const [coverage, setCoverage] = useState({ vendorId: '', zoneId: '', radiusKm: '' });
  const [hours, setHours] = useState(Array.from({ length: 7 }, (_, day) => ({ day, enabled: true, opens: '09:00', closes: '21:00' })));
  const reload = async () => setData(await apiService.fetchGeography());
  useEffect(() => { void reload().catch((e) => { onSessionError?.(e); setError(e.message || 'Coverage could not be loaded.'); }); }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await reload(); onChanged?.(); setNotice('Saved.'); } catch (e) { onSessionError?.(e); setError(e instanceof Error ? e.message : 'The change could not be saved.'); } finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent, fn: () => Promise<unknown>) => { e.preventDefault(); void run(fn); };
  const cityOptions = data.cities.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.state}{c.active ? '' : ' (disabled)'}</option>);
  const vendorOptions = vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>);
  return <section className="space-y-6">
    <header><h1 className="text-2xl font-bold">Cities and delivery coverage</h1><p className="mt-2 text-sm text-kraveo-ink2">Enable only areas you can serve. New stores need a confirmed location and explicit zone coverage. A PIN code alone does not determine delivery eligibility.</p></header>
    {error && <div role="alert" className="rounded-lg border border-red-500 p-3">{error} <button onClick={() => void run(reload)}>Retry</button></div>}
    {notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy} className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={(e) => submit(e, () => apiService.createDeliveryCity({ ...city, active: true }))} className="space-y-3 rounded-xl border border-kraveo-line p-4">
        <h2 className="text-lg font-bold">Add a city</h2>
        {(['code', 'name', 'state'] as const).map((key) => <Field key={key} label={key === 'code' ? 'City code (e.g. bengaluru-ka)' : key === 'name' ? 'City name' : 'State / Union territory'}><input className={inputClass} required value={city[key]} onChange={(e) => setCity({ ...city, [key]: e.target.value })} /></Field>)}
        <button className="k-button" type="submit">Add and enable city</button>
        <ul>{data.cities.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{c.name}, {c.state} · {c.active ? 'Enabled' : 'Disabled'}</span><button type="button" onClick={() => void run(() => apiService.setCityActive(c.id, !c.active))}>{c.active ? 'Disable' : 'Enable'}</button></li>)}</ul>
      </form>
      <form onSubmit={(e) => submit(e, () => (editingZone ? apiService.updateDeliveryZone(editingZone, { radiusKm: Number(zone.radiusKm), baseFeePaise: money(zone.base), perKmFeePaise: money(zone.perKm) }) : apiService.createDeliveryZone({ cityId: zone.cityId, name: zone.name, centerLat: Number(zone.centerLat), centerLng: Number(zone.centerLng), radiusKm: Number(zone.radiusKm), baseFeePaise: money(zone.base), perKmFeePaise: money(zone.perKm), active: true })))} className="space-y-3 rounded-xl border border-kraveo-line p-4">
        <h2 className="text-lg font-bold">{editingZone ? 'Edit delivery zone fees and radius' : 'Add a delivery zone'}</h2>
        <Field label="Zone city"><select className={inputClass} disabled={!!editingZone} required value={zone.cityId} onChange={(e) => setZone({ ...zone, cityId: e.target.value })}><option value="">Choose city</option>{cityOptions}</select></Field>
        {([['name', 'Zone name'], ['centerLat', 'Centre latitude'], ['centerLng', 'Centre longitude'], ['radiusKm', 'Radius (km, 0.1–50)'], ['base', 'Base delivery fee (₹)'], ['perKm', 'Additional fee per km (₹)']] as const).map(([key, label]) => <Field key={key} label={label}><input className={inputClass} required value={zone[key]} onChange={(e) => setZone({ ...zone, [key]: e.target.value })} inputMode={key === 'name' ? 'text' : 'decimal'} /></Field>)}
        <button type="submit">{editingZone ? 'Save zone fees and radius' : 'Add and enable zone'}</button>{editingZone && <button type="button" onClick={() => { setEditingZone(''); setZone({ cityId: '', name: '', centerLat: '', centerLng: '', radiusKm: '3', base: '25', perKm: '0' }); }}>Cancel zone edit</button>}
        <ul>{data.zones.map((z) => <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{z.name} · {z.radiusKm} km · ₹{(z.baseFeePaise / 100).toFixed(2)} + ₹{(z.perKmFeePaise / 100).toFixed(2)}/km · {z.active ? 'Enabled' : 'Disabled'}</span><button type="button" onClick={() => { setEditingZone(z.id); setZone({ cityId: z.cityId, name: z.name, centerLat: String(z.centerLat), centerLng: String(z.centerLng), radiusKm: String(z.radiusKm), base: (z.baseFeePaise / 100).toFixed(2), perKm: (z.perKmFeePaise / 100).toFixed(2) }); }}>Edit {z.name}</button><button type="button" onClick={() => void run(() => apiService.updateDeliveryZone(z.id, { active: !z.active }))}>{z.active ? 'Disable' : 'Enable'}</button></li>)}</ul>
      </form>
      <form onSubmit={(e) => submit(e, () => apiService.configureStoreLocation(store.vendorId, { cityId: store.cityId, pinCode: store.pinCode, locality: store.locality, address: store.address, lat: Number(store.lat), lng: Number(store.lng), operatingHours: hours.filter((h) => h.enabled).map((h) => ({ day: h.day, opens: mins(h.opens), closes: mins(h.closes) })) }))} className="space-y-3 rounded-xl border border-kraveo-line p-4">
        <h2 className="text-lg font-bold">Store location and opening hours</h2>
        <p className="text-sm text-kraveo-ink2">Saving the location disables the store’s old coverage. Assign the correct zones again after saving. Hours use India time; an end time earlier than the start continues overnight.</p>
        <Field label="Store"><select className={inputClass} required value={store.vendorId} onChange={(e) => setStore({ ...store, vendorId: e.target.value })}><option value="">Choose store</option>{vendorOptions}</select></Field>
        <Field label="Store city"><select className={inputClass} required value={store.cityId} onChange={(e) => setStore({ ...store, cityId: e.target.value })}><option value="">Choose city</option>{cityOptions}</select></Field>
        {([['pinCode', 'PIN code'], ['locality', 'Area / locality'], ['address', 'Store address'], ['lat', 'Store latitude'], ['lng', 'Store longitude']] as const).map(([key, label]) => <Field key={key} label={label}><input className={inputClass} required value={store[key]} onChange={(e) => setStore({ ...store, [key]: e.target.value })} /></Field>)}
        {hours.map((h, i) => <div key={h.day} className="flex flex-wrap items-center gap-2"><label><input type="checkbox" checked={h.enabled} onChange={(e) => setHours(hours.map((row, n) => n === i ? { ...row, enabled: e.target.checked } : row))} /> {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][h.day]}</label><input aria-label={`Opening time ${h.day}`} type="time" value={h.opens} disabled={!h.enabled} onChange={(e) => setHours(hours.map((row, n) => n === i ? { ...row, opens: e.target.value } : row))} /><span>to</span><input aria-label={`Closing time ${h.day}`} type="time" value={h.closes} disabled={!h.enabled} onChange={(e) => setHours(hours.map((row, n) => n === i ? { ...row, closes: e.target.value } : row))} /></div>)}
        <button type="submit">Save store location and hours</button>
      </form>
      <form onSubmit={(e) => submit(e, () => apiService.setStoreCoverage(coverage.vendorId, coverage.zoneId, { active: true, radiusKm: coverage.radiusKm ? Number(coverage.radiusKm) : null }))} className="space-y-3 rounded-xl border border-kraveo-line p-4">
        <h2 className="text-lg font-bold">Assign store coverage</h2>
        <Field label="Coverage store"><select className={inputClass} required value={coverage.vendorId} onChange={(e) => setCoverage({ ...coverage, vendorId: e.target.value })}><option value="">Choose store</option>{vendorOptions}</select></Field>
        <Field label="Delivery zone"><select className={inputClass} required value={coverage.zoneId} onChange={(e) => setCoverage({ ...coverage, zoneId: e.target.value })}><option value="">Choose zone</option>{data.zones.map((z) => <option key={z.id} value={z.id}>{z.name} · {data.cities.find((c) => c.id === z.cityId)?.name}</option>)}</select></Field>
        <Field label="Store delivery radius (km, optional)"><input className={inputClass} value={coverage.radiusKm} onChange={(e) => setCoverage({ ...coverage, radiusKm: e.target.value })} /></Field>
        <button type="submit">Enable store coverage</button>
        <ul>{data.coverage.map((c) => <li key={`${c.vendorId}:${c.zoneId}`} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{vendors.find((v) => v.id === c.vendorId)?.name ?? c.vendorId} → {data.zones.find((z) => z.id === c.zoneId)?.name} · {c.active ? 'Enabled' : 'Disabled'}</span><button type="button" onClick={() => void run(() => apiService.setStoreCoverage(c.vendorId, c.zoneId, { active: !c.active, radiusKm: c.radiusKm }))}>{c.active ? 'Disable' : 'Enable'}</button></li>)}</ul>
      </form>
    </fieldset>
  </section>;
}
