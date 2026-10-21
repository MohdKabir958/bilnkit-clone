import {useEffect,useState} from 'react';
import {CheckCircle2,MapPin,Store} from 'lucide-react';
import {Drawer} from './ui/Drawer';
import {apiService,ApiError} from '../services/api';
import type {Geography} from './GeographyPanel';

export function CreateStoreDrawer({open,onClose,onCreated,onAuthError,initialCityId='',onOpenCoverage}:{open:boolean;onClose:()=>void;onCreated:()=>void;onAuthError?:(e:unknown)=>void;initialCityId?:string;onOpenCoverage?:()=>void}) {
  const [geo,setGeo]=useState<Geography>({cities:[],zones:[],coverage:[]});
  const [form,setForm]=useState({name:'',address:'',cityId:initialCityId,pinCode:'',locality:'',lat:'',lng:'',zoneId:'',ownerEmail:''});
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[created,setCreated]=useState(false);
  const load=async()=>{setLoading(true);try{setGeo(await apiService.fetchGeography());setError('');}catch(e){setError(e instanceof Error?e.message:'Cities could not be loaded.');}finally{setLoading(false);}};
  useEffect(()=>{if(!open)return;setCreated(false);setError('');setForm({name:'',address:'',cityId:initialCityId,pinCode:'',locality:'',lat:'',lng:'',zoneId:'',ownerEmail:''});void load();},[open]);
  const fields=[['name','Store name','text'],['address','Pickup address','text'],['locality','Area / locality','text'],['pinCode','PIN code','text'],['lat','Pickup latitude','text'],['lng','Pickup longitude','text']] as const;
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');setBusy(true);
    try {
      if(!form.lat.trim()||!form.lng.trim()||!Number.isFinite(Number(form.lat))||!Number.isFinite(Number(form.lng)))throw new Error('Enter the confirmed pickup coordinates.');
      await apiService.createStore({...form,name:form.name.trim(),address:form.address.trim(),locality:form.locality.trim(),lat:Number(form.lat),lng:Number(form.lng),zoneId:form.zoneId||undefined,ownerEmail:form.ownerEmail.trim()||undefined});
      setCreated(true);onCreated();
    }catch(e){setError(e instanceof Error?e.message:'Store could not be created.');if(e instanceof ApiError&&e.status===401)onAuthError?.(e);}finally{setBusy(false);}
  };
  return <Drawer open={open} onClose={()=>{if(!busy)onClose();}} title={created?'Store created':'Add vendor'} subtitle={created?'Finish setup before accepting orders':'Create the grocery store, then add products'} icon={Store}>
    {created?<div className="space-y-5"><CheckCircle2 className="h-12 w-12 text-kraveo-g700"/><h3 className="text-xl font-bold">{form.name} is ready for setup</h3><p className="text-sm text-kraveo-ink2">The store is saved and closed. Add products and stock, confirm a delivery zone, then open it from Vendors.</p><ol className="list-decimal space-y-3 pl-5 text-sm"><li>Open <strong>Products & stock</strong> and select this store.</li><li>Assign coverage in <strong>Cities & zones</strong> if you skipped it.</li><li>Open the store when products and pickup details are ready.</li></ol>{!form.ownerEmail&&<p className="rounded-k-md bg-kraveo-surface2 p-4 text-sm">No partner login was assigned. You can manage the store as an administrator. Partner access requires a verified account and approval.</p>}<button className="k-btn-primary w-full" onClick={onClose}>Back to vendors</button></div>:<form className="space-y-6" onSubmit={submit}>
      {error&&<p role="alert" className="rounded-k-md border border-kraveo-danger/30 bg-kraveo-danger/5 p-3 text-sm">{error} {geo.cities.length===0&&<button type="button" className="underline" onClick={()=>void load()}>Retry loading cities</button>}</p>}
      <section className="space-y-4"><h3 className="font-semibold">1. Store and pickup details</h3><label className="block text-sm font-medium">City<select required disabled={loading||busy} className="k-input mt-2 w-full" value={form.cityId} onChange={e=>setForm({...form,cityId:e.target.value,zoneId:''})}><option value="">{loading?'Loading cities…':'Choose an enabled city'}</option>{geo.cities.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}</select></label>
      {!loading&&geo.cities.filter(c=>c.active).length===0&&<div className="rounded-k-md bg-kraveo-surface2 p-4 text-sm">Add a city before creating a vendor. {onOpenCoverage&&<button className="mt-2 block font-bold underline" type="button" onClick={()=>{onClose();onOpenCoverage();}}>Go to Cities & zones</button>}</div>}
      {fields.map(([key,label,type])=><label key={key} className="block text-sm font-medium">{label}<input className="k-input mt-2 w-full" type={type} required value={form[key]} maxLength={key==='name'?60:key==='address'?140:key==='pinCode'?6:100} inputMode={key==='lat'||key==='lng'?'decimal':key==='pinCode'?'numeric':undefined} pattern={key==='pinCode'?'[1-9][0-9]{5}':undefined} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
      <p className="flex items-start gap-2 text-xs text-kraveo-ink2"><MapPin className="h-4 w-4 shrink-0"/>Use a confirmed pickup pin from the vendor. Enter latitude and longitude separately.</p></section>
      <section className="space-y-4 border-t border-kraveo-line pt-5"><h3 className="font-semibold">2. Delivery and owner access</h3><label className="block text-sm font-medium">Delivery zone (optional)<select className="k-input mt-2 w-full" value={form.zoneId} onChange={e=>setForm({...form,zoneId:e.target.value})}><option value="">Assign later</option>{geo.zones.filter(z=>z.cityId===form.cityId&&z.active).map(z=><option key={z.id} value={z.id}>{z.name} · {z.radiusKm} km</option>)}</select></label><label className="block text-sm font-medium">Owner's verified email (optional)<input type="email" className="k-input mt-2 w-full" value={form.ownerEmail} onChange={e=>setForm({...form,ownerEmail:e.target.value})} placeholder="vendor@example.com"/></label><p className="text-xs text-kraveo-ink2">The partner must already have signed in to Grozo and verified this email with Clerk. Leave blank to manage the store yourself for now. No password is created or shared.</p></section>
      <div className="rounded-k-md bg-kraveo-g50 p-4 text-sm text-kraveo-g800">New stores start closed. Creating a store does not start deliveries or charge anyone.</div><button className="k-btn-primary w-full" disabled={busy||loading}>{busy?'Creating vendor…':'Create vendor'}</button>
    </form>}
  </Drawer>;
}
