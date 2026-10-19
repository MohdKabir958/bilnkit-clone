import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { brand } from '../../config/brand';

/** Full logo (bowl + wordmark) on a cream rounded badge: the artwork is dark green + yellow and needs a light ground on dark UIs. */
export const LogoBadge: React.FC<{ className?: string; imgClassName?: string }> = ({ className = '', imgClassName = 'h-10' }) => (
  <span className={`inline-flex items-center justify-center rounded-k-md bg-kraveo-cream px-3 py-1.5 shadow-k-soft ${className}`}>
    <span className={`inline-flex items-center gap-2 font-display font-extrabold text-kraveo-g800 ${imgClassName}`}><ShoppingBag aria-hidden="true" />{brand.name}</span>
  </span>
);

/** Compact mark: the artwork cropped to the bowl only (no wordmark). Source is 1672x940; the bowl spans x 24-78%, y 6.5-66.5%. Landscape window because the bowl is wider than tall. */
export const LogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 44, className = '' }) => {
  return (
    <span
      role="img"
      aria-label={brand.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-k-md bg-kraveo-cream text-kraveo-g800 shadow-k-soft ${className}`}
      style={{ width: size, height: size }}
    ><ShoppingBag size={Math.round(size * 0.6)} aria-hidden="true" /></span>
  );
};
