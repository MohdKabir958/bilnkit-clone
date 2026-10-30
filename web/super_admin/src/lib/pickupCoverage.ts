import type {DeliveryZone} from '../components/GeographyPanel';
export type PickupPoint={lat:number;lng:number};
export function pickupPoint(lat:unknown,lng:unknown):PickupPoint|null {
  if((typeof lat!=='number'&&typeof lat!=='string')||(typeof lng!=='number'&&typeof lng!=='string')||String(lat).trim()===''||String(lng).trim()==='')return null;
  const point={lat:Number(lat),lng:Number(lng)};
  return Number.isFinite(point.lat)&&Number.isFinite(point.lng)&&point.lat>=6&&point.lat<=38&&point.lng>=68&&point.lng<=98?point:null;
}
/** Same Haversine circle and Earth radius as the authoritative backend geography service. */
export function pickupDistanceKm(a:PickupPoint,b:PickupPoint):number {
  const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
  return 6371.0088*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export const pickupZones=(zones:DeliveryZone[],cityId:string,point:PickupPoint|null)=>point?zones.filter(zone=>zone.active&&zone.cityId===cityId&&Number.isFinite(zone.radiusKm)&&zone.radiusKm>0&&pickupPoint(zone.centerLat,zone.centerLng)&&pickupDistanceKm(point,{lat:zone.centerLat,lng:zone.centerLng})<=zone.radiusKm):[];
