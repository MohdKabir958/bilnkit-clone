// @vitest-environment jsdom
import React from 'react';
import {vi,beforeEach,afterEach,it,expect} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
vi.mock('./services/api',async()=>({...await vi.importActual<any>('./services/api'),clerkAuthEnabled:true,getAuthToken:()=>'',freshAuthToken:async()=>'explicit-clerk-fixture'}));
vi.mock('socket.io-client',()=>({io:()=>({on:vi.fn(),emit:vi.fn(),connect:vi.fn(),disconnect:vi.fn()})}));
import {App} from './App';
import {ToastProvider} from './components/ui/Toast';
import {apiService} from './services/api';
beforeEach(()=>{
 vi.spyOn(apiService,'fetchOrderPage').mockResolvedValue({orders:[],nextCursor:null});vi.spyOn(apiService,'fetchVendors').mockResolvedValue([]);vi.spyOn(apiService,'fetchDrivers').mockResolvedValue([]);vi.spyOn(apiService,'fetchDriverLocations').mockResolvedValue([]);vi.spyOn(apiService,'fetchNeedsAttention').mockResolvedValue({available:true,entries:[]});vi.spyOn(apiService,'fetchApplications').mockResolvedValue({counts:{PENDING:0,APPROVED:0,REJECTED:0,SUSPENDED:0},data:[]}as any);vi.spyOn(apiService,'fetchCampus').mockResolvedValue(null);vi.spyOn(apiService,'fetchGeography').mockResolvedValue({cities:[{id:'blr',code:'blr',name:'Bengaluru',state:'Karnataka',active:true}],zones:[],coverage:[]});
 vi.spyOn(apiService,'operations').mockResolvedValue({orders:0,active:0,grossPaise:0,openSupportCases:0,refundPaise:0,commissionPaise:0});for(const method of ['dispatchPage','supportPage','auditPage']as const)vi.spyOn(apiService,method).mockResolvedValue({data:[],nextCursor:null});vi.spyOn(apiService,'fetchAdminTeam').mockResolvedValue([]);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const mount=()=>render(<ToastProvider><App clerkAdmin={{id:'owner',name:'QA Owner',role:'ADMIN',adminRole:'OWNER'}as any}/></ToastProvider>);
it('loads live workspace data with Clerk even though the legacy token is empty',async()=>{mount();await waitFor(()=>expect(apiService.fetchVendors).toHaveBeenCalled());expect(apiService.fetchOrderPage).toHaveBeenCalled();expect(apiService.fetchDrivers).toHaveBeenCalled();expect(screen.getByRole('button',{name:'Add vendor Create a store and confirm pickup'})).toBeTruthy();});
it('sends selected city to the actual order query and shows owner-only team panel',async()=>{mount();await screen.findByRole('option',{name:'Bengaluru, Karnataka'});fireEvent.change(screen.getByLabelText('Workspace city'),{target:{value:'blr'}});await waitFor(()=>expect(apiService.fetchOrderPage).toHaveBeenCalledWith(undefined,undefined,'blr'));fireEvent.click(screen.getByRole('button',{name:'Team & access'}));await waitFor(()=>expect(apiService.fetchAdminTeam).toHaveBeenCalled());expect(screen.getByRole('button',{name:'Add administrator'})).toBeTruthy();});
it('overview Add vendor opens a creation form, while later vendor navigation opens the list',async()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Add vendor Create a store and confirm pickup'}));await screen.findByRole('dialog');expect(screen.getByLabelText('Store name')).toBeTruthy();expect(screen.getByLabelText('Primary store category')).toBeTruthy();expect(screen.queryByLabelText('Pickup latitude')).toBeNull();fireEvent.keyDown(document,{key:'Escape'});fireEvent.click(screen.getByRole('button',{name:'Overview'}));fireEvent.click(screen.getByRole('button',{name:'Vendors'}));expect(screen.queryByRole('dialog')).toBeNull();});

it('new vendor completion navigates to inventory scoped to the created store',async()=>{
 vi.spyOn(apiService,'fetchCategories').mockResolvedValue([{id:'groceries',name:'Grocery stores',isActive:true,forRestaurants:true}]as any);
 const stores:any[]=[];vi.mocked(apiService.fetchVendors).mockImplementation(async()=>[...stores]);
 vi.spyOn(apiService,'createStore').mockImplementation(async data=>{stores.push({id:'new-store',...data});return {id:'new-store'};});
 vi.spyOn(apiService,'inventoryPage').mockResolvedValue({data:[],nextCursor:null});
 mount();fireEvent.click(screen.getByRole('button',{name:'Add vendor Create a store and confirm pickup'}));
 await screen.findByRole('option',{name:'Grocery stores'});
 const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
 change('Store name','New store');change('Primary store category','groceries');fireEvent.click(screen.getByRole('button',{name:'Next: Pickup'}));
 for(const[label,value]of [['City','blr'],['Pickup address','Synthetic pickup'],['Area / locality','Town Hall'],['PIN code','560002'],['Pickup latitude','12.96393155'],['Pickup longitude','77.58425661']])change(label,value);
 fireEvent.click(screen.getByRole('button',{name:'Next: Access'}));fireEvent.click(screen.getByRole('button',{name:'Next: Review'}));fireEvent.click(screen.getByLabelText('I have confirmed these store and pickup details.'));fireEvent.click(screen.getByRole('button',{name:'Create closed draft'}));
 fireEvent.click(await screen.findByRole('button',{name:'Add products & stock'}));
 await waitFor(()=>expect(apiService.inventoryPage).toHaveBeenLastCalledWith(expect.objectContaining({vendorId:'new-store'})));
 expect((screen.getByLabelText('Inventory store')as HTMLSelectElement).value).toBe('new-store');
});
