import React from 'react';
import { brand } from '../../config/brand';

/** Shared Grozo artwork on a light badge keeps the green lettering readable in dark mode. */
export const LogoBadge: React.FC<{ className?: string; imgClassName?: string }> = ({ className = '', imgClassName = 'h-10' }) => (
  <span className={`inline-flex items-center justify-center rounded-k-md bg-kraveo-cream px-3 py-1.5 shadow-k-soft ${className}`}>
    <img src="/brand/grozo-logo.png" alt={brand.name} className={`w-auto object-contain ${imgClassName}`} />
  </span>
);

/** Square icon export preserves the supplied wordmark and its leaf detail. */
export const LogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 44, className = '' }) => {
  return (
    <span
      role="img"
      aria-label={brand.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-k-md bg-kraveo-cream text-kraveo-g800 shadow-k-soft ${className}`}
      style={{ width: size, height: size }}
    ><img src="/brand/grozo-icon.png" alt="" className="h-full w-full rounded-k-md object-contain" /></span>
  );
};
