const test=require('node:test'),assert=require('node:assert/strict');
const Water=require('../lib/water'),Sync=require('../lib/diary-sync');
test('water conversions reject invalid entries and convert litres once',()=>{
  assert.equal(Water.amount('0.33','l'),330);assert.equal(Water.amount('250'),250);
  for(const n of ['',0,-5,'bad',Infinity,10001])assert.equal(Water.amount(n),null);
  assert.equal(Water.amount(1,'g'),null);
});
test('water adds and removes without changing foods or another date',()=>{
  const base={date:'2026-11-01',entries:[{name:'Bread',g:80}],note:'Lunch'};
  const a=Water.add(base,250,'a','12:00'),b=Water.add(a,500,'b','13:00');
  assert.equal(Water.total(b),750);assert.equal(Water.total(base),0);
  assert.deepEqual(b.entries,base.entries);assert.equal(Water.total(Water.remove(b,'a')),500);
  assert.equal(Water.total(Water.remove(b,'unknown')),750);
});
test('sync detects water-only changes and retains them on unchanged remote',()=>{
 const day={date:'2026-11-01',entries:[]},base={days:[day],active:0};
 const local={days:[Water.add(day,500,'a','12:00')],active:0};
 const result=Sync.merge(base,local,base);assert.equal(Water.total(result.log.days[0]),500);assert.equal(result.conflicts.length,0);
 assert.equal(Water.total(Sync.merge(local,base,base).log.days[0]),500);
});
test('concurrent water edits are conflicts rather than silently lost or added twice',()=>{
 const day={date:'2026-11-01',entries:[]},base={days:[day],active:0};
 const remote={days:[Water.add(day,250,'a','12:00')],active:0},local={days:[Water.add(day,500,'b','13:00')],active:0};
 const result=Sync.merge(remote,local,base);assert.equal(result.conflicts.length,1);assert.equal(Water.total(result.log.days[0]),250);
 assert.equal(Water.total(result.conflicts[0].local),500);
 assert.equal(Sync.merge(remote,remote,base).conflicts.length,0);
});
