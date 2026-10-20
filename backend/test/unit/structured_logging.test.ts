import { structuredLog } from '../../src/utils/logger';
test('structured diagnostics preserve actionable status and redact credentials and private contact data',()=>{
 const raw=structuredLog('error',['Gateway callback failed',{status:503,requestId:'request-public',password:'test-password',nested:{authorization:'Bearer test-key',otpCode:'1234',phone:'+919999999999',deliveryAddress:'Private street'},url:'postgres URL is https://username:password@example.invalid',session:'Bearer private-test-token',signed:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'}]);
 const record=JSON.parse(raw);expect(record.level).toBe('error');expect(record.details[0]).toMatchObject({status:503,requestId:'request-public'});
 expect(raw).not.toMatch(/test-password|private-test-token|Private street|919999999999|1234|username:password|eyJhbGci/);
});

test('raw database messages and inline contact/OTP values cannot escape structured redaction',()=>{
 const database=structuredLog('error',['Account lookup failed','Invalid `prisma.user.findUnique()` invocation:\n{address:"House 9 Secret Lane",email:"private@example.invalid"}']);
 expect(database).not.toMatch(/Secret Lane|private@example/);expect(database).toContain('redacted database error');
 const inline=structuredLog('warn',['Sender failed for private@example.invalid at +91 98765 43210; OTP 4821']);
 expect(inline).not.toMatch(/private@example|98765|4821/);
});
