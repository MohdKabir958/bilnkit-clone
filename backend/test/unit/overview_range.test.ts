import {overviewRange} from '../../src/services/overview';
test('Today starts at IST midnight and the last seven calendar days include today',()=>{
 const now=new Date('2026-10-26T23:00:00Z');
 expect(overviewRange('1',now)).toEqual({days:1,from:new Date('2026-10-26T18:30:00Z'),to:now});
 expect(overviewRange('7',now).from.toISOString()).toBe('2026-10-20T18:30:00.000Z');
 expect(overviewRange('90',now).from.getTime()).toBe(overviewRange('1',now).from.getTime()-89*86400000);
});
test.each(['',0,2,91,'7d',[],{},'7.0'])('rejects ambiguous or unbounded range %p',value=>expect(()=>overviewRange(value)).toThrow());
