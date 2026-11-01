// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from './types';

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));
vi.mock('./services/api', async () => ({
  ...await vi.importActual<typeof import('./services/api')>('./services/api'),
  clerkAuthEnabled: true, getAuthToken: () => '', freshAuthToken: async () => 'fixture',
}));
vi.mock('./components/OperationsPanel', () => ({
  OperationsPanel: ({ onOpenOrder }: { onOpenOrder: (id: string) => void }) => <>
    <button onClick={() => onOpenOrder('A')}>Open A</button>
    <button onClick={() => onOpenOrder('B')}>Open B</button>
  </>,
}));
vi.mock('./components/OrderDrawer', () => ({
  OrderDrawer: ({ order, loading, loadError, onClose }: {
    order: Order | null; loading: boolean; loadError: string; onClose: () => void;
  }) => <section aria-label="Order fixture">
    <span>{order ? `${order.id}: ${order.vendorName}` : loading ? 'Loading order' : 'No order'}</span>
    <span>{loadError}</span><button onClick={onClose}>Close order</button>
  </section>,
}));
import { App } from './App';
import { ToastProvider } from './components/ui/Toast';
import { ApiError, apiService } from './services/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const order = (id: string, vendorName = id) => ({ id, vendorName } as Order);
const denied = vi.fn();
function mount() {
  return render(<ToastProvider><App clerkAdmin={{ id: 'synthetic-admin', role: 'ADMIN', name: 'Fixture' }} onClerkDenied={denied}/></ToastProvider>);
}
beforeEach(() => {
  denied.mockClear();
  vi.spyOn(apiService, 'fetchOrderPage').mockResolvedValue({ orders: [], nextCursor: null });
  vi.spyOn(apiService, 'fetchVendors').mockResolvedValue([]);
  vi.spyOn(apiService, 'fetchDrivers').mockResolvedValue([]);
  vi.spyOn(apiService, 'fetchDriverLocations').mockResolvedValue([]);
  vi.spyOn(apiService, 'fetchNeedsAttention').mockResolvedValue({ available: true, entries: [] });
  vi.spyOn(apiService, 'fetchApplications').mockResolvedValue({ counts: { PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 }, data: [] });
  vi.spyOn(apiService, 'fetchCatalogPendingCounts').mockResolvedValue({ pending: 0, changePending: 0, total: 0 });
  vi.spyOn(apiService, 'fetchPendingSettlementCount').mockResolvedValue(0);
  vi.spyOn(apiService, 'fetchGeography').mockResolvedValue({ cities: [], zones: [], coverage: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('an older order response cannot replace the newer drawer contents', async () => {
  const a = deferred<Order>(); const b = deferred<Order>();
  const fetch = vi.spyOn(apiService, 'fetchOrder').mockImplementation(id => id === 'A' ? a.promise : b.promise);
  mount(); fireEvent.click(screen.getByText('Open A')); fireEvent.click(screen.getByText('Open B'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => { b.resolve(order('B')); });
  expect(screen.getByText('B: B')).toBeTruthy();
  await act(async () => { a.resolve(order('A')); });
  expect(screen.getByText('B: B')).toBeTruthy();
});

it('a rejected old drawer request cannot revoke the current admin session', async () => {
  const a = deferred<Order>();
  vi.spyOn(apiService, 'fetchOrder').mockImplementation(id => id === 'A' ? a.promise : Promise.resolve(order('B')));
  mount(); fireEvent.click(screen.getByText('Open A')); fireEvent.click(screen.getByText('Open B'));
  await screen.findByText('B: B');
  await act(async () => { a.reject(new ApiError(403, 'Old request refused')); });
  expect(denied).not.toHaveBeenCalled();
  expect(screen.getByText('B: B')).toBeTruthy();
});

it('closing and reopening the same order rejects the first request result', async () => {
  const first = deferred<Order>(); const second = deferred<Order>();
  vi.spyOn(apiService, 'fetchOrder').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  mount(); fireEvent.click(screen.getByText('Open A')); fireEvent.click(screen.getByText('Close order')); fireEvent.click(screen.getByText('Open A'));
  await act(async () => { first.resolve(order('A', 'Outdated')); });
  expect(screen.getByText('Loading order')).toBeTruthy();
  await act(async () => { second.resolve(order('A', 'Current')); });
  expect(screen.getByText('A: Current')).toBeTruthy();
});
