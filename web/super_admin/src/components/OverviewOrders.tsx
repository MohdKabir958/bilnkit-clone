import {useEffect,useRef,useState} from 'react';
import {apiService,ApiError} from '../services/api';
import type {Order} from '../types';
import {OverviewScope,inOverviewScope} from '../lib/overview';
import {OrdersTable} from './OrdersTable';
import type {AdvanceHandler} from './OrderControls';
/** Separate server-paginated result set; normal socket/poll lists cannot overwrite a drill-down. */
export function OverviewOrders({scope,cityId,onAuthError,onOpenOrder,onAdvance,now}:{scope:OverviewScope;cityId:string;onAuthError:(e:unknown)=>void;onOpenOrder:(id:string)=>void;onAdvance:AdvanceHandler;now:number}) {
  const [rows,setRows]=useState<Order[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0);
  const load=async(more=false)=>{const seq=++generation.current;setBusy(true);setError('');try{const page=await apiService.fetchOrderPage(more?cursor:undefined,100,cityId,scope);if(seq!==generation.current)return;setRows(old=>more?[...old,...page.orders]:page.orders);setCursor(page.nextCursor);}catch(e){if(seq===generation.current){setError(e instanceof Error?e.message:'Orders could not load.');if(e instanceof ApiError&&[401,403].includes(e.status))onAuthError(e);}}finally{if(seq===generation.current)setBusy(false);}};
  useEffect(()=>{setRows([]);setCursor(null);void load();return()=>{generation.current++;};},[scope,cityId]);
  return <section className="space-y-3"><button className="k-btn-ghost" disabled={busy} onClick={()=>void load()}>Refresh filtered orders</button>{error&&<p role="alert">{error}</p>}<OrdersTable orders={rows.filter(o=>inOverviewScope(o,scope))} attentionIds={new Set()} onOpenOrder={onOpenOrder} onAdvance={async(...args)=>{const result=await onAdvance(...args);await load();return result===true;}} now={now} loading={busy} hasMore={!!cursor} loadingOlder={busy} onLoadOlder={()=>void load(true)}/></section>;
}
