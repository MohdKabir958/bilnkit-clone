import {API_BASE_URL,ApiError,freshAuthToken,publicClerkFrontendOrigin} from './api';
export type SlaPolicy={packingDelayMinutes:number;riderSearchMinutes:number;pickupDelayMinutes:number;deliveryDelayMinutes:number;missingUpdateMinutes:number;acceptanceWarningPercent:number};
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const control=new AbortController(),timer=window.setTimeout(()=>control.abort(),20000);
 try {
  const token=await freshAuthToken(),instance=publicClerkFrontendOrigin();
  if(control.signal.aborted)throw new ApiError(0,'Request timed out. Retry after checking the connection.','TIMEOUT');
  const response=await fetch(`${API_BASE_URL}/api${path}`,{method,signal:control.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Grozo-Auth-Mode':import.meta.env.VITE_AUTH_MODE||'legacy','X-Grozo-Client-Protocol':'1','X-Grozo-Client':'admin/web',...(instance?{'X-Grozo-Clerk-Frontend':instance}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json().catch(()=>({}));if(!response.ok)throw new ApiError(response.status,value.message||'The operation could not be completed.',value.code);return value.data as T;
 }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(0,control.signal.aborted?'The server took too long. Retry safely.':'Check the network connection and retry.');}finally{window.clearTimeout(timer);}
}
export const fulfillmentApi={
 policy:()=>request<{thresholds:SlaPolicy;vendorAcceptWindowMinutes:number}>('/v1/admin/operations/sla-policy'),
 savePolicy:(thresholds:SlaPolicy,reason:string)=>request<SlaPolicy>('/v1/admin/operations/sla-policy','PUT',{thresholds,reason}),
 earlyDispatch:(orderId:string,reason:string,evidenceReference:string)=>request(`/v1/admin/orders/${encodeURIComponent(orderId)}/dispatch/start-early`,'POST',{reason,evidenceReference}),
 requestGps:(orderId:string,scope:'PICKUP'|'DROPOFF',reason:string,evidenceReference:string)=>request<{id:string}>(`/v1/admin/orders/${encodeURIComponent(orderId)}/gps-exceptions`,'POST',{scope,reason,evidenceReference}),
 approveGps:(id:string)=>request(`/v1/admin/gps-exceptions/${encodeURIComponent(id)}/approve`,'POST',{}),
};
