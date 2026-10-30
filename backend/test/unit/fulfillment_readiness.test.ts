import {capacityDecision} from '../../src/services/capacity';
import {dispatchTiming,preparationTransitionData,fulfillmentProgress} from '../../src/services/preparation';
import {fallbackTravelEstimate,estimateTravel,setRoutingTestProvider} from '../../src/services/routing';
import {validateGpsFix,arrivalProblem} from '../../src/services/gps';
import {validateSlaPolicy,DEFAULT_SLA,slaExceptions} from '../../src/services/operationalSla';
const now=new Date('2026-10-25T12:00:00Z');
const base={workflowVersion:2,status:'ACCEPTED',createdAt:now,acceptedAt:now,driverId:null,vendor:{lat:23.0745,lng:76.859,preparationMinutes:10},addressSnapshot:{lat:23.075,lng:76.86}};
describe('fulfillment readiness policies',()=>{
 afterEach(()=>{delete process.env.CAPACITY_COD_QUEUE_ENABLED;setRoutingTestProvider(undefined);});
 test('no rider, paused service, busy store and exhausted capacity never authorize online payment',()=>{
  const input={eligibleRiders:2,pendingOrders:0,preparationMinutes:10,maxPreparingOrders:10,deliverySeconds:300,busy:false,outage:false};
  expect(capacityDecision(input,now)).toMatchObject({state:'AVAILABLE',canCheckout:true,onlineAllowed:true});
  for(const change of [{eligibleRiders:0},{busy:true},{outage:true},{pendingOrders:10}])expect(capacityDecision({...input,...change},now)).toMatchObject({canCheckout:false,onlineAllowed:false});
 });
 test('only an explicitly enabled bounded COD queue can be constrained; unavailable riders never count as a queue',()=>{
  const input={eligibleRiders:1,pendingOrders:1,preparationMinutes:10,maxPreparingOrders:10,deliverySeconds:300,busy:false,outage:false};
  expect(capacityDecision(input,now).canCheckout).toBe(false);
  process.env.CAPACITY_COD_QUEUE_ENABLED='true';
  expect(capacityDecision(input,now)).toMatchObject({state:'CONSTRAINED',canCheckout:true,onlineAllowed:false});
  expect(capacityDecision({...input,eligibleRiders:0},now).canCheckout).toBe(false);
  expect(capacityDecision({...input,pendingOrders:2},now).canCheckout).toBe(false);
 });
 test('nearby rider waits for packing; distant travel justifies early matching; ready always matches',()=>{
  expect(dispatchTiming(base,{durationSeconds:60},now).eligible).toBe(false);
  expect(dispatchTiming(base,{durationSeconds:540},now).eligible).toBe(true);
  expect(dispatchTiming({...base,status:'READY_FOR_PICKUP'},{durationSeconds:30},now).eligible).toBe(true);
  expect(dispatchTiming({...base,dispatchOverrideUntil:new Date(now.getTime()+1000)},{durationSeconds:30},now).eligible).toBe(true);
 });
 test('preparation transitions record independent server times and reject unbounded estimates',()=>{
  expect(preparationTransitionData(base,'ACCEPTED',now,15)).toMatchObject({preparationMinutes:15,estimatedReadyAt:new Date(now.getTime()+900000)});
  expect(preparationTransitionData(base,'PREPARING',now)).toHaveProperty('packingStartedAt',now);
  expect(preparationTransitionData(base,'READY_FOR_PICKUP',now)).toMatchObject({readyForPickupAt:now,dispatchNextAttemptAt:null});
  expect(()=>preparationTransitionData(base,'ACCEPTED',now,121)).toThrow();
 });
 test('ETA and delivery phases remain explicitly estimated with no premature out-for-delivery state',()=>{
  expect(fulfillmentProgress(base,now)).toMatchObject({phase:'PREPARING',estimated:true,etaSource:'DISTANCE_ESTIMATE'});
  expect(fulfillmentProgress({...base,driverId:'rider'},now)?.phase).toBe('RIDER_ASSIGNED');
  expect(fulfillmentProgress({...base,status:'PICKED_UP',pickedUpAt:now},now)?.phase).toBe('OUT_FOR_DELIVERY');
 });
 test('licensed road routing is cached; provider outage falls back with an honest source label',async()=>{
  const route=jest.fn().mockResolvedValue({distanceMeters:600,durationSeconds:120});setRoutingTestProvider({name:'fixture',estimate:route});
  const to={lat:23.075,lng:76.86};expect((await estimateTravel(base.vendor,to,now)).source).toBe('ROAD_ROUTING');
  await estimateTravel(base.vendor,to,now);expect(route).toHaveBeenCalledTimes(1);
  setRoutingTestProvider({name:'outage',estimate:async()=>{throw Error('provider down');}});
  expect((await estimateTravel(base.vendor,to,now)).source).toBe('DISTANCE_ESTIMATE');
  expect(fallbackTravelEstimate(base.vendor,to,now).durationSeconds).toBeGreaterThan(0);
 });
 test('GPS stale/future/replayed/impossible readings are refused and weak accuracy cannot confirm arrival',()=>{
  const good={lat:23.0745,lng:76.859,accuracyMeters:10,measuredAt:now,lastUpdated:now};
  expect(arrivalProblem(good,base.vendor,now)).toBeNull();
  expect(arrivalProblem({...good,accuracyMeters:300},base.vendor,now)).toMatchObject({code:'GPS_WEAK_ACCURACY'});
  expect(arrivalProblem({...good,accuracyMeters:null},base.vendor,now)).toMatchObject({code:'GPS_ACCURACY_REQUIRED'});
  expect(arrivalProblem({...good,lastUpdated:new Date(now.getTime()-121000)},base.vendor,now)).toMatchObject({code:'ARRIVAL_LOCATION_REQUIRED'});
  expect(()=>validateGpsFix(23.0745,76.859,{accuracyMeters:10,measuredAt:new Date(now.getTime()+20000).toISOString()},null,now)).toThrow();
  expect(()=>validateGpsFix(23.0745,76.859,{accuracyMeters:10,measuredAt:now.toISOString()},good,now)).toThrow();
  expect(()=>validateGpsFix(24,77,{accuracyMeters:10,measuredAt:new Date(now.getTime()+1000).toISOString()},good,new Date(now.getTime()+1000))).toThrow();
 });
 test('legacy GPS ingestion is distinguishable and never sufficient for precise arrival proof',()=>{
  const fix=validateGpsFix(23.0745,76.859,{},null,now);expect(fix.accuracyMeters).toBeNull();
  expect(arrivalProblem({...fix,lastUpdated:now},base.vendor,now)).toMatchObject({code:'GPS_ACCURACY_REQUIRED'});
 });
 test('SLA thresholds reject unsupported/unbounded settings and escalate packing truthfully',()=>{
  expect(validateSlaPolicy(DEFAULT_SLA)).toEqual(DEFAULT_SLA);
  expect(()=>validateSlaPolicy({...DEFAULT_SLA,packingDelayMinutes:999})).toThrow();
  expect(slaExceptions({...base,estimatedReadyAt:new Date(now.getTime()-6*60000)} as any,DEFAULT_SLA,now).map(a=>a.key)).toContain('PACKING_DELAY');
 });
});
