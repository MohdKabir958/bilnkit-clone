// Local browser capture entry. Never imported by the production application.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/plus-jakarta-sans';
import '../../../web/super_admin/src/index.css';
import milkPhoto from '../../../demo/assets/products/milk.webp';
import {App} from '../../../web/super_admin/src/App';
import {ClerkAdminRoot} from '../../../web/super_admin/src/auth/ClerkAdmin';
import {ToastProvider} from '../../../web/super_admin/src/components/ui/Toast';
import {fulfillmentApi} from '../../../web/super_admin/src/services/fulfillmentApi';
import {apiService,installClerkTokenGetter} from '../../../web/super_admin/src/services/api';
const cities=[{id:'blr',code:'bengaluru-ka',name:'Bengaluru',state:'Karnataka',active:true,codEnabled:true},{id:'pune',code:'pune-mh',name:'Pune',state:'Maharashtra',active:true}];
const vendors=[{id:'demo-market-one',cityId:'blr',name:'Grozo Demo Market One · Simulated',primaryCategoryId:'grocery-store',publicPhone:'+919000000001',description:'An explicitly simulated grocery shop.',category:'Grocery stores',rating:0,totalRatingsCount:0,isAcceptingOrders:false,address:'Simulated pickup · Town Hall, Bengaluru 560002',pinCode:'560002',locality:'Town Hall',lat:12.96393155,lng:77.58425661,hasLocation:true,locationSource:'ADMIN',activeOrdersCount:0,approvalStatus:'APPROVED'}, {id:'demo-market-two',cityId:'blr',name:'Grozo Demo Pantry · Simulated',primaryCategoryId:'grocery-store',publicPhone:'+919000000001',description:'An explicitly simulated grocery shop.',category:'Grocery stores',rating:0,isAcceptingOrders:false,address:'Simulated pickup · Town Hall, Bengaluru 560002',lat:12.96393155,lng:77.58425661,hasLocation:true,locationSource:'ADMIN',activeOrdersCount:0,approvalStatus:'APPROVED'}];
const zones=[{id:'central',cityId:'blr',name:'Town Hall demonstration area',centerLat:12.96393155,centerLng:77.58425661,radiusKm:3,baseFeePaise:2500,perKmFeePaise:0,active:true}];
const riders:any[]=[];
const team=[{id:'owner',email:'owner@example.test',displayName:'Demo Owner',role:'OWNER',status:'ACTIVE',createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),isCurrentUser:true},{id:'operator',email:'operations@example.test',displayName:'Demo Administrator',role:'ADMIN',status:'ACTIVE',createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),isCurrentUser:false},{id:'pending',email:'new.member@example.test',displayName:null,role:'ADMIN',status:'INVITED',createdAt:new Date().toISOString(),acceptedAt:null,isCurrentUser:false}];
Object.assign(fulfillmentApi,{policy:async()=>({thresholds:{packingDelayMinutes:10,riderSearchMinutes:5,pickupDelayMinutes:10,deliveryDelayMinutes:15,missingUpdateMinutes:5,acceptanceWarningPercent:75},vendorAcceptWindowMinutes:10})});
Object.assign(apiService,{
 backgroundJobs:async()=>[{name:'notification-outbox',state:'READY',attempts:0,maxAttempts:8,lastSuccessAt:new Date().toISOString(),nextRunAt:new Date(Date.now()+60000).toISOString()}],backgroundJobRuns:async()=>[{id:'synthetic-run',state:'SUCCEEDED',startedAt:new Date().toISOString()}],complianceReminders:async()=>[{vendorId:'demo-market-one',businessName:'Grozo Demo Market One · Simulated',fssaiExpiresAt:new Date(Date.now()+7*86400000).toISOString(),status:'PENDING'}],
 operationExceptions:async()=>({data:[],truncated:false}),supportOwners:async()=>[],cashCloses:async()=>[],
 createStore:async(data:any)=>{const row={id:'new-demo-store',...data,isAcceptingOrders:false,approvalStatus:'APPROVED',category:'Grocery stores',hasLocation:true,locationSource:'ADMIN'};vendors.push(row);return row;},
 createRider:async(data:any)=>{const row={id:'new-demo-rider',...data,studentRegNo:'',runnerCode:'SIM-ONLY',dutyStatus:'OFFLINE',approvalStatus:data.approve?'APPROVED':'PENDING',createdAt:new Date().toISOString()};riders.push(row);return row;},
 fetchGeography:async()=>({cities,zones,coverage:[]}),fetchVendors:async()=>[...vendors],fetchOrderPage:async()=>({orders:[],nextCursor:null}),fetchDrivers:async()=>[...riders],fetchDriverLocations:async()=>[],fetchNeedsAttention:async()=>({available:true,entries:[]}),fetchApplications:async()=>({data:[],counts:{PENDING:0,APPROVED:0,REJECTED:0,SUSPENDED:0}}),fetchCatalogPendingCounts:async()=>({pending:0,changePending:0,total:0}),fetchPendingSettlementCount:async()=>0,
 operations:async()=>({from:'2026-10-20T18:30:00Z',to:'2026-10-27T10:00:00Z',days:7,refreshedAt:'2026-10-27T10:00:00Z',cityId:null,orders:0,delivered:0,active:0,capturedPaise:0,receivedCashPaise:0,pendingCashPaise:0,approvedStores:2,openStores:0,pendingApprovals:0,urgentOrders:0,statuses:[],payments:[],topVendors:[],riders:[],trend:Array.from({length:7},(_,i)=>({date:`2026-10-${21+i}`,orders:0,capturedPaise:0,receivedCashPaise:0})),definitions:{orders:'Synthetic fixture: zero persisted orders represented. Store-order counts.',money:'Verified captured online and platform cash receipts before refunds; selected order cohort.',pendingCash:'Unremitted rider cash is excluded.',network:'Current city snapshot; demonstration fixtures only.'}}),dispatchPage:async()=>({data:[],nextCursor:null}),supportPage:async()=>({data:[],nextCursor:null}),auditPage:async()=>({data:[],nextCursor:null}),fetchAdminTeam:async()=>team,
 inviteAdmin:async(email:string,role:string)=>{team.push({id:'new',email,role,status:'INVITED',displayName:null,createdAt:new Date().toISOString(),acceptedAt:null,isCurrentUser:false});},
 fetchCategories:async()=>[{id:'grocery-store',slug:'grocery-stores',name:'Grocery stores',icon:'store',isActive:true,forRestaurants:true,forDishes:false,sortOrder:0,showOnHome:true},{id:'dairy',name:'Dairy',isActive:true,forDishes:true}],
 fetchCash:async()=>({success:true,data:[{id:'cash-demo',orderId:'simulated-order-001',driverUserId:'simulated-rider-001',amountPaise:20500,collectedAt:new Date().toISOString(),remittedAt:null,refundedAt:null,order:{status:'DELIVERED',vendor:{name:vendors[0].name,cityId:'blr'}}}],nextCursor:null}),
 inventoryPage:async({vendorId=''}={})=>vendorId&&vendorId!==vendors[0].id?{data:[],nextCursor:null}:({data:[{id:'milk',name:'Milk',vendorId:vendors[0].id,vendor:{name:vendors[0].name},packSize:'500',unit:'ml',sku:'MILK-500',stockQty:20,stockVersion:1,pricePaise:3200,mrpPaise:3500,approvalStatus:'APPROVED',imageUrls:[milkPhoto]}],nextCursor:null}),
});
Object.assign(apiService,{
 vendorDirectory:async({q='',page='1'}={})=>({total:vendors.filter(v=>v.name.toLowerCase().includes(q.toLowerCase())).length,page:Number(page),limit:24,rows:vendors.filter(v=>v.name.toLowerCase().includes(q.toLowerCase())).map(v=>({...v,productCount:1,cityName:'Bengaluru'}))}),
 vendorDetails:async(id:string)=>({...vendors.find(v=>v.id===id),productCount:1,coverage:[],operatingHours:null,cuisines:[]}),
 vendorAudit:async()=>({rows:[],nextCursor:null}),
 searchPickupLocations:async()=>[{label:'Simulated demo at independently referenced Town Hall, Bengaluru 560002',lat:12.96393155,lng:77.58425661,pinCode:'560002'}],
 riderInvitations:async()=>[],
 createRiderInvitation:async()=>({id:'fixture-invitation',expiresAt:'2026-10-30T10:00:00Z',inviteUrl:'https://synthetic.grozo.invalid/partner-invite#invite='+ 'a'.repeat(64),delivery:{mode:'MANUAL',sent:false}}),
 checkRiderEligibility:async()=>{throw new Error('Ask this partner to create a Clerk account and verify this email before assignment.');},
 createCategory:async(input:any)=>({id:'synthetic-inline-category',...input,isActive:true}),
 openCatalogAssistance:async({vendorId}:{vendorId:string})=>({id:'fixture-assistance',vendorId,expiresAt:'2030-01-01T00:00:00Z'})
});
installClerkTokenGetter(async()=>'local-browser-fixture-only');
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('login')?<ClerkAdminRoot/>:<ToastProvider><App clerkAdmin={{id:'owner',name:'Demo Owner',role:'ADMIN',adminRole:'OWNER'}}/></ToastProvider>);
