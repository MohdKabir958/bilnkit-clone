import { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';
import { Drawer } from './ui/Drawer';
import { ProductImage } from './ui/ProductImage';

type Product = Record<string, any> & { id: string; name: string; vendorId: string; stockQty: number; stockVersion: number; pricePaise: number };
const currency = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const cls = 'k-input';
const minor = (value: string) => { if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a rupee amount with up to two decimals.'); const [whole, fraction = ''] = value.trim().split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2,'0')); };
export function InventoryPanel({ vendors, onAuthError }: { vendors: {id: string; name: string}[]; onAuthError: (e: unknown) => void }) {
  const [rows, setRows] = useState<Product[]>([]), [cities, setCities] = useState<{id:string;name:string}[]>([]);
  const [appliedQ,setAppliedQ] = useState('');
  const [q, setQ] = useState(''), [vendorId, setVendorId] = useState(''), [cityId, setCityId] = useState(''), [lowStock, setLowStock] = useState(false);
  const [cursor, setCursor] = useState<string|null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
  const [editing,setEditing] = useState<Product|null>(null), [adjusting,setAdjusting] = useState<Product|null>(null), [history,setHistory] = useState<any[]|null>(null);
  const [delta,setDelta] = useState(''), [reason,setReason] = useState('');
  const generation = useRef(0), stockKey = useRef('');
  const reload = async (more = false) => {
    const seq = ++generation.current; setBusy(true); setError('');
    try {
      const result = await apiService.inventoryPage({q:appliedQ,vendorId,cityId,lowStock,after: more ? cursor ?? '' : ''});
      if (seq !== generation.current) return;
      setRows((old) => more ? [...old,...result.data] : result.data); setCursor(result.nextCursor);
    } catch(e) { if (seq === generation.current) {onAuthError(e);setError(e instanceof Error ? e.message : 'Inventory could not be loaded.');} }
    finally {if (seq === generation.current) setBusy(false);}
  };
  useEffect(() => { void apiService.fetchGeography().then((g) => setCities(g.cities)).catch(onAuthError); return () => {generation.current++;}; }, []);
  useEffect(() => { void reload(); }, [vendorId,cityId,lowStock,appliedQ]);
  const run = async (fn: () => Promise<unknown>) => {setBusy(true);setError('');setNotice('');try {await fn();setNotice('Saved.');await reload();}catch(e){onAuthError(e);setError(e instanceof Error ? e.message : 'Unable to save.');}finally{setBusy(false);}};
  return <section className="k-panel space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Grocery products and inventory</h2><p className="mt-2 text-sm text-kraveo-ink2">Available stock excludes checkout reservations. Product packs and variants are separate SKUs within a store.</p></div></div>
    <form className="flex flex-wrap items-center gap-3 rounded-k-md bg-kraveo-surface2 p-4 [&>input]:max-w-xs [&>select]:w-auto" onSubmit={(e) => {e.preventDefault();if(q===appliedQ) void reload();else setAppliedQ(q);}}>
      <input className={cls} aria-label="Search products or SKU" placeholder="Search products or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      <select className={cls} aria-label="Inventory city" value={cityId} onChange={(e) => setCityId(e.target.value)}><option value="">All cities</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className={cls} aria-label="Inventory store" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">All stores</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} /> Low stock only</label><button className="k-btn-primary" type="submit" disabled={busy}>Search / refresh</button>
    </form>
    {error && <p role="alert" className="text-red-500">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Loading…</p>}
    {!busy && rows.length === 0 && <p>No matching products. Stores can add products and variants in their Products and inventory screen.</p>}
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">{rows.map((p) => <article key={p.id} className="min-w-0 rounded-k-xl border border-kraveo-line bg-kraveo-surface p-4 space-y-3 [overflow-wrap:anywhere]">
      <div className="flex items-start gap-4"><ProductImage url={p.imageUrls?.[0] ?? ''} name={p.name}/><div className="min-w-0 flex-1"><h3 className="font-bold">{p.name} · {p.packSize} {p.unit}</h3><p className="mt-1 text-xs text-kraveo-ink2">{p.vendor?.name} · SKU {p.sku ?? 'needs setup'}</p><span className="mt-2 inline-flex rounded-md bg-kraveo-surface2 px-2 py-1 text-xs font-semibold">{String(p.approvalStatus).replace(/_/g,' ')}</span></div></div>
      <p>{currency(p.pricePaise)}{p.mrpPaise > p.pricePaise && <> · MRP {currency(p.mrpPaise)}</>} · Available {p.stockQty}{p.lowStock && <strong> · Low stock</strong>}</p>
      <div className="flex flex-wrap gap-4"><button disabled={busy} onClick={() => setEditing(p)}>Edit product</button><button disabled={busy} onClick={() => {setAdjusting(p);setDelta('');setReason('');stockKey.current=crypto.randomUUID();}}>Adjust stock</button><button disabled={busy} onClick={() => void run(async () => {setHistory((await apiService.productMovements(p.id)).data);})}>Recent stock history</button>
      {p.approvalStatus !== 'APPROVED' && <button disabled={busy} onClick={() => void run(() => apiService.approveCatalogItem(p.id, {}))}>Approve product</button>}
      </div>
    </article>)}</div>
    {cursor && <button disabled={busy} onClick={() => void reload(true)}>Load more products</button>}
    {adjusting && <Drawer open title="Adjust stock" onClose={() => {if(!busy)setAdjusting(null);}}>{error && <p role="alert" className="mb-4 text-sm text-kraveo-danger">{error}</p>}<form className="space-y-3" onSubmit={(e) => {e.preventDefault();void run(async () => {if (!/^-?\d+$/.test(delta) || !reason.trim()) throw new Error('Enter a whole pack adjustment and a reason.');await apiService.adjustProductStock(adjusting.id,{delta:Number(delta),reason:reason.trim(),expectedVersion:adjusting.stockVersion,clientRequestId:stockKey.current});setAdjusting(null);});}}>
      <h2>Adjust {adjusting.name} · Available {adjusting.stockQty}</h2><label className="block">Change in packs (+received / −removed)<input className={cls} required value={delta} onChange={(e) => setDelta(e.target.value)} /></label><label className="block">Reason<input className={cls} required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label><button disabled={busy}>Save stock adjustment</button><button type="button" disabled={busy} onClick={() => setAdjusting(null)}>Cancel</button>
    </form></Drawer>}
    {history && <Drawer open title="Recent stock movements" onClose={() => setHistory(null)}><h2>Recent stock movements</h2><p>Showing the latest available page of up to 100 records.</p><ul>{history.map((h) => <li key={h.id}>{h.createdAt} · {h.kind} {h.delta} · {h.reason}</li>)}</ul><button onClick={() => setHistory(null)}>Close history</button></Drawer>}
    {editing && <Drawer open title="Edit grocery product" onClose={() => {if(!busy)setEditing(null);}}>{error && <p role="alert" className="mb-4 text-sm text-kraveo-danger">{error}</p>}<ProductEdit key={editing.id} row={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(body) => run(async () => {await apiService.saveGroceryProduct(editing.id,body);setEditing(null);})} /></Drawer>}
  </section>;
}
function ProductEdit({row,busy,onSave,onCancel}:{row:Product;busy:boolean;onSave:(v:Record<string,unknown>)=>Promise<void>;onCancel:()=>void}) {
  const [form,setForm] = useState<Record<string,any>>({...row,price:(row.pricePaise/100).toFixed(2),mrp:row.mrpPaise == null ? '' : (row.mrpPaise/100).toFixed(2),tax:((row.taxRateBps??0)/100).toFixed(2),images:(row.imageUrls??[]).join('\n')});
  const [error,setError] = useState('');
  const write = (key:string,value:unknown) => setForm((old) => ({...old,[key]:value}));
  return <form aria-label="Edit grocery product" className="rounded-xl border border-kraveo-line p-4 space-y-3" onSubmit={(e) => {e.preventDefault();try{void onSave({name:form.name,sku:form.sku,productKey:form.productKey,packSize:form.packSize,unit:form.unit,categoryId:row.categoryId,description:form.description,pricePaise:minor(form.price),mrpPaise:form.mrp ? minor(form.mrp) : null,taxRateBps:minor(form.tax),lowStockThreshold:Number(form.lowStockThreshold),imageUrls:form.images.split('\n').map((v:string)=>v.trim()).filter(Boolean),barcode:form.barcode,hsnCode:form.hsnCode,isAvailable:form.active});}catch(e){setError((e as Error).message);}}}>
    <h2>Edit {row.name}</h2>{error && <p role="alert">{error}</p>}<div className="grid gap-3 md:grid-cols-2">{Object.entries({name:'Product name',sku:'Unique SKU',productKey:'Product group',packSize:'Pack quantity',price:'Selling price (₹)',mrp:'MRP (₹, optional)',tax:'Tax rate (%)',lowStockThreshold:'Low stock threshold',barcode:'Barcode',hsnCode:'HSN',description:'Description',images:'Owned HTTPS image URLs (one per line)'}).map(([key,label])=><label key={key}>{label}<textarea className={`${cls} block w-full`} value={(form as any)[key]??''} onChange={(e)=>write(key,e.target.value)} disabled={busy} rows={key==='description'||key==='images'?3:1}/></label>)}</div>
    <label>Unit<select className={cls} value={form.unit} onChange={(e)=>write('unit',e.target.value)}>{['g','kg','ml','l','pcs','pack'].map((u)=><option key={u}>{u}</option>)}</select></label><label><input type="checkbox" checked={form.active} onChange={(e)=>write('active',e.target.checked)}/> Active</label><button disabled={busy}>Save product</button><button type="button" disabled={busy} onClick={onCancel}>Cancel product edit</button>
  </form>;
}
