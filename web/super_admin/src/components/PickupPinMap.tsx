import {useEffect,useRef,useState} from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {DeliveryZone} from './GeographyPanel';
import type {PickupPoint} from '../lib/pickupCoverage';
const tileUrl=import.meta.env.VITE_MAP_TILE_URL||'';
/** India viewport is only a camera position. No pickup is selected until the operator acts. */
export default function PickupPinMap({point,zones,selectedZoneId,onMove}:{point:PickupPoint|null;zones:DeliveryZone[];selectedZoneId?:string;onMove:(p:PickupPoint)=>void}) {
 const host=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layers=useRef<L.LayerGroup|null>(null),move=useRef(onMove),[failed,setFailed]=useState(false);move.current=onMove;
 useEffect(()=>{if(!host.current)return;const instance=L.map(host.current,{center:point?[point.lat,point.lng]:[22,79],zoom:point?15:4,minZoom:4,maxZoom:19});map.current=instance;layers.current=L.layerGroup().addTo(instance);
  if(tileUrl&&/^https:\/\//.test(tileUrl))L.tileLayer(tileUrl,{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a> contributors'}).on('tileerror',()=>setFailed(true)).addTo(instance);
  instance.on('click',(e:L.LeafletMouseEvent)=>move.current({lat:e.latlng.lat,lng:e.latlng.lng}));
  const resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(host.current);return()=>{resize.disconnect();instance.remove();map.current=null;layers.current=null;};
 },[]);
 useEffect(()=>{const layer=layers.current,instance=map.current;if(!layer||!instance)return;layer.clearLayers();let selectedCircle:L.Circle|null=null;for(const zone of zones){const tooltip=document.createElement('span');tooltip.textContent=`${zone.name} · ${zone.radiusKm} km`;const circle=L.circle([zone.centerLat,zone.centerLng],{radius:zone.radiusKm*1000,color:zone.id===selectedZoneId?'#005b2b':'#72857b',weight:zone.id===selectedZoneId?3:1,fillOpacity:.06}).bindTooltip(tooltip).addTo(layer);if(zone.id===selectedZoneId)selectedCircle=circle;}
  if(point){const marker=L.marker([point.lat,point.lng],{draggable:true,icon:L.divIcon({className:'grozo-pickup-marker',html:'<span style="display:block;background:#005b2b;border:3px solid white;border-radius:50%;width:22px;height:22px;box-shadow:0 1px 8px #0005"></span>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(layer);marker.on('dragend',()=>{const p=marker.getLatLng();move.current({lat:p.lat,lng:p.lng});});if(selectedCircle)instance.fitBounds(selectedCircle.getBounds(),{padding:[16,16]});else instance.setView([point.lat,point.lng],Math.max(instance.getZoom(),14));}
 },[point?.lat,point?.lng,zones,selectedZoneId]);
 return <div className="space-y-2"><div ref={host} className="relative z-0 h-64 rounded-k-md border border-kraveo-line" aria-label="Pickup map: click to place, drag pin to adjust"/>{(!tileUrl||failed)&&<p className="text-xs text-kraveo-ink2">{failed?'Map background could not load.':'Map background is not configured.'} The pin and coverage circles still work. Confirm against an independently verified address or paste coordinates below.</p>}</div>;
}
