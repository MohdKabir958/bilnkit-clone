import {useState} from 'react';
import {apiService} from '../services/api';

const date=(value:unknown)=>typeof value==='string'&&!Number.isNaN(Date.parse(value))?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'Not recorded';
export function OperationalHealthPanel({onAuthError}:{onAuthError:(error:unknown)=>void}) {
  const [jobs,setJobs]=useState<any[]>([]),[documents,setDocuments]=useState<any[]>([]),[runs,setRuns]=useState<any[]>([]);
  const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[selected,setSelected]=useState(''),[reason,setReason]=useState('');
  const fail=(e:unknown)=>{onAuthError(e);setError(e instanceof Error?e.message:'Operational health could not be loaded.');};
  const load=async()=>{setBusy(true);setError('');try{const [j,d]=await Promise.all([apiService.backgroundJobs(),apiService.complianceReminders()]);setJobs(j);setDocuments(d);setLoaded(true);}catch(e){fail(e);}finally{setBusy(false);}};
  const inspect=async(name:string)=>{setBusy(true);setError('');setSelected(name);setReason('');setMessage('');setRuns([]);try{setRuns(await apiService.backgroundJobRuns(name));}catch(e){fail(e);}finally{setBusy(false);}};
  const retry=async(e:React.FormEvent)=>{e.preventDefault();if(reason.trim().length<8)return;setBusy(true);setError('');try{await apiService.retryBackgroundJob(selected,reason.trim());setMessage('Recovery requested. The worker will claim eligible work; this is not confirmation of a payment or refund.');setSelected('');await load();}catch(e){fail(e);}finally{setBusy(false);}};
  return <details className="k-panel space-y-4" onToggle={e=>{if(e.currentTarget.open&&!loaded&&!busy)void load();}}>
    <summary className="cursor-pointer font-bold">Platform job health and seller reminders</summary>
    <p className="text-sm text-kraveo-ink2">These records cover the platform. Times use India Standard Time. Investigate failures before requesting a retry.</p>
    <button className="k-btn-ghost" disabled={busy} onClick={()=>void load()}>Refresh operational health</button>
    {busy&&<p role="status">Checking operational health…</p>}{error&&<p role="alert" className="text-kraveo-danger">{error}</p>}{message&&<p role="status">{message}</p>}
    <h3 className="font-bold">Background work</h3>
    {loaded&&!jobs.length&&<p>No background jobs have registered yet. Check the backend worker.</p>}
    <div className="space-y-3">{jobs.map(job=><article key={job.name} className="rounded-k-md border border-kraveo-line p-4 space-y-2"><strong>{job.name} · {job.state}</strong><p className="text-sm">Attempts {job.attempts} / {job.maxAttempts} · Last success {date(job.lastSuccessAt)} · Next eligible run {date(job.nextRunAt)}</p>{job.lastErrorCode&&<p className="text-sm">Failure code: {job.lastErrorCode}</p>}<button className="k-btn-ghost" disabled={busy} onClick={()=>void inspect(job.name)}>Inspect {job.name}</button></article>)}</div>
    {selected&&<form className="space-y-3 rounded-k-md border border-kraveo-line p-4" onSubmit={retry}><h4 className="font-bold">{selected} history and recovery</h4>{runs.length===0?<p>No execution history recorded.</p>:runs.map(run=><p key={run.id} className="text-sm">{date(run.startedAt)} · {run.state}{run.errorCode?` · ${run.errorCode}`:''}{run.recovered?' · recovered expired lease':''}</p>)}<label className="block text-sm">Investigation and recovery reason<textarea required minLength={8} maxLength={300} className="k-input mt-1 w-full" value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="k-btn-primary" disabled={busy||reason.trim().length<8||jobs.find(j=>j.name===selected)?.state==='RUNNING'}>Request safe job retry</button><p className="text-xs text-kraveo-ink2">An active worker cannot be duplicated. Retry does not bypass provider checks or mark financial work complete.</p></form>}
    <h3 className="font-bold">FSSAI expiry reminders · next 30 days and overdue</h3>
    {loaded&&!documents.length&&<p>No applicable FSSAI expiry reminders.</p>}
    {documents.map(doc=><article key={doc.vendorId} className="rounded-k-md border border-kraveo-line p-4"><strong>{doc.businessName||'Seller compliance review'}</strong><p className="text-sm">{doc.fssaiExpiresAt&&Date.parse(doc.fssaiExpiresAt)<=Date.now()?'Expired':'Expiring'} · {date(doc.fssaiExpiresAt)} · {doc.status}</p><p className="text-xs text-kraveo-ink2">Open this vendor's compliance review to verify renewed documents. A reminder does not renew a licence or change approval.</p></article>)}
  </details>;
}
