import {prisma} from '../harness/db';
import {createWorld,purgeWorld,createApi,World,Api} from '../harness/journey';
import {startTestServer,stopTestServer,TestServerInstance} from '../harness/app';
jest.setTimeout(60000);
describe('Primary store categories and Customer Home',()=>{
 let w:World,server:TestServerInstance,api:Api,categoryId:string;const tag='primarycategory';
 beforeAll(async()=>{server=await startTestServer();w=await createWorld(tag,'7',{customers:1,vendors:1,riders:0});api=createApi(server.baseUrl);});
 afterAll(async()=>{await purgeWorld(tag);await prisma.category.deleteMany({where:{name:{startsWith:'QA Primary'}}});await stopTestServer(server);await prisma.$disconnect();});
 test('admin-created category with only primary store usage is visible, counted once and cannot lose store purpose',async()=>{
  const response=await api.raw(tag,'post','/api/admin/categories',w.admin.token,{name:'QA Primary Groceries',forRestaurants:true,forDishes:false,showOnHome:true});expect(response.status).toBe(201);categoryId=response.body.data.id;
  const store=await prisma.vendor.update({where:{id:w.vendors[0].vendorId},data:{primaryCategoryId:categoryId,category:'QA Primary Groceries'}});
  const home=await api.raw(tag,'get','/api/categories?for=home',w.customers[0].token);expect(home.body.data.find((c:any)=>c.id===categoryId)).toMatchObject({restaurantCount:1,name:'QA Primary Groceries'});
  await prisma.vendorCategory.create({data:{vendorId:store.id,categoryId,position:0}});
  const list=await api.raw(tag,'get','/api/admin/categories',w.admin.token);expect(list.body.data.find((c:any)=>c.id===categoryId).restaurantCount).toBe(1);
  const patch=await api.raw(tag,'patch','/api/admin/categories/'+categoryId,w.admin.token,{forRestaurants:false});expect(patch.status).toBe(409);
  expect((await api.raw(tag,'post','/api/admin/categories',w.customers[0].token,{name:'QA Primary Forbidden'})).status).toBe(403);
 });
 test('an explicitly inactive new category is stored but excluded from public home categories',async()=>{
  const response=await api.raw(tag,'post','/api/admin/categories',w.admin.token,{name:'QA Primary Hidden',isActive:false,showOnHome:true});expect(response.status).toBe(201);expect(response.body.data.isActive).toBe(false);
  const home=await api.raw(tag,'get','/api/categories?for=home',w.customers[0].token);expect(home.body.data.some((c:any)=>c.id===response.body.data.id)).toBe(false);
 });
});
