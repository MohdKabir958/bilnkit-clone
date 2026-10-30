import {prisma} from '../harness/db';
import {createWorld,purgeWorld,World} from '../harness/journey';
import {createSupportCase,updateSupportCase} from '../../src/services/supportCases';
import {registerDeviceToken} from '../../src/services/push/deviceTokens';
import {setPushProvider,noopProvider} from '../../src/services/push/provider';
import {flushNotificationIntents} from '../../src/services/push/intents';
import {PushMessage,PushApp} from '../../src/services/push/types';

jest.setTimeout(60000);
describe('Private support replies across customer, vendor and rider applications',()=>{
 let world:World;const tag='supportpush';
 beforeAll(async()=>{world=await createWorld(tag,'8',{customers:2,vendors:1,riders:1});});
 beforeEach(async()=>{await prisma.supportCase.deleteMany({where:{customerId:{startsWith:tag+'-'}}});await prisma.deviceToken.deleteMany({where:{userId:{startsWith:tag+'-'}}});setPushProvider(noopProvider);});
 afterAll(async()=>{setPushProvider(null);await purgeWorld(tag);await prisma.$disconnect();});
 const open=(actor:{id:string;role:string})=>createSupportCase(actor,{subject:'Private account help',description:'Private body with address and financial evidence.',category:'ACCOUNT_HELP'});
 const register=(userId:string,app:PushApp,token:string)=>registerDeviceToken({userId,app,token,platform:'android',appVersion:'test'});
 test.each(['CUSTOMER','VENDOR','DRIVER'] as const)('%s receives only its owned app update, with no support text on the lock screen',async app=>{
  const actor=app==='CUSTOMER'?world.customers[0]:app==='VENDOR'?world.vendors[0]:world.riders[0];
  const c=await open(actor),sent:PushMessage[]=[];
  await register(actor.id,app,'owned-'+app);await register(world.customers[1].id,'CUSTOMER','other-account');
  await updateSupportCase(world.admin,c.id,{status:'IN_PROGRESS',internal:true,message:'Private internal fraud review'});
  expect(await prisma.notificationIntent.count({where:{supportNote:{caseId:c.id}}})).toBe(0);
  await updateSupportCase(world.admin,c.id,{status:'IN_PROGRESS',message:'Confidential provider and address details'});
  const intent=await prisma.notificationIntent.findFirstOrThrow({where:{supportNote:{caseId:c.id}}});expect(intent.orderId).toBeNull();
  setPushProvider({enabled:true,send:async m=>{sent.push(m);}});
  await flushNotificationIntents();await flushNotificationIntents();
  expect(sent).toHaveLength(1);expect(sent[0].token).toBe('owned-'+app);
  expect(sent[0].data).toMatchObject({event:'SUPPORT_UPDATED',orderId:'',caseId:c.id,noteId:intent.supportNoteId,v:'1'});
  expect(JSON.stringify(sent)).not.toMatch(/Confidential|fraud|financial evidence|Private body/);
  expect((await prisma.notificationIntent.findUniqueOrThrow({where:{id:intent.id}})).state).toBe('DONE');
 });
 test('unconfigured delivery is retained, and a failed second device retries without re-sending to the acknowledged device',async()=>{
  const actor=world.customers[0],c=await open(actor);await register(actor.id,'CUSTOMER','first-device');await register(actor.id,'CUSTOMER','second-device');
  await updateSupportCase(world.admin,c.id,{status:'IN_PROGRESS',message:'An update is available.'});
  await flushNotificationIntents();let intent=await prisma.notificationIntent.findFirstOrThrow({where:{supportNote:{caseId:c.id}}});
  expect(intent).toMatchObject({state:'PENDING',attempts:0,errorCode:'PROVIDER_UNCONFIGURED'});
  const sent:string[]=[];let fails=true;
  setPushProvider({enabled:true,send:async m=>{sent.push(m.token);if(m.token==='second-device'&&fails)throw Object.assign(new Error('Temporary provider failure'),{code:'messaging/server-unavailable'});}});
  await flushNotificationIntents();intent=await prisma.notificationIntent.findUniqueOrThrow({where:{id:intent.id}});expect(intent).toMatchObject({state:'PENDING',attempts:1});
  fails=false;await prisma.notificationIntent.update({where:{id:intent.id},data:{leaseUntil:new Date(0)}});await flushNotificationIntents();
  expect(sent.filter(t=>t==='first-device')).toHaveLength(1);expect(sent.filter(t=>t==='second-device')).toHaveLength(2);
  expect((await prisma.notificationIntent.findUniqueOrThrow({where:{id:intent.id}})).state).toBe('DONE');
 });
 test('deleted accounts and dead device tokens cannot receive further support data',async()=>{
  const actor=world.customers[0],c=await open(actor);await register(actor.id,'CUSTOMER','dead-device');await updateSupportCase(world.admin,c.id,{status:'IN_PROGRESS',message:'Read your account update.'});
  setPushProvider({enabled:true,send:async()=>{throw Object.assign(new Error('Unregistered'),{code:'messaging/registration-token-not-registered'});}});await flushNotificationIntents();
  expect((await prisma.deviceToken.findUniqueOrThrow({where:{token:'dead-device'}})).disabledAt).not.toBeNull();
  const send=jest.fn();setPushProvider({enabled:true,send});await register(actor.id,'CUSTOMER','new-device');await updateSupportCase(world.admin,c.id,{status:'IN_PROGRESS',message:'Another account update.'});
  await prisma.user.update({where:{id:actor.id},data:{deletedAt:new Date()}});
  try{await flushNotificationIntents();expect(send).not.toHaveBeenCalled();}finally{await prisma.user.update({where:{id:actor.id},data:{deletedAt:null}});}
 });
});
