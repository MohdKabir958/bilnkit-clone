import { indianPoint, kmBetween } from './geography';
import { routeBetween } from './maps';

type Point = {lat:number;lng:number};
export type TravelEstimate = {
  distanceMeters:number; durationSeconds:number;
  source:'ROAD_ROUTING'|'DISTANCE_ESTIMATE'; estimated:true;
  calculatedAt:string; validUntil:string;
};
export type RoadRoutingProvider = {name:string; estimate:(from:Point,to:Point)=>Promise<{distanceMeters:number;durationSeconds:number}>};
const bounded=(raw:string|undefined,fallback:number,min:number,max:number)=>{const value=Number(raw);return raw&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;};
const ttl=()=>bounded(process.env.ROUTING_CACHE_SECONDS,120,15,600)*1000;
const cache=new Map<string,TravelEstimate>();
const inFlight=new Map<string,Promise<TravelEstimate>>();
let transportProvider:RoadRoutingProvider|null|undefined;
let active=0;let budgetStart=0;let used=0;
const keyOf=(a:Point,b:Point)=>`${a.lat.toFixed(3)},${a.lng.toFixed(3)}:${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;

/** Explicit operator-licensed OSRM-compatible HTTPS service; never a guessed public endpoint. */
const configuredProvider=():RoadRoutingProvider|null=> {
  if(transportProvider!==undefined)return transportProvider;
  if(process.env.ROUTING_PROVIDER!=='osrm'||process.env.ROUTING_LICENSE_ACK!=='true'||!process.env.MAPS_ROUTER_URL)return null;
  return {name:'operator-configured-osrm',estimate:async(from,to)=>{
    const route=await routeBetween(from,to);return {distanceMeters:route.distanceMeters,durationSeconds:route.durationSeconds};
  }};
};
/** Only test fixtures may replace the real provider. Production configuration remains server-owned. */
export const setRoutingTestProvider=(provider:RoadRoutingProvider|null|undefined)=>{
  if(process.env.NODE_ENV!=='test')throw Error('Routing fixture injection is test-only.');
  transportProvider=provider;cache.clear();inFlight.clear();active=0;used=0;budgetStart=0;
};
export function fallbackTravelEstimate(from:Point,to:Point,now=new Date()):TravelEstimate {
  if(!indianPoint(from.lat,from.lng)||!indianPoint(to.lat,to.lng))throw Error('Valid configured Indian route pins are required.');
  const distanceMeters=Math.ceil(kmBetween(from,to)*1000*bounded(process.env.ROUTING_DETOUR_FACTOR,1.35,1,3));
  const durationSeconds=Math.ceil(distanceMeters/(bounded(process.env.ROUTING_FALLBACK_KPH,18,8,45)*1000/3600)+120);
  return {distanceMeters,durationSeconds,source:'DISTANCE_ESTIMATE',estimated:true,calculatedAt:now.toISOString(),validUntil:new Date(now.getTime()+ttl()).toISOString()};
}
/** Bounded in-process cache/rate budget; no road-provider I/O should run inside a DB transaction. */
export async function estimateTravel(from:Point,to:Point,now=new Date()):Promise<TravelEstimate> {
  const fallback=fallbackTravelEstimate(from,to,now),key=keyOf(from,to),saved=cache.get(key);
  if(saved&&Date.parse(saved.validUntil)>now.getTime())return saved;
  const existing=inFlight.get(key);if(existing)return existing;
  const provider=configuredProvider();
  if(now.getTime()-budgetStart>=60_000){budgetStart=now.getTime();used=0;}
  if(!provider||active>=4||used>=bounded(process.env.ROUTING_REQUESTS_PER_MINUTE,30,1,120))return fallback;
  const run=(async()=>{
    active++;used++;
    try {
      const raw=await provider.estimate(from,to);
      if(!Number.isFinite(raw.distanceMeters)||!Number.isFinite(raw.durationSeconds)||raw.distanceMeters<0||raw.distanceMeters>2_000_000||raw.durationSeconds<0||raw.durationSeconds>172800)throw Error('Invalid routing estimate.');
      const result:TravelEstimate={...fallback,distanceMeters:Math.ceil(raw.distanceMeters),durationSeconds:Math.ceil(raw.durationSeconds),source:'ROAD_ROUTING'};
      cache.set(key,result);if(cache.size>1000)cache.delete(cache.keys().next().value!);return result;
    } catch {return fallback;} finally {active--;inFlight.delete(key);}
  })();inFlight.set(key,run);return run;
}
