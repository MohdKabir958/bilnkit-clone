import { useState } from 'react';
import { Package } from 'lucide-react';

/** Product-owned image only; failed images have an explicit package fallback. */
export function ProductImage({url, name}: {url: string; name: string}) {
  const [failed, setFailed] = useState('');
  return <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-k-md bg-kraveo-g50 p-2">
    {url && failed !== url ? <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailed(url)} className="h-full w-full object-contain"/> : <Package aria-label={`${name}: image unavailable`} className="h-7 w-7 text-kraveo-g800/60"/>}
  </div>;
}
