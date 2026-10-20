// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeographyPanel, Geography } from './GeographyPanel';
import { apiService } from '../services/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const data: Geography = { cities: [{ id: 'blr', code: 'bengaluru-ka', name: 'Bengaluru', state: 'Karnataka', active: true }], zones: [{ id: 'central', cityId: 'blr', name: 'Central', centerLat: 12.97, centerLng: 77.59, radiusKm: 3, baseFeePaise: 2500, perKmFeePaise: 0, active: true }], coverage: [] };
let host: HTMLDivElement, root: Root;
const settle = async () => { await act(async () => { await Promise.resolve(); }); };
const field = (label: string) => [...host.querySelectorAll('label')].find((l) => l.firstChild?.textContent === label)!.querySelector('input,select') as HTMLInputElement | HTMLSelectElement;
const type = async (label: string, value: string) => act(async () => {
  const input = field(label);
  Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
});
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;
const submit = async (label: string) => { await act(async () => { button(label).closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await settle(); };
beforeEach(async () => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  vi.spyOn(apiService, 'fetchGeography').mockResolvedValue(data);
  await act(async () => root.render(<GeographyPanel vendors={[{ id: 'vendor-a', name: 'Corner Store' }]} />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('operations delivery coverage', () => {
  it('loads configured cities and zone prices instead of demo coverage', () => {
    expect(apiService.fetchGeography).toHaveBeenCalled();
    expect(host.textContent).toContain('Bengaluru, Karnataka');
    expect(host.textContent).toContain('₹25.00');
    expect(host.textContent).toContain('New stores need a confirmed location');
  });
  it('creates a city from the operator’s values', async () => {
    const create = vi.spyOn(apiService, 'createDeliveryCity').mockResolvedValue({});
    await type('City code (e.g. bengaluru-ka)', 'delhi-dl'); await type('City name', 'New Delhi'); await type('State / Union territory', 'Delhi');
    await submit('Add and enable city');
    expect(create).toHaveBeenCalledWith({ code: 'delhi-dl', name: 'New Delhi', state: 'Delhi', active: true });
    expect(host.querySelector('[role=status]')?.textContent).toBe('Saved.');
  });
  it('sends delivery fees in paise with exact two-decimal input', async () => {
    const create = vi.spyOn(apiService, 'createDeliveryZone').mockResolvedValue({});
    await type('Zone city', 'blr'); await type('Zone name', 'East'); await type('Centre latitude', '12.97'); await type('Centre longitude', '77.59');
    await type('Base delivery fee (₹)', '25.75'); await type('Additional fee per km (₹)', '0.10');
    await submit('Add and enable zone');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'blr', baseFeePaise: 2575, perKmFeePaise: 10, active: true }));
  });
  it('refuses fractional paise instead of silently rounding a delivery charge', async () => {
    const create = vi.spyOn(apiService, 'createDeliveryZone').mockResolvedValue({});
    await type('Zone city', 'blr'); await type('Zone name', 'East'); await type('Centre latitude', '12.97'); await type('Centre longitude', '77.59');
    await type('Base delivery fee (₹)', '25.755');
    await submit('Add and enable zone');
    expect(create).not.toHaveBeenCalled();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('two decimal places');
  });
  it('assigns coverage only through the selected store and zone API', async () => {
    const save = vi.spyOn(apiService, 'setStoreCoverage').mockResolvedValue({});
    await type('Coverage store', 'vendor-a'); await type('Delivery zone', 'central'); await type('Store delivery radius (km, optional)', '2.5');
    await submit('Enable store coverage');
    expect(save).toHaveBeenCalledWith('vendor-a', 'central', { active: true, radiusKm: 2.5 });
  });
  it('keeps a failed change visible and does not claim it was saved', async () => {
    vi.spyOn(apiService, 'createDeliveryCity').mockRejectedValue(new Error('This city already exists.'));
    await type('City code (e.g. bengaluru-ka)', 'blr-ka'); await type('City name', 'Bengaluru'); await type('State / Union territory', 'Karnataka');
    await submit('Add and enable city');
    expect(host.querySelector('[role=alert]')?.textContent).toContain('This city already exists.');
    expect(host.querySelector('[role=status]')).toBeNull();
  });
  it('edits the persisted zone radius and fees without creating another zone', async () => {
    const save = vi.spyOn(apiService, 'updateDeliveryZone').mockResolvedValue({});
    const create = vi.spyOn(apiService, 'createDeliveryZone');
    await act(async () => button('Edit Central').click());
    expect(field('Base delivery fee (₹)').value).toBe('25.00');
    await type('Radius (km, 0.1–50)', '4.5'); await type('Base delivery fee (₹)', '18.25');
    await submit('Save zone fees and radius');
    expect(save).toHaveBeenCalledWith('central', { radiusKm: 4.5, baseFeePaise: 1825, perKmFeePaise: 0 });
    expect(create).not.toHaveBeenCalled();
  });

});
