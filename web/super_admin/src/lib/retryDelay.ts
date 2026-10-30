import {useEffect,useState} from 'react';
import {ApiError} from '../services/api';
export function retryDelaySeconds(error:unknown):number {
  if(!(error instanceof ApiError)||error.status!==429)return 0;
  const value=error.extra?.retryAfterSeconds;
  return typeof value==='number'&&Number.isFinite(value)&&value>0?Math.min(86400,Math.ceil(value)):60;
}
/** Re-enables an operator control after Retry-After; never automatically repeats a mutation. */
export function useRetryDelay() {
  const [until,setUntil]=useState(0),[,tick]=useState(0);
  useEffect(()=>{if(until<=Date.now())return;const timer=window.setInterval(()=>{tick(v=>v+1);if(Date.now()>=until)window.clearInterval(timer);},1000);return()=>window.clearInterval(timer);},[until]);
  return {seconds:Math.max(0,Math.ceil((until-Date.now())/1000)),apply:(error:unknown)=>{const seconds=retryDelaySeconds(error);if(seconds)setUntil(Date.now()+seconds*1000);}};
}
