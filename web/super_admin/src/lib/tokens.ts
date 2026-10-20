// Raw design-token hex values for places where a Tailwind class cannot be used (Recharts, SVG, inline style).
// Mirrors tailwind.config.js and packages/kraveo_ui (KraveoPalette, KStatus).

export const palette = {
  g400: '#43AE55',
  g500: '#23913A',
  g800: '#005A26',
  yellow: '#85D900',
  night: '#F6F8F6',
  surface: '#FFFFFF',
  surface2: '#EEF3EF',
  line: '#DDE5DF',
  ink: '#14201A',
  ink2: '#46534B',
  ink3: '#58675E',
  danger: '#B42332',
} as const;

export type KStatusKey = 'placed' | 'accepted' | 'preparing' | 'ready' | 'pickedUp' | 'atGate' | 'delivered' | 'cancelled';

export interface StatusMeta {
  key: KStatusKey;
  label: string;
  hex: string;
  /** Terminal states do not pulse. */
  live: boolean;
  // Literal class strings so Tailwind's scanner picks them up.
  dot: string;
  text: string;
  bg: string;
  border: string;
}

export const STATUS_META: Record<KStatusKey, StatusMeta> = {
  placed: { key: 'placed', label: 'Placed', hex: '#875500', live: true, dot: 'bg-kraveo-status-placed', text: 'text-kraveo-status-placed', bg: 'bg-kraveo-status-placed/15', border: 'border-kraveo-status-placed/30' },
  accepted: { key: 'accepted', label: 'Accepted', hex: '#0A655C', live: true, dot: 'bg-kraveo-status-accepted', text: 'text-kraveo-status-accepted', bg: 'bg-kraveo-status-accepted/15', border: 'border-kraveo-status-accepted/30' },
  preparing: { key: 'preparing', label: 'Preparing', hex: '#A44713', live: true, dot: 'bg-kraveo-status-preparing', text: 'text-kraveo-status-preparing', bg: 'bg-kraveo-status-preparing/15', border: 'border-kraveo-status-preparing/30' },
  ready: { key: 'ready', label: 'Ready', hex: '#3C6611', live: true, dot: 'bg-kraveo-status-ready', text: 'text-kraveo-status-ready', bg: 'bg-kraveo-status-ready/15', border: 'border-kraveo-status-ready/30' },
  pickedUp: { key: 'pickedUp', label: 'On the way', hex: '#245CA2', live: true, dot: 'bg-kraveo-status-pickedUp', text: 'text-kraveo-status-pickedUp', bg: 'bg-kraveo-status-pickedUp/15', border: 'border-kraveo-status-pickedUp/30' },
  atGate: { key: 'atGate', label: 'At doorstep', hex: '#6745A3', live: true, dot: 'bg-kraveo-status-atGate', text: 'text-kraveo-status-atGate', bg: 'bg-kraveo-status-atGate/15', border: 'border-kraveo-status-atGate/30' },
  delivered: { key: 'delivered', label: 'Delivered', hex: '#176B37', live: false, dot: 'bg-kraveo-status-delivered', text: 'text-kraveo-status-delivered', bg: 'bg-kraveo-status-delivered/15', border: 'border-kraveo-status-delivered/30' },
  cancelled: { key: 'cancelled', label: 'Cancelled', hex: '#B42332', live: false, dot: 'bg-kraveo-status-cancelled', text: 'text-kraveo-status-cancelled', bg: 'bg-kraveo-status-cancelled/15', border: 'border-kraveo-status-cancelled/30' },
};

/** Ordered pipeline (live lanes), same order as the Flutter apps. */
export const PIPELINE_ORDER: KStatusKey[] = ['placed', 'accepted', 'preparing', 'ready', 'pickedUp', 'atGate'];

/** Tolerant parser, same rules as KStatusX.parse in kraveo_ui. */
export const parseStatus = (raw: string): KStatusKey => {
  const s = raw.toUpperCase().replace(/ /g, '_');
  if (s.includes('CANCEL')) return 'cancelled';
  if (s.includes('DELIVERED')) return 'delivered';
  if (s.includes('GATE')) return 'atGate';
  if (s.includes('PICKED') || s.includes('TRANSIT') || s.includes('WAY')) return 'pickedUp';
  if (s.includes('READY')) return 'ready';
  if (s.includes('PREPAR')) return 'preparing';
  if (s.includes('ACCEPT') || s.includes('ASSIGN')) return 'accepted';
  return 'placed';
};

export const statusMeta = (raw: string): StatusMeta => STATUS_META[parseStatus(raw)];

/** Exact backend wording for a status, used in the quick-override menu. */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready for pickup',
  PICKED_UP: 'On the way',
  ARRIVED_AT_GATE: 'At doorstep',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const inr = (value: number): string => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const timeAgo = (iso?: string | number | Date, now: number = Date.now()): string => {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '-';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
