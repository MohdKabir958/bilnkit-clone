import { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';
import { Drawer } from './ui/Drawer';
import {CreateProductDrawer} from './CreateProductDrawer';
import { ProductImage } from './ui/ProductImage';
import {PhysicalInventoryDrawer} from './PhysicalInventoryDrawer';

type Product = Record<string, any> & { id: string; name: string; vendorId: string; stockQty: number; stockVersion: number; pricePaise: number };
const currency = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const cls = 'k-input';
const minor = (value: string) => { if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a rupee amount with up to two decimals.'); const [whole, fraction = ''] = value.trim().split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2,'0')); };
export function InventoryPanel({ vendors, onAuthError,selectedCityId,initialVendorId='' }: { initialVendorId?:string; selectedCityId?:string; vendors: {id: string; name: string}[]; onAuthError: (e: unknown) => void }) {
  const [rows, setRows] = useState<Product[]>([]), [cities, setCities] = useState<{id:string;name:string}[]>([]);
  const [assistance,setAssistance]=useState<{id:string;vendorId:string;expiresAt:string}|null>(null),[assistanceReason,setAssistanceReason]=useState(''),[assistanceConfirmed,setAssistanceConfirmed]=useState(false),[assistanceForm,setAssistanceForm]=useState(false);
  const assisted=(body:Record<string,unknown>)=>({...body,...(assistance?{assistanceId:assistance.id}:{})});
  const [physical,setPhysical]=useState<Product|null>(null);
  const [creating,setCreating]=useState(false);
  const [appliedQ,setAppliedQ] = useState('');
  const [q, setQ] = useState(''), [vendorId, setVendorId] = useState(initialVendorId), [cityId, setCityId] = useState(selectedCityId??''), [lowStock, setLowStock] = useState(false);
  useEffect(()=>{if(selectedCityId!==undefined){setCityId(selectedCityId);setVendorId(initialVendorId);}},[selectedCityId,initialVendorId]);
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
  useEffect(()=>{setAssistance(null);setAssistanceForm(false);setEditing(null);setAdjusting(null);setCreating(false);setPhysical(null);},[vendorId,cityId]);
  useEffect(()=>{if(!assistance)return;const timer=window.setInterval(()=>{if(Date.parse(assistance.expiresAt)<=Date.now()){setAssistance(null);setEditing(null);setAdjusting(null);setCreating(false);setPhysical(null);setNotice('Assistance expired. Start a new request before further edits.');}},15000);return()=>window.clearInterval(timer);},[assistance]);
  const run = async (fn: () => Promise<unknown>) => {setBusy(true);setError('');setNotice('');try {await fn();setNotice('Saved.');await reload();}catch(e){onAuthError(e);setError(e instanceof Error ? e.message : 'Unable to save.');}finally{setBusy(false);}};
  return <section className="k-panel space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Catalog oversight</h2><p className="mt-2 text-sm text-kraveo-ink2">Review products, photos, approval and stock exceptions. Store owners manage daily products, prices, stock, lots and working hours in the Vendor app. Available stock excludes checkout reservations.</p></div><button className="k-btn-ghost" onClick={()=>setAssistanceForm(true)}>Exceptional store assistance</button></div>
    <form className="flex flex-wrap items-center gap-3 rounded-k-md bg-kraveo-surface2 p-4 [&>input]:max-w-xs [&>select]:w-auto" onSubmit={(e) => {e.preventDefault();if(q===appliedQ) void reload();else setAppliedQ(q);}}>
      <input className={cls} aria-label="Search products or SKU" placeholder="Search products or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      {selectedCityId===undefined&&<select className={cls} aria-label="Inventory city" value={cityId} onChange={(e) => setCityId(e.target.value)}><option value="">All cities</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <select className={cls} aria-label="Inventory store" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">All stores</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} /> Low stock only</label><button className="k-btn-primary" type="submit" disabled={busy}>Search / refresh</button>
    </form>
    {assistanceForm&&!assistance&&<form className="k-inset space-y-3 p-4" aria-label="Exceptional catalog assistance" onSubmit={e=>{e.preventDefault();void run(async()=>{if(!vendorId)throw Error('Select one store before starting assistance.');setAssistance(await apiService.openCatalogAssistance({vendorId,reason:assistanceReason.trim(),confirmed:assistanceConfirmed}));setAssistanceForm(false);});}}><h3 className="font-bold">Support a store by exception</h3><p className="text-sm">Use for approved onboarding help, compliance or recovery. The selected store and reason are audited. This does not bypass stock, pricing or ownership checks.</p><label className="block text-sm">Assistance reason<input required minLength={8} maxLength={200} className="k-input mt-1 w-full" value={assistanceReason} onChange={e=>setAssistanceReason(e.target.value)}/></label><label className="flex gap-2 text-sm"><input type="checkbox" required checked={assistanceConfirmed} onChange={e=>setAssistanceConfirmed(e.target.checked)}/>I am authorized to assist this store and have confirmed the support request.</label><button className="k-btn-primary" disabled={busy||!vendorId||!assistanceConfirmed}>Start audited assistance</button><button type="button" className="k-btn-ghost" onClick={()=>setAssistanceForm(false)}>Cancel assistance request</button>{!vendorId&&<p className="text-sm">Choose one store in the filter above.</p>}</form>}
    {assistance&&<div role="status" className="k-inset flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><p>Audited assistance active for {vendors.find(v=>v.id===assistance.vendorId)?.name??assistance.vendorId} until {new Date(assistance.expiresAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST.</p><button className="k-btn-ghost" onClick={()=>setCreating(true)}>Add product</button><button className="k-btn-ghost" onClick={()=>{setAssistance(null);setEditing(null);setAdjusting(null);setCreating(false);setPhysical(null);}}>End assistance</button></div>}
    {error && <p role="alert" className="text-red-500">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Loading…</p>}
    {!busy && rows.length === 0 && <p>No matching products. Ask the store owner to add products in the Vendor app, or use exceptional assistance for an authorized support request.</p>}
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">{rows.map((p) => <article key={p.id} className="min-w-0 rounded-k-xl border border-kraveo-line bg-kraveo-surface p-4 space-y-3 [overflow-wrap:anywhere]">
      <div className="flex items-start gap-4"><ProductImage url={p.imageUrls?.[0] ?? ''} name={p.name}/><div className="min-w-0 flex-1"><h3 className="font-bold">{p.name} · {p.packSize} {p.unit}</h3><p className="mt-1 text-xs text-kraveo-ink2">{p.vendor?.name} · SKU {p.sku ?? 'needs setup'}</p><span className="mt-2 inline-flex rounded-md bg-kraveo-surface2 px-2 py-1 text-xs font-semibold">{String(p.approvalStatus).replace(/_/g,' ')}</span></div></div>
      <p>{currency(p.pricePaise)}{p.mrpPaise > p.pricePaise && <> · MRP {currency(p.mrpPaise)}</>} · Available {p.stockQty}{p.lowStock && <strong> · Low stock</strong>}</p>{p.batchTracking&&<p className="text-sm text-kraveo-ink2">{p.batchSummary?.expiringQty??0} packs expire within 7 days · {p.batchSummary?.expiredQty??0} expired packs excluded</p>}
      <div className="flex flex-wrap gap-4">{assistance&&<><button disabled={busy} onClick={() => setEditing(p)}>Edit product</button><button disabled={busy} onClick={() => {if(p.batchTracking){setPhysical(p);return;}setAdjusting(p);setDelta('');setReason('');stockKey.current=crypto.randomUUID();}}>Adjust stock</button></>}<button disabled={busy} onClick={() => void run(async () => {setHistory((await apiService.productMovements(p.id)).data);})}>Recent stock history</button><button disabled={busy} onClick={()=>setPhysical(p)}>{assistance?'Lots, packing and returns':'Inspect lots and reservations'}</button>
      {p.approvalStatus !== 'APPROVED' && <button disabled={busy} onClick={() => void run(() => apiService.approveCatalogItem(p.id, {}))}>Approve product</button>}
      {['PENDING','CHANGE_PENDING'].includes(p.approvalStatus)&&<button disabled={busy} onClick={()=>{const reason=window.prompt('Why should this product be rejected? (3–200 characters)');if(reason?.trim())void run(()=>apiService.rejectCatalogItem(p.id,reason.trim()));}}>Reject product</button>}
      </div>
    </article>)}</div>
    {cursor && <button disabled={busy} onClick={() => void reload(true)}>Load more products</button>}
    {adjusting && <Drawer open title="Adjust stock" onClose={() => {if(!busy)setAdjusting(null);}}>{error && <p role="alert" className="mb-4 text-sm text-kraveo-danger">{error}</p>}<form className="space-y-3" onSubmit={(e) => {e.preventDefault();void run(async () => {if (!/^-?\d+$/.test(delta) || !reason.trim()) throw new Error('Enter a whole pack adjustment and a reason.');await apiService.adjustProductStock(adjusting.id,assisted({delta:Number(delta),reason:reason.trim(),expectedVersion:adjusting.stockVersion,clientRequestId:stockKey.current}));setAdjusting(null);});}}>
      <h2>Adjust {adjusting.name} · Available {adjusting.stockQty}</h2><label className="block">Change in packs (+received / −removed)<input className={cls} required value={delta} onChange={(e) => setDelta(e.target.value)} /></label><label className="block">Reason<input className={cls} required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label><button disabled={busy}>Save stock adjustment</button><button type="button" disabled={busy} onClick={() => setAdjusting(null)}>Cancel</button>
    </form></Drawer>}
    {history && <Drawer open title="Recent stock movements" onClose={() => setHistory(null)}><h2>Recent stock movements</h2><p>Showing the latest available page of up to 100 records.</p><ul>{history.map((h) => <li key={h.id}>{h.createdAt} · {h.kind} {h.delta} · {h.reason}</li>)}</ul><button onClick={() => setHistory(null)}>Close history</button></Drawer>}
    {editing && <Drawer open title="Edit grocery product" onClose={() => {if(!busy)setEditing(null);}}>{error && <p role="alert" className="mb-4 text-sm text-kraveo-danger">{error}</p>}<ProductEdit key={editing.id} row={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(body) => run(async () => {await apiService.saveGroceryProduct(editing.id,assisted(body));setEditing(null);})} /></Drawer>}
    {physical&&<PhysicalInventoryDrawer readOnly={!assistance} assistanceId={assistance?.id} product={physical} onClose={()=>{setPhysical(null);void reload();}} onAuthError={onAuthError}/>}
    <CreateProductDrawer assistanceId={assistance?.id} open={creating} vendors={assistance?vendors.filter(v=>v.id===assistance.vendorId):vendors} initialVendorId={vendorId} onClose={()=>setCreating(false)} onCreated={()=>void reload()} onAuthError={onAuthError}/>
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
