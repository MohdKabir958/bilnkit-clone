import {expect,it} from 'vitest';
import {pickupPoint,pickupZones,pickupDistanceKm} from './pickupCoverage';
const center={lat:12.96,lng:77.58};
const zone={id:'central',cityId:'blr',name:'Central',centerLat:center.lat,centerLng:center.lng,radiusKm:3,baseFeePaise:2500,perKmFeePaise:0,active:true};
it('uses confirmed numeric Indian coordinates and never invents a default pin',()=>{
 expect(pickupPoint('12.96','77.58')).toEqual(center);
 for(const p of [[null,77.58],['',77.58],[' ',77.58],['invalid',77.58],[Infinity,77.58],[0,0],[40,77.58],[12.96,100]])expect(pickupPoint(...p as [unknown,unknown])).toBeNull();
});
it('filters enabled city zones by center, exact boundary and outside the Haversine circle',()=>{
 expect(pickupZones([zone],'blr',center)).toEqual([zone]);
 const boundary={lat:center.lat+0.02,lng:center.lng},distance=pickupDistanceKm(center,boundary);
 expect(pickupZones([{...zone,radiusKm:distance}],'blr',boundary)).toHaveLength(1);
 expect(pickupZones([{...zone,radiusKm:distance-0.000001}],'blr',boundary)).toHaveLength(0);
 expect(pickupZones([zone],'pune',center)).toHaveLength(0);expect(pickupZones([{...zone,active:false}],'blr',center)).toHaveLength(0);
 expect(pickupZones([zone],'blr',null)).toHaveLength(0);expect(pickupZones([],'blr',center)).toHaveLength(0);
});
