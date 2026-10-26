// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {CreateStoreDrawer} from './CreateStoreDrawer';
import {apiService,ApiError} from '../services/api';
const zone={id:'central',cityId:'blr',name:'Covered area',active:true,centerLat:12.96,centerLng:77.58,radiusKm:3,baseFeePaise:2500,perKmFeePaise:0};
const geo={cities:[{id:'blr',name:'Bengaluru',code:'blr',state:'Karnataka',active:true}],zones:[zone,{...zone,id:'far',name:'Too far',centerLat:13.5},{...zone,id:'closed',name:'Disabled area',active:false}],coverage:[]};
beforeEach(()=>{vi.spyOn(apiService,'fetchGeography').mockResolvedValue(geo);vi.spyOn(apiService,'fetchCategories').mockResolvedValue([{id:'groceries',name:'Grocery stores',isActive:true,forRestaurants:true}] as any);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const fill=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
async function pickup(lat='12.96'){
 render(<CreateStoreDrawer open initialCityId="blr" onClose={()=>{}} onCreated={()=>{}}/>);await screen.findByRole('option',{name:'Grocery stores'});
 fill('Store name','Synthetic local store');fill('Primary store category','groceries');fireEvent.click(screen.getByRole('button',{name:'Next: Pickup'}));
 for(const [label,value] of [['Pickup address','Synthetic confirmed test address'],['Area / locality','Test area'],['PIN code','560002'],['Pickup latitude',lat],['Pickup longitude','77.58']])fill(label,value);
 fireEvent.click(screen.getByRole('button',{name:'Next: Access'}));
}
it('offers only actual covering zones and clears the selection when the pin moves outside',async()=>{
 await pickup();expect(screen.getByRole('option',{name:'Covered area · 3 km'})).toBeTruthy();expect(screen.queryByRole('option',{name:/Too far|Disabled area/})).toBeNull();
 fill('Delivery zone (optional)','central');fireEvent.click(screen.getByRole('button',{name:'Back'}));fill('Pickup latitude','13.5');fireEvent.click(screen.getByRole('button',{name:'Next: Access'}));
 expect((screen.getByLabelText('Delivery zone (optional)') as HTMLSelectElement).value).toBe('');expect(screen.queryByRole('option',{name:'Covered area · 3 km'})).toBeNull();
});
it('creates a closed draft without inventing a zone when no enabled circle covers the pin',async()=>{
 const save=vi.spyOn(apiService,'createStore').mockResolvedValue({id:'draft'});await pickup('14');expect(screen.getByRole('status').textContent).toContain('No eligible delivery zone');
 fireEvent.click(screen.getByRole('button',{name:'Next: Review'}));fireEvent.click(screen.getByLabelText('I have confirmed these store and pickup details.'));fireEvent.click(screen.getByRole('button',{name:'Create closed draft'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({zoneId:undefined,lat:14})));expect(await screen.findByText('Synthetic local store is ready for setup')).toBeTruthy();
});
it('an authoritative stale-zone refusal retains the form, refreshes coverage and never claims creation',async()=>{
 vi.spyOn(apiService,'createStore').mockRejectedValue(new ApiError(400,'Coverage changed.','ZONE_MISMATCH','zoneId'));await pickup();fill('Delivery zone (optional)','central');
 fireEvent.click(screen.getByRole('button',{name:'Next: Review'}));fireEvent.click(screen.getByLabelText('I have confirmed these store and pickup details.'));fireEvent.click(screen.getByRole('button',{name:'Create vendor'}));
 expect((await screen.findByRole('alert')).textContent).toContain('Coverage changed');expect(screen.queryByText('Store created')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Back'}));expect((screen.getByLabelText('Pickup address') as HTMLInputElement).value).toBe('Synthetic confirmed test address');
});
