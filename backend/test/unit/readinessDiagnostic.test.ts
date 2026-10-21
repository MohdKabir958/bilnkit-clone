import {databaseReadinessDiagnostic} from '../../src/services/readinessDiagnostic';
const url='postgresql://synthetic:private-password-fixture@pool.example.test/neondb?sslmode=require';
test('recognizes Prisma initialization connection failures using errorCode',()=>{
  expect(databaseReadinessDiagnostic({errorCode:'P1001'},url)).toMatchObject({code:'P1001',host:'pool.example.test'});
});
test.each(['P1000','P1002','P1011','P1013','P2024'])('provides an actionable safe hint for %s',code=>{
  const result=databaseReadinessDiagnostic({code,message:'private-password-fixture'},url);
  expect(result.code).toBe(code);expect(result.hint.length).toBeGreaterThan(30);
  expect(JSON.stringify(result)).not.toContain('private-password-fixture');
  expect(JSON.stringify(result)).not.toContain('postgresql://');
});
test('never echoes unknown errors, malformed URLs or untrusted error codes',()=>{
  for(const input of [undefined,null,'private-password-fixture',{code:'private-password-fixture',message:url}]) {
    const result=databaseReadinessDiagnostic(input,'malformed-private-password-fixture');
    expect(result).toMatchObject({code:'UNKNOWN',host:'unavailable'});
    expect(JSON.stringify(result)).not.toContain('private-password-fixture');
  }
  expect(databaseReadinessDiagnostic({code:'P1001'},'https://private-password-fixture@example.test').host).toBe('unavailable');
});
