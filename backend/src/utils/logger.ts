import { errSummary } from './log';
const privateKey=/authorization|password|secret|token|otp|phone|email|address|accountnumber|upi|street|house|landmark|dropoff|^name$|latitude|longitude|^lat$|^lng$/i;
/** Logging is an allow-limited diagnostic surface, never a request-body archive. */
export function redactLog(value:unknown,depth=0):unknown {
  if(depth>4)return '[truncated]';
  if(value instanceof Error)return redactLog(errSummary(value),depth+1);
  if(typeof value==='string') {
    // Prisma messages embed query arguments, even when a caller passes .message.
    if(/Invalid `[^`]+` invocation/.test(value))return '[redacted database error]';
    return value.replace(/Bearer\s+\S+/gi,'Bearer [redacted]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted JWT]')
      .replace(/((?:https?|postgres(?:ql)?):\/\/)[^\s/@]+@/gi,'$1[redacted]@')
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[redacted private key]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[redacted email]')
      .replace(/(?:\+91[ -]*)?\b[6-9](?:[ -]*\d){9}\b/g,'[redacted phone]')
      .replace(/\b(otp(?:Code)?|password|secret|token)\s*[:=]?\s+["']?[^\s,"'}]+/gi,'$1 [redacted]')
      .slice(0,2000);
  }
  if(typeof value==='bigint')return String(value);
  if(Array.isArray(value))return value.slice(0,30).map(v=>redactLog(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,30).map(([key,v])=>[key,privateKey.test(key)?'[redacted]':redactLog(v,depth+1)]));
  return value;
}
export function structuredLog(level:'info'|'warn'|'error',args:unknown[]) {
  return JSON.stringify({timestamp:new Date().toISOString(),level,message:redactLog(args[0]),...(args.length>1?{details:args.slice(1).map(v=>redactLog(v))}:{})})+'\n';
}
/** Production output is JSON for an owned collector; development/test consoles stay readable. */
export function installStructuredLogging() {
  console.log=(...args:unknown[])=>{process.stdout.write(structuredLog('info',args));};
  console.warn=(...args:unknown[])=>{process.stderr.write(structuredLog('warn',args));};
  console.error=(...args:unknown[])=>{process.stderr.write(structuredLog('error',args));};
}
