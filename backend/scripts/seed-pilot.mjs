// Explicit local-development pilot fixture. Never imported by the API or production startup.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../dist/services/password.js';
if(process.env.NODE_ENV!=='development'||process.env.PILOT_SEED!=='1')throw Error('Pilot seeding requires NODE_ENV=development PILOT_SEED=1.');
const database=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1','database'].includes(database.hostname))throw Error('The development pilot seed is restricted to a local database.');
const name=process.env.PILOT_CITY_NAME||'Bengaluru',state=process.env.PILOT_CITY_STATE||'Karnataka';
const lat=Number(process.env.PILOT_CITY_LAT||12.9716),lng=Number(process.env.PILOT_CITY_LNG||77.5946),pinCode=process.env.PILOT_PIN_CODE||'560001';
if(!(lat>=6&&lat<=38&&lng>=68&&lng<=98)||!/^[1-9][0-9]{5}$/.test(pinCode))throw Error('Configure a valid Indian location and PIN.');
const output=path.resolve(process.env.PILOT_CREDENTIAL_FILE||'var/pilot-credentials.json');
if(existsSync(output))throw Error('Pilot credential file already exists. No accounts or passwords were changed.');
const db=new PrismaClient(),accounts=[];
try {
 await db.$transaction(async tx=>{
  if(await tx.city.findUnique({where:{id:'development-pilot-city'}}))throw Error('The pilot already exists; no data was changed.');
  const city=await tx.city.create({data:{id:'development-pilot-city',code:'development-pilot-city',name,state,active:true}});
  const zone=await tx.deliveryZone.create({data:{id:'development-pilot-zone',cityId:city.id,name:'Development pilot service circle',centerLat:lat,centerLng:lng,radiusKm:5,baseFeePaise:2500,active:true}});
  const catalog=[['Rice','Rice, grains and pulses','kg','1',8500],['Milk','Dairy','ml','500',3000],['Bananas','Fruits and vegetables','pcs','6',5000],['Bread','Bakery','g','400',4500],['Soap','Personal care','g','100',3500],['Dal','Rice, grains and pulses','g','500',6500],['Tea','Beverages','g','250',12000],['Biscuits','Snacks','g','200',4000],['Dishwashing liquid','Household essentials','ml','500',10000],['Yogurt','Dairy','g','200',2500]];
  const categories=new Map();for(const [,category]of catalog)if(!categories.has(category)){const slug=category.toLowerCase().replace(/[^a-z0-9]+/g,'-');const c=await tx.category.upsert({where:{slug},create:{slug,name:category,forRestaurants:true,forDishes:true,showOnHome:true},update:{}});categories.set(category,c.id);}
  for(const [role,count]of [['VENDOR',2],['DRIVER',3],['STUDENT',3]])for(let index=1;index<=count;index++){
   const id=`development-pilot-${role.toLowerCase()}-${index}`,phone=`9000100${role==='VENDOR'?'1':role==='DRIVER'?'2':'3'}${String(index).padStart(2,'0')}`,password=randomBytes(18).toString('base64url');
   const user=await tx.user.create({data:{id,role,name:`Pilot ${role==='STUDENT'?'Customer':role==='DRIVER'?'Rider':'Store'} ${index}`,phone,email:`${id}@example.invalid`,...(role!=='STUDENT'?{passwordHash:await hashPassword(password)}:{})}});
   accounts.push({role,userId:user.id,phone,...(role!=='STUDENT'?{password}:{note:'Customer login requires your owned Google OAuth configuration; automated pilot tests use test-only JWTs.'})});
   if(role==='DRIVER')await tx.driverPartner.create({data:{userId:user.id,name:user.name,phone,runnerCode:`PILOT-${index}`,vehicleType:'Cycle',approvalStatus:'APPROVED',dutyStatus:'OFFLINE',cityId:city.id,serviceZoneId:zone.id}});
   if(role==='STUDENT')await tx.address.create({data:{customerId:user.id,cityId:city.id,label:'Development address',pinCode,locality:'Pilot locality',houseNumber:`Flat ${index}`,street:'Pilot street',lat:lat+.001,lng:lng+.001,isDefault:true}});
   if(role==='VENDOR'){
    const vendor=await tx.vendor.create({data:{id:`development-pilot-store-${index}`,userId:user.id,name:user.name,category:'Groceries',address:'Development pilot store location',pinCode,locality:'Pilot locality',bannerImage:'',lat:lat+(index-1)*.002,lng,cityId:city.id,locationSource:'ADMIN',locationSetAt:new Date(),approvalStatus:'APPROVED',isAcceptingOrders:true}});
    await tx.vendorCoverage.create({data:{vendorId:vendor.id,zoneId:zone.id,active:true}});
    for(let sku=0;sku<(index===1?50:30);sku++){
     const [product,category,unit,packSize,paise]=catalog[sku%catalog.length];
     const row=await tx.menuItem.create({data:{vendorId:vendor.id,name:`${product} ${Math.floor(sku/10)+1}`,description:'Explicit development pilot grocery pack',sku:`PILOT-${index}-${sku+1}`,productKey:`pilot-${index}-${sku%10}`,category,categoryId:categories.get(category),unit,packSize,price:paise/100,vendorPrice:paise/100,mrpPaise:paise+1000,stockQty:30,imageUrl:'',imageUrls:[],approvalStatus:'APPROVED',createdBy:'ADMIN'}});
     await tx.stockMovement.create({data:{menuItemId:row.id,delta:30,kind:'ADJUSTMENT',reason:'Initial explicit development pilot stock',actorId:user.id,reference:`pilot-seed:${row.id}`}});
    }
   }
  }
 },{timeout:30000,maxWait:15000});
 mkdirSync(path.dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify({developmentOnly:true,city:name,accounts},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(`Development pilot persisted: 2 stores, 80 SKUs, 3 customers, 3 offline riders. Credentials saved privately at ${output}.`);
}finally{await db.$disconnect();}
