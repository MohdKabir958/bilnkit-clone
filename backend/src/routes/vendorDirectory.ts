import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {prisma} from '../db';
import {requireAuth,requireRole} from '../middleware/auth';
import {fail,validParams,ID_RE} from '../utils/http';
import {text} from '../services/geography';
import {AppError} from '../utils/appError';
export const vendorDirectoryRouter=Router();
const admin=[requireAuth,requireRole('ADMIN')];
const compact={
 id:true,name:true,category:true,primaryCategoryId:true,approvalStatus:true,isAcceptingOrders:true,
 bannerImage:true,cityId:true,locality:true,address:true,city:{select:{name:true}},primaryCategory:{select:{name:true}},
 _count:{select:{
   menuItems:{where:{deletedAt:null}},
   orders:{where:{status:{notIn:['DELIVERED','CANCELLED'] as ('DELIVERED'|'CANCELLED')[]}}}
 }}
} as const;
vendorDirectoryRouter.get('/v1/admin/vendor-directory',...admin,async(req,res)=>{try{
 const q=text(req.query.q??'','q',100,false),cityId=req.query.cityId===undefined?undefined:text(req.query.cityId,'cityId',64),categoryId=req.query.categoryId===undefined?undefined:text(req.query.categoryId,'categoryId',64);
 const page=Number(req.query.page??1),limit=Number(req.query.limit??24);
 if(!Number.isInteger(page)||page<1||page>10000||!Number.isInteger(limit)||limit<1||limit>48)throw new AppError(400,'BAD_PAGE','Choose page 1–10000 and a limit up to 48.');
 const status=req.query.status,open=req.query.open;
 if(status!==undefined&&!['PENDING','APPROVED','REJECTED','SUSPENDED'].includes(String(status)))throw new AppError(400,'BAD_STATUS','Choose a valid approval state.');
 if(open!==undefined&&!['true','false'].includes(String(open)))throw new AppError(400,'BAD_STATUS','Choose open or closed.');
 const where:Prisma.VendorWhereInput={...(cityId?{cityId}:{}),...(categoryId?{primaryCategoryId:categoryId}:{}),...(status?{approvalStatus:status as any}:{}),...(open?{isAcceptingOrders:open==='true'}:{}),...(q?{OR:[{name:{contains:q,mode:'insensitive'}},{address:{contains:q,mode:'insensitive'}},{locality:{contains:q,mode:'insensitive'}},{category:{contains:q,mode:'insensitive'}},{primaryCategory:{name:{contains:q,mode:'insensitive'}}},{cuisines:{some:{category:{name:{contains:q,mode:'insensitive'}}}}}]}:{})};
 const [total,rows]=await prisma.$transaction([prisma.vendor.count({where}),prisma.vendor.findMany({where,select:compact,orderBy:[{name:'asc'},{id:'asc'}],skip:(page-1)*limit,take:limit})],{isolationLevel:'RepeatableRead'});
 res.set('Cache-Control','no-store').json({success:true,data:{total,page,limit,rows:rows.map(v=>({...v,category:v.primaryCategory?.name??v.category,productCount:v._count.menuItems,activeOrdersCount:v._count.orders,cityName:v.city?.name??'City not assigned',_count:undefined,city:undefined,primaryCategory:undefined}))}});
 }catch(e){fail(res,e,'Vendor directory');}});
vendorDirectoryRouter.get('/v1/admin/vendor-directory/:id',...admin,validParams('id'),async(req,res)=>{try{
 const row=await prisma.vendor.findUnique({where:{id:req.params.id},select:{...compact,userId:true,description:true,publicPhone:true,pinCode:true,lat:true,lng:true,locationSource:true,locationSetAt:true,locationAccuracyM:true,operatingHours:true,rating:true,totalRatingsCount:true,fssaiNumber:true,eta:true,commissionType:true,commissionValue:true,cuisines:{orderBy:{position:'asc'},select:{category:{select:{id:true,name:true,icon:true}}}},coverage:{select:{active:true,zoneId:true,zone:{select:{name:true,active:true}}}}}});
 if(!row)throw new AppError(404,'NOT_FOUND','Store not found.');
 res.set('Cache-Control','no-store').json({success:true,data:{...row,cuisines:row.cuisines.map(c=>c.category),productCount:row._count.menuItems,activeOrdersCount:row._count.orders,cityName:row.city?.name??'City not assigned'}});
 }catch(e){fail(res,e,'Vendor detail');}});
vendorDirectoryRouter.get('/v1/admin/vendor-directory/:id/audit',...admin,validParams('id'),async(req,res)=>{try{
 const after=req.query.after;if(after!==undefined&&(typeof after!=='string'||!ID_RE.test(after)))throw new AppError(400,'BAD_CURSOR','Invalid audit cursor.');
 const rows=await prisma.adminAuditLog.findMany({where:{targetType:'VENDOR',targetId:req.params.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,...(after?{cursor:{id:after as string},skip:1}:{})});
 res.set('Cache-Control','no-store').json({success:true,data:{rows:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null}});
 }catch(e){fail(res,e,'Vendor audit');}});
