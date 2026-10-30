import {vi} from 'vitest';
import type {Vendor} from '../types';
import {apiService} from '../services/api';
/** Synthetic API fixture, used only by component tests; never a production catalog fallback. */
export function mockVendorDirectory(vendors:Vendor[]) {
 vi.spyOn(apiService,'vendorDirectory').mockImplementation(async filters=>{const q=(filters.q??'').toLowerCase();const rows=vendors.filter(v=>!q||[v.name,v.category,v.address,...(v.cuisines??[]).map(c=>c.name)].some(text=>text.toLowerCase().includes(q))).map(v=>({...v,productCount:v.menuItems?.length??0,cityName:'Synthetic city'}));return {rows,total:rows.length,page:Number(filters.page??1),limit:24};});
 const details=vi.spyOn(apiService,'vendorDetails').mockImplementation(async id=>({...vendors.find(v=>v.id===id),coverage:[],productCount:0,cityName:'Synthetic city'}));
 return {details};
}
