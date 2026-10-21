// Explicit demonstration tooling only. Never imported by API startup or auth routes.
import { randomBytes, createHash } from 'crypto';
import { readFileSync, mkdirSync, copyFileSync } from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../services/password';
import { indianPoint, kmBetween, deliveryEligibility, ownedAddress } from '../services/geography';

export function validateScenario(c: any) {
  if (c?.simulationOnly !== true || !/^gzdemo-[a-z0-9-]+$/.test(c.namespace)) throw Error('A labelled, namespaced simulation is required.');
  if (!c.city?.name || !c.city?.state || c.stores?.length < 2 || c.addresses?.length < 1 || c.products?.length < 10) throw Error('Incomplete demo scenario.');
  for (const p of c.points ?? []) if (!indianPoint(p.lat,p.lng) || !/^https:\/\//.test(p.source ?? '') || !p.sourceRecordName) throw Error('Every point needs a valid published coordinate and provenance.');
  const z=c.zone;
  if (!indianPoint(z.centerLat,z.centerLng) || !(z.radiusKm>0 && z.radiusKm<=20) || !Number.isInteger(z.baseFeePaise) || !Number.isInteger(z.perKmFeePaise)) throw Error('Invalid demo service circle.');
  for(const a of [...c.stores,...c.addresses]) if(!c.points[a.point] || !/^[1-9]\d{5}$/.test(a.pinCode) || kmBetween(c.points[a.point],{lat:z.centerLat,lng:z.centerLng})>z.radiusKm)throw Error('Demo location is outside its configured zone.');
  for(const a of c.addresses)for(const s of c.stores)if(kmBetween(c.points[a.point],c.points[s.point])>z.radiusKm)throw Error('A demo delivery is not serviceable.');
  for(const p of c.products)if(!/^[a-z0-9-]+$/.test(p.id)||!Number.isInteger(p.pricePaise)||p.pricePaise<=0||!Number.isInteger(p.stockQty)||p.stockQty<0||p.mrpPaise<p.pricePaise)throw Error('Invalid demo product/stock.');
  return c;
}
export function installDemoImages(root:string, uploadRoot:string, origin:string) {
  const u=new URL(origin);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:' || (u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw Error('Use an owned HTTPS image origin or local development origin.');
  const manifest=JSON.parse(readFileSync(path.join(root,'demo/product-images.json'),'utf8'));
  const urls:Record<string,string>={};
  for(const row of manifest){
    if(!/^[a-z0-9-]+$/.test(row.id)||row.file!==`demo/assets/products/${row.id}.webp`)throw Error('Invalid demo asset path.');
    const src=path.join(root,row.file),bytes=readFileSync(src),hash=createHash('sha256').update(bytes).digest('hex');
    if(hash!==row.sha256||bytes.length>100000)throw Error('Demo image checksum/size failed.');
    const relative=`dish/2026/${hash.slice(0,32)}.webp`,dest=path.join(uploadRoot,relative);mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(src,dest);urls[row.id]=`${u.origin}/uploads/${relative}`;
  }return urls;
}
export async function createDemoScenario(db:PrismaClient,c:any,urls:Record<string,string>) {
  validateScenario(c);for(const p of c.products)if(!urls[p.id])throw Error('Missing demo product image.');
  const ns=c.namespace,accounts:any[]=[];
  const result=await db.$transaction(async(tx)=>{
    if(await tx.city.findUnique({where:{id:ns}}))throw Error('Demo already exists. No stock, credentials or orders were changed. Use a fresh isolated demo database.');
    const city=await tx.city.create({data:{id:ns,code:ns,...c.city,active:true,codEnabled:true}});
    const zone=await tx.deliveryZone.create({data:{id:`${ns}-zone`,cityId:city.id,...c.zone,active:true}});
    const storeCategory=await tx.category.create({data:{slug:`${ns}-grocery-stores`,name:'Grocery stores',forRestaurants:true,forDishes:false,showOnHome:true}});
    const categories:Record<string,string>={};
    for(const p of c.products)if(!categories[p.category]){const slug=`${ns}-${p.category.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;const cat=await tx.category.create({data:{slug,name:p.category,forRestaurants:true,forDishes:true,showOnHome:true}});categories[p.category]=cat.id;}
    const storeIds:string[]=[],addressIds:string[]=[],riderIds:string[]=[];
    for(const [role,count]of [['VENDOR',c.stores.length],['DRIVER',2],['STUDENT',c.addresses.length]] as const){
      for(let i=0;i<count;i++){
        const id=`${ns}-${role.toLowerCase()}-${i+1}`,password=randomBytes(20).toString('base64url'),phone=`900020${role==='VENDOR'?'1':role==='DRIVER'?'2':'3'}${String(i+1).padStart(3,'0')}`;
        const user=await tx.user.create({data:{id,role,name:`Demo ${role==='STUDENT'?'Customer':role==='DRIVER'?'Delivery Partner':'Vendor'} ${i+1}`,phone,email:`${id}@example.invalid`,...(role==='STUDENT'?{}:{passwordHash:await hashPassword(password)})}});
        accounts.push({userId:id,role,phone,...(role==='STUDENT'?{note:'Synthetic account; real customer login requires owned Google OAuth. No authentication bypass.'}:{password})});
        if(role==='DRIVER'){await tx.driverPartner.create({data:{id:`${id}-profile`,userId:id,name:user.name,phone,runnerCode:`${ns}-R${i+1}`,vehicleType:'Cycle',approvalStatus:'APPROVED',dutyStatus:'OFFLINE',cityId:city.id,serviceZoneId:zone.id}});riderIds.push(id);}
        if(role==='STUDENT'){const a=c.addresses[i],p=c.points[a.point];const address=await tx.address.create({data:{id:`${id}-address`,customerId:id,cityId:city.id,label:'Demo address · Simulated',pinCode:a.pinCode,houseNumber:a.houseNumber,street:p.label,locality:p.label,lat:p.lat,lng:p.lng,isDefault:true,instructions:'Simulation only. Do not send a real delivery.'}});addressIds.push(address.id);}
        if(role==='VENDOR'){
          const s=c.stores[i],p=c.points[s.point];const store=await tx.vendor.create({data:{id:`${ns}-store-${i+1}`,userId:id,name:s.name,category:storeCategory.name,primaryCategoryId:storeCategory.id,description:'Explicitly simulated grocery store for an isolated demonstration. No real merchant affiliation.',bannerImage:'',address:`Simulated pickup anchor — ${p.label}, ${c.city.name} ${s.pinCode}`,pinCode:s.pinCode,locality:p.label,lat:p.lat,lng:p.lng,cityId:city.id,locationSource:'ADMIN',locationSetAt:new Date(),approvalStatus:'APPROVED',isAcceptingOrders:true,eta:''}});storeIds.push(store.id);
          await tx.vendorCoverage.create({data:{vendorId:store.id,zoneId:zone.id,active:true}});
          for(const product of c.products){const item=await tx.menuItem.create({data:{id:`${store.id}-${product.id}`,vendorId:store.id,name:product.name,sku:`DEMO-${i+1}-${product.id.toUpperCase()}`,productKey:product.id,category:product.category,categoryId:categories[product.category],packSize:product.packSize,unit:product.unit,price:product.pricePaise/100,vendorPrice:product.pricePaise/100,mrpPaise:product.mrpPaise,stockQty:product.stockQty,isAvailable:product.stockQty>0,imageUrl:urls[product.id],imageUrls:[urls[product.id]],description:'Synthetic demo product. Original AI-generated, unbranded illustrative image; no merchant affiliation.',approvalStatus:'APPROVED',createdBy:'ADMIN'}});if(product.stockQty)await tx.stockMovement.create({data:{menuItemId:item.id,delta:product.stockQty,kind:'ADJUSTMENT',reason:'Initial isolated demonstration stock',actorId:id,reference:`${ns}:${item.id}`}});}
        }
      }
    }return {cityId:city.id,zoneId:zone.id,storeIds,addressIds,riderIds};
  },{timeout:30000,maxWait:15000});
  for(const addressId of result.addressIds){const a=await db.address.findUniqueOrThrow({where:{id:addressId}});const owned=await ownedAddress(db,a.customerId,a.id);for(const id of result.storeIds)await deliveryEligibility(db,owned,id);}
  return {...result,accounts};
}
