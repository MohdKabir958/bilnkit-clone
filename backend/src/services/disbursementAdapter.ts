import { createHash } from 'crypto';
import { AppError } from '../utils/appError';

/** Adapter contract for a future operator-approved disbursement provider. Never pass raw bank credentials to logs or clients. */
export interface DisbursementRequest { settlementId:string; amountPaise:number; currency:'INR'; idempotencyKey:string; beneficiaryReference:string }
export interface DisbursementResult { reference:string; state:'PENDING'|'CONFIRMED'|'FAILED'|'SANDBOX_CONFIRMED'; bankTransferProven:boolean }
export interface DisbursementAdapter { environment:'sandbox'|'live'; create(input:DisbursementRequest):Promise<DisbursementResult>; lookup(idempotencyKey:string):Promise<DisbursementResult|null> }
export const validateDisbursement=(input:DisbursementRequest)=>{
 if(!input||!Number.isSafeInteger(input.amountPaise)||input.amountPaise<=0||input.currency!=='INR'||!input.settlementId||!input.beneficiaryReference||!/^[A-Za-z0-9_-]{8,100}$/.test(input.idempotencyKey))throw new AppError(400,'INVALID_DISBURSEMENT','Use a positive integer paise amount and a stable payout request key.');
};
/** There is intentionally no live adapter. An environment flag by itself cannot authorize a transfer. */
export const liveDisbursementAdapter=():never=>{throw new AppError(503,'PAYOUT_PROVIDER_UNAVAILABLE','Live bank disbursement is not configured or authorized. Record verified external payment evidence using the manual settlement workflow.');};
/** Explicit local sandbox, not a provider integration check or evidence of money sent. Useful for crash/idempotency contract tests. */
export class SandboxDisbursementAdapter implements DisbursementAdapter {
 readonly environment='sandbox' as const;
 private requests=new Map<string,{hash:string;result:DisbursementResult}>();
 async create(input:DisbursementRequest):Promise<DisbursementResult>{
  validateDisbursement(input);
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex'),old=this.requests.get(input.idempotencyKey);
  if(old){if(old.hash!==hash)throw new AppError(409,'PAYOUT_KEY_CONFLICT','The payout request key was already used with different details.');return {...old.result};}
  const result:DisbursementResult={reference:`sandbox_${hash.slice(0,24)}`,state:'SANDBOX_CONFIRMED',bankTransferProven:false};this.requests.set(input.idempotencyKey,{hash,result});return {...result};
 }
 async lookup(key:string){const row=this.requests.get(key);return row?{...row.result}:null;}
}
