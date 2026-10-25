const assert=require('node:assert/strict');const C=require('../planner-core.js');
assert.equal(C.day(new Date('2026-10-25T23:30:00Z')),'2026-10-26');
assert.equal(new Date(C.localEpoch('2026-10-24','09:00')).toISOString(),'2026-10-24T07:00:00.000Z');
assert.equal(new Date(C.localEpoch('2026-10-25','09:00')).toISOString(),'2026-10-25T08:00:00.000Z');
assert.equal(new Date(C.localEpoch('2027-03-28','09:00')).toISOString(),'2027-03-28T07:00:00.000Z');
// A nonexistent 02:30 in the spring gap is normalized forward to 03:30.
assert.equal(new Date(C.localEpoch('2027-03-28','02:30')).toISOString(),'2027-03-28T01:30:00.000Z');
assert.equal(new Date(C.localEpoch('2026-10-25','02:30')).toISOString(),'2026-10-25T01:30:00.000Z');
assert.equal(C.nextDate('2026-10-30','weekdays'),'2026-11-02');
assert.equal(C.nextDate('2027-01-31','monthly'),'2027-02-28');
assert.equal(C.nextDate('2028-01-31','monthly'),'2028-02-29');
assert.equal(C.addDays('2026-12-31',1),'2027-01-01');
assert.equal(C.reminderAt({due_date:'2026-10-25',due_time:'10:00',reminder_minutes:15}),Date.parse('2026-10-25T08:45:00Z'));
assert(Number.isNaN(C.reminderAt({due_date:'2026-10-25',reminder_minutes:null})));
assert.equal(C.matches({title:'Проверить договор',notes:'',tags:['Hotel Tur']},'hotel'),true);
assert.throws(()=>C.validateTask({title:'Тест',due_date:null,reminder_minutes:15,duration_minutes:30,priority:'normal'}));
assert.throws(()=>C.validateTask({title:'',reminder_minutes:null,duration_minutes:30,priority:'normal'}));
assert.equal(C.icsEscape('a,b;\nc'),'a\\,b\\;\\nc');
console.log('Planner core: timezone, DST, recurrence, search, validation and export passed');
