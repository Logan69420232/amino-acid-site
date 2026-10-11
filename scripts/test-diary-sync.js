const test=require('node:test'),assert=require('node:assert/strict');
const Sync=require('../lib/diary-sync');
const day=(g,date='2026-09-23')=>({date,note:'',entries:[{name:'Chicken',g,meal:'lunch'}]});
const log=(...days)=>({days,active:0});
test('repeated logins never add stale and server portions together or mutate input',()=>{
  let remote=log(day(200)); const local=log(day(150)),before=JSON.stringify(local);
  for(let i=0;i<20;i++){const result=Sync.merge(remote,local);assert.equal(result.conflicts.length,1);remote=result.log;assert.equal(remote.days[0].entries[0].g,200);}
  assert.equal(JSON.stringify(local),before);
});
test('clean local snapshots accept server edits and removals',()=>{
  const base=log(day(200));
  assert.equal(Sync.merge(log(day(150)),base,base).log.days[0].entries[0].g,150);
  assert.deepEqual(Sync.merge(log(),base,base).log.days,[]);
  assert.deepEqual(Sync.merge(log({...day(200),entries:[]}),base,base).log.days[0].entries,[]);
});
test('local edits and deletions survive when the server day has not changed',()=>{
  const base=log(day(200));assert.equal(Sync.merge(base,log(day(100)),base).log.days[0].entries[0].g,100);
  assert.deepEqual(Sync.merge(base,log(),base).log.days,[]);
});
test('different-day edits combine but same-day conflicts preserve both copies for review',()=>{
  const base=log(day(200),day(100,'2026-09-24'));
  const r=log(day(150),day(100,'2026-09-24')),l=log(day(200),day(50,'2026-09-24'));
  assert.deepEqual(Sync.merge(r,l,base).log.days.map(d=>d.entries[0].g),[150,50]);
  const conflict=Sync.merge(log(day(150)),log(day(50)),log(day(200)));
  assert.equal(conflict.log.days[0].entries[0].g,150);assert.equal(conflict.conflicts[0].local.entries[0].g,50);
});
test('duplicate dates choose one full snapshot without summing or mutating portions',()=>{
  const days=[day(150),day(200)];const before=JSON.stringify(days);
  assert.equal(Sync.uniqueDays(days)[0].entries[0].g,200);assert.equal(JSON.stringify(days),before);
});
test('unit, note and historic target changes are meaningful edits',()=>{
  const base=log(day(100));for(const changed of [{...day(100),note:'note'},{...day(100),w:80,t:150},{...day(100),entries:[{...day(100).entries[0],unit:'cups'}]}]){
    assert.deepEqual(Sync.merge(base,log(changed),base).log.days[0],changed);
  }
});
