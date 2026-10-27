import React,{useEffect,useRef,useState} from 'react';
import {Store,Plus} from 'lucide-react';
import type {Order,Vendor} from '../types';
import type {SavedPin} from '../lib/vendorLocation';
import type {VendorCommission} from '../lib/catalogParse';
import {apiService,ApiError,clerkAuthEnabled} from '../services/api';
import {useCategories} from '../lib/useCategories';
import {Drawer} from './ui/Drawer';
import {Avatar} from './ui/Avatar';
import {ApprovalPill} from './ui/ApprovalPill';
import {ProductImage} from './ui/ProductImage';
import {CreateStoreDrawer} from './CreateStoreDrawer';
import {AddPartnerDrawer} from './AddPartnerDrawer';
import {EditRestaurantDrawer} from './EditRestaurantDrawer';
import {VendorLocationEditor} from './VendorLocationEditor';
import {CommissionEditor} from './CommissionEditor';
import {PayoutAccountPanel} from './PayoutAccountPanel';
import {SellerCompliancePanel} from './SellerCompliancePanel';
import {InventoryPanel} from './InventoryPanel';
interface VendorManagerProps {
  initialApprovalStatus?:string;
  createRequested?: number;
  selectedCityId?: string;
  onOpenCoverage?: () => void;
  vendors: Vendor[];
  /** The loaded orders: "Active orders" per restaurant is counted from them (the vendors API does not send it). */
  orders?: Order[];
  /** Restaurants whose open/close request is still running: their switch is disabled. */
  busyVendorIds?: ReadonlySet<string>;
  onToggleVendor: (vendorId: string) => void;
  /** Called after a restaurant (with its owner login) was created, so the list reloads. */
  onCreated?: () => void;
  onOpenProducts?:(id:string)=>void;
  onOpenCategories?:()=>void;
  /** Called after an admin saved a restaurant's map pin, so the list (and the live map) use it at once. */
  onLocationSaved?: (vendorId: string, saved: SavedPin) => void;
  /** Called after an admin saved a restaurant's commission, so the list uses it at once. */
  onCommissionSaved?: (vendorId: string, commission: VendorCommission) => void;
  /** Called after an admin saved the restaurant's profile (name, categories, address, banner, FSSAI, ETA); `vendor` is the fresh admin view. */
  onProfileSaved?: (vendor: Vendor) => void;
  /** Session errors from the commission save (logs out on 401/403). */
  onAuthError?: (error: unknown) => void;
  loading?: boolean;
  query?: string;
  onClearQuery?: () => void;
}
const tabs=['Overview','Products','Orders','Inventory','Location & Coverage','Working Hours','Compliance','Commission','Payouts','Audit'] as const;
type Tab=typeof tabs[number];
export const VendorManager:React.FC<VendorManagerProps>=({vendors,onCreated,onOpenProducts,onOpenCategories,onOpenCoverage,onLocationSaved,onCommissionSaved,onProfileSaved,onAuthError,query='',onClearQuery,createRequested=0,selectedCityId='',initialApprovalStatus=''})=>{
 const categories=useCategories(),[page,setPage]=useState(1),[status,setStatus]=useState(initialApprovalStatus),[availability,setAvailability]=useState(''),[category,setCategory]=useState('');
 const [data,setData]=useState<{total:number;rows:(Vendor&{productCount:number;cityName:string})[]}>({total:0,rows:[]}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [showCreate,setShowCreate]=useState(false),[selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<any>(null),[tab,setTab]=useState<Tab>('Overview'),[editing,setEditing]=useState(false),[changing,setChanging]=useState(false);const generation=useRef(0),detailGeneration=useRef(0);
 const fail=(e:unknown)=>{setError(e instanceof Error?e.message:'Vendor data could not load.');if(e instanceof ApiError&&[401,403].includes(e.status))onAuthError?.(e);};
 const load=async()=>{const seq=++generation.current;setBusy(true);setError('');try{const result=await apiService.vendorDirectory({page:String(page),limit:'24',q:query,...(selectedCityId?{cityId:selectedCityId}:{}),...(status?{status}:{}),...(availability?{open:availability}:{}),...(category?{categoryId:category}:{})});if(seq===generation.current){setData(result);if(result.total>0&&(page-1)*24>=result.total)setPage(Math.max(1,Math.ceil(result.total/24)));}}catch(e){if(seq===generation.current)fail(e);}finally{if(seq===generation.current)setBusy(false);}};
 useEffect(()=>{setStatus(initialApprovalStatus);},[initialApprovalStatus]);
 useEffect(()=>{setPage(1);},[query,selectedCityId,status,availability,category]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[page,query,selectedCityId,status,availability,category,vendors]);
 useEffect(()=>{if(createRequested)setShowCreate(true);},[createRequested]);
 const loadDetail=async()=>{if(!selected)return;const seq=++detailGeneration.current;try{const row=await apiService.vendorDetails(selected);if(seq===detailGeneration.current)setDetail(row);}catch(e){if(seq===detailGeneration.current)fail(e);}};
 useEffect(()=>{setDetail(null);setTab('Overview');setError('');void loadDetail();return()=>{detailGeneration.current++;};},[selected]);
 const saved=()=>{void load();void loadDetail();onCreated?.();};
 const toggle=async()=>{if(!detail||changing)return;if(detail.isAcceptingOrders&&!window.confirm(`Close ${detail.name} for new orders? ${detail.activeOrdersCount??0} current orders must still be fulfilled.`))return;setChanging(true);setError('');try{const updated=await apiService.toggleVendorStatus(detail.id,!detail.isAcceptingOrders);setDetail((old:any)=>({...old,...updated}));onProfileSaved?.(updated);void load();}catch(e){fail(e);}finally{setChanging(false);}};
 const open=(id:string)=>{setSelected(id);setTab('Overview');};
 const close=()=>{if(!changing){setSelected(null);setDetail(null);}};
 return <section className="space-y-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">All vendors</h2><p className="mt-1 text-sm text-kraveo-ink2">Find a store, then open its details to manage pickup, access and operations.</p></div><button className="k-btn-primary" onClick={()=>setShowCreate(true)}><Plus className="h-4 w-4"/>Add vendor</button></header>
 <div className="k-panel flex flex-wrap items-end gap-3"><label className="text-xs">Approval<select className="k-input mt-1" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All approval states</option>{['APPROVED','PENDING','REJECTED','SUSPENDED'].map(s=><option key={s}>{s}</option>)}</select></label><label className="text-xs">Availability<select className="k-input mt-1" value={availability} onChange={e=>setAvailability(e.target.value)}><option value="">Open and closed</option><option value="true">Open</option><option value="false">Closed</option></select></label><label className="text-xs">Primary category<select className="k-input mt-1" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.categories.filter(c=>c.forRestaurants).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="k-btn-ghost" disabled={busy} onClick={()=>void load()}>Refresh vendors</button><p className="text-sm text-kraveo-ink2">{data.total} matching vendors · server total</p></div>
 {error&&<p role="alert" className="rounded-k-md border border-kraveo-danger/30 p-3 text-sm">{error}</p>}{busy&&<p role="status">Loading vendor directory…</p>}
 {!busy&&!data.rows.length&&<div className="k-panel text-sm"><p>No vendors match these filters.</p><button className="k-btn-ghost mt-3" onClick={()=>{setCategory('');setStatus('');setAvailability('');setPage(1);onClearQuery?.();}}>Clear filters</button></div>}
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{data.rows.map(v=><button key={v.id} className="k-card flex flex-col gap-3 !p-4 text-left hover:border-kraveo-g400" onClick={()=>open(v.id)} aria-label={`View details of ${v.name}`}><div className="flex min-w-0 items-center gap-3"><Avatar name={v.name} size="sm"/><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{v.name}</h3><p className="truncate text-xs text-kraveo-ink2">{v.category}</p></div><Store className="h-4 w-4 shrink-0 text-kraveo-g700"/></div><div className="flex flex-wrap items-center gap-2"><ApprovalPill status={v.approvalStatus}/><span className={`rounded-full px-2 py-1 text-xs ${v.isAcceptingOrders?'bg-kraveo-g50 text-kraveo-g800':'bg-kraveo-surface2 text-kraveo-ink2'}`}>{v.isAcceptingOrders?'Open':'Closed'}</span></div><p className="truncate text-xs text-kraveo-ink2">{v.cityName}{v.locality?` · ${v.locality}`:''}</p><p className="flex justify-between border-t border-kraveo-line pt-2 text-xs"><span>{v.productCount} products · {v.activeOrdersCount} current orders</span><span className="font-bold text-kraveo-g700">Details →</span></p></button>)}</div>
 <nav className="flex items-center justify-between gap-3" aria-label="Vendor pages"><button className="k-btn-ghost" disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>Previous vendors</button><span className="text-sm">Page {page} of {Math.max(1,Math.ceil(data.total/24))}</span><button className="k-btn-ghost" disabled={busy||page*24>=data.total} onClick={()=>setPage(p=>p+1)}>Next vendors</button></nav>
 <Drawer open={!!selected&&!editing} wide onClose={close} title={detail?.name??'Vendor details'} subtitle="Manage one store without leaving your directory" icon={Store}>
 {error&&<p role="alert">{error}</p>}{!detail?<p role="status">Loading store details…</p>:<><div className="mb-5 flex flex-wrap items-center gap-3"><ApprovalPill status={detail.approvalStatus}/><span className="k-chip">{detail.isAcceptingOrders?'Open':'Closed'}</span><button className="k-btn-ghost !min-h-[36px] !py-1 text-xs" disabled={changing} onClick={()=>void toggle()}>{changing?'Saving…':detail.isAcceptingOrders?'Close store':'Open store'}</button></div><p className="mb-4 text-xs text-kraveo-ink2">The open setting does not override owner, approval, hours, coverage or stock eligibility. Backend refusals appear here.</p>
 <div role="tablist" aria-label="Vendor details sections" className="mb-5 flex gap-2 overflow-x-auto pb-2" onKeyDown={e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=tabs[(tabs.indexOf(tab)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];setTab(next);document.getElementById(`vendor-tab-${next}`)?.focus();}}>{tabs.map(t=><button key={t} id={`vendor-tab-${t}`} role="tab" aria-selected={tab===t} aria-controls="vendor-detail-content" tabIndex={tab===t?0:-1} disabled={t==='Payouts'&&detail.approvalStatus!=='APPROVED'} className="k-chip shrink-0" onClick={()=>setTab(t)}>{t}</button>)}</div>
 <div id="vendor-detail-content" role="tabpanel" aria-labelledby={`vendor-tab-${tab}`} className="space-y-4">
 {tab==='Overview'&&<><dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">{[['Primary category',detail.category],['City / locality',`${detail.cityName??''} · ${detail.locality??''}`],['Public contact',detail.publicPhone||'Not provided'],['Pickup address',detail.address],['Products',detail.productCount],['Current orders',detail.activeOrdersCount],['Verified owner',detail.userId?'Linked':'Assign before opening']].map(([key,value])=><div key={key}><dt className="text-xs text-kraveo-ink2">{key}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><p className="text-sm">{detail.description||'No public description yet.'}</p><button className="k-btn-ghost" onClick={()=>setEditing(true)}>Edit store profile & access</button></>}
 {tab==='Products'&&<VendorProducts vendorId={detail.id} onError={fail}/>}
 {tab==='Orders'&&<VendorOrders vendorId={detail.id} onError={fail}/>}
 {tab==='Inventory'&&<InventoryPanel vendors={[detail]} initialVendorId={detail.id} selectedCityId={detail.cityId??''} onAuthError={fail}/>}
 {tab==='Location & Coverage'&&<><VendorLocationEditor id={detail.id} name={detail.name} pin={detail} onSaved={(id,pin)=>{onLocationSaved?.(id,pin);saved();}}/><ul className="space-y-2 text-sm">{detail.coverage?.map((c:any)=><li key={c.zoneId}>{c.zone.name} · {c.active&&c.zone.active?'Enabled':'Disabled'}</li>)}</ul>{!detail.coverage?.length&&<p className="text-sm">No delivery coverage assigned. Keep the store closed until configured.</p>}{onOpenCoverage&&<button className="k-btn-ghost" onClick={()=>{close();onOpenCoverage();}}>Configure city & delivery coverage</button>}</>}
 {tab==='Working Hours'&&<><p className="text-sm">Daily hours are maintained by this store in the Vendor app. Times below use India Standard Time.</p>{Array.isArray(detail.operatingHours)?<ul className="space-y-2 text-sm">{detail.operatingHours.map((h:any)=><li key={h.day}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][h.day]} · {formatMinutes(h.opens)}–{formatMinutes(h.closes)}{h.closes<h.opens?' (next day)':''}</li>)}</ul>:<p className="text-sm">No weekly schedule saved. Manual opening still requires serviceability checks.</p>}{onOpenCoverage&&<button className="k-btn-ghost" onClick={()=>{close();onOpenCoverage();}}>Exceptional hours assistance</button>}</>}
 {tab==='Compliance'&&<SellerCompliancePanel vendorId={detail.id} onAuthError={fail}/>}
 {tab==='Commission'&&<CommissionEditor id={detail.id} name={detail.name} commissionType={detail.commissionType} commissionValue={detail.commissionValue} onSaved={(id,value)=>{onCommissionSaved?.(id,value);saved();}} onAuthError={fail}/>}
 {tab==='Payouts'&&detail.approvalStatus==='APPROVED'&&<PayoutAccountPanel userId={detail.userId} name={detail.name} kind="restaurant" onAuthError={fail}/>}
 {tab==='Audit'&&<VendorAudit id={detail.id} onError={fail}/>}
 </div></>}
 </Drawer>
 {editing&&detail&&<EditRestaurantDrawer vendor={detail} onClose={()=>setEditing(false)} onSaved={v=>{onProfileSaved?.(v);saved();}} onAuthError={fail}/>}
 {clerkAuthEnabled?<CreateStoreDrawer open={showCreate} onClose={()=>setShowCreate(false)} onCreated={saved} onAuthError={fail} initialCityId={selectedCityId} onOpenCoverage={onOpenCoverage} onOpenProducts={onOpenProducts} onOpenCategories={onOpenCategories}/>:<AddPartnerDrawer open={showCreate} kind="VENDOR" onClose={()=>setShowCreate(false)} onCreated={saved}/>}
 </section>;
};
const formatMinutes=(n:number)=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
function VendorProducts({vendorId,onError}:{vendorId:string;onError:(e:unknown)=>void}) {
 const [rows,setRows]=useState<any[]>([]),[cursor,setCursor]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async(more=false)=>{setBusy(true);try{const result=await apiService.inventoryPage({q:'',cityId:'',lowStock:false,vendorId,after:more?cursor:''});setRows(old=>more?[...old,...result.data]:result.data);setCursor(result.nextCursor??'');}catch(e){setError(e instanceof Error?e.message:'Products could not load.');onError(e);}finally{setBusy(false);}};
 useEffect(()=>{void load();},[vendorId]);
 return <section className="space-y-3"><h3 className="font-bold">Store products</h3>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading products…</p>}{!busy&&!rows.length&&<p className="text-sm">This store has no products yet. Its owner can add products in the Vendor app.</p>}{rows.map(p=><article key={p.id} className="flex gap-3 rounded-k-md border border-kraveo-line p-3"><ProductImage url={p.imageUrl??p.imageUrls?.[0]??''} name={p.name}/><div><h4 className="font-semibold">{p.name}</h4><p className="text-xs">{p.packSize} {p.unit} · ₹{(p.pricePaise/100).toFixed(2)} · {p.stockQty} available</p><p className="text-xs">{p.approvalStatus}</p></div></article>)}{cursor&&<button className="k-btn-ghost" disabled={busy} onClick={()=>void load(true)}>More store products</button>}</section>;
}
function VendorOrders({vendorId,onError}:{vendorId:string;onError:(e:unknown)=>void}) {
 const [rows,setRows]=useState<Order[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async(more=false)=>{setBusy(true);try{const until=new Date();const page=await apiService.fetchOrderPage(more?cursor:undefined,50,undefined,{vendorId,from:new Date(until.getTime()-90*86400000).toISOString(),to:until.toISOString()});setRows(old=>more?[...old,...page.orders]:page.orders);setCursor(page.nextCursor);}catch(e){setError(e instanceof Error?e.message:'Orders could not load.');onError(e);}finally{setBusy(false);}};
 useEffect(()=>{void load();},[vendorId]);
 return <section className="space-y-3"><h3 className="font-bold">Store orders · last 90 days</h3>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading store orders…</p>}{rows.map(o=><article key={o.id} className="rounded-k-md border border-kraveo-line p-3 text-sm">#{o.id.slice(-8)} · {o.status.replace(/_/g,' ')} · ₹{o.totalAmount.toFixed(2)}<p className="text-xs">{new Date(o.createdAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p></article>)}{!busy&&!rows.length&&<p className="text-sm">No store orders in this period.</p>}{cursor&&<button className="k-btn-ghost" disabled={busy} onClick={()=>void load(true)}>More store orders</button>}</section>;
}
function VendorAudit({id,onError}:{id:string;onError:(e:unknown)=>void}) {
 const [rows,setRows]=useState<{id:string;createdAt:string;action:string;summary:string}[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async(more=false)=>{setBusy(true);try{const page=await apiService.vendorAudit(id,more?cursor??'':'');setRows(old=>more?[...old,...page.rows]:page.rows);setCursor(page.nextCursor);}catch(e){setError(e instanceof Error?e.message:'Audit could not load.');onError(e);}finally{setBusy(false);}};
 useEffect(()=>{void load();},[id]);
 return <section className="space-y-3"><h3 className="font-bold">Store audit</h3>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading store audit…</p>}{rows.map(r=><article key={r.id} className="border-b border-kraveo-line py-2 text-sm"><p>{r.action} · {new Date(r.createdAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p><p>{r.summary}</p></article>)}{!busy&&!rows.length&&<p className="text-sm">No recorded store audit entries.</p>}{cursor&&<button className="k-btn-ghost" disabled={busy} onClick={()=>void load(true)}>More store audit</button>}</section>;
}
