const test=require('node:test'),assert=require('node:assert/strict');
const UX=require('../lib/diary-ux');
const lookup=(n,e)=>e.food||{name:n};
const food={name:'Bread',g:40,meal:'breakfast'};
const pill={name:'Magnesium',g:3,meal:'supplements',food:{supplement:true,name:'Magnesium',scanId:'first',serving_g:3,doseUnit:'capsules',ingredients:[{key:'magnesium',amount:253,unit:'mg'}]}};
test('week range crosses month boundary, preserves indexes, and excludes tomorrow',()=>{
 const days=['2026-10-25','2026-10-26','2026-10-31','2026-11-01','2026-11-02'].map(date=>({date,entries:[food,pill]}));
 const before=JSON.stringify(days),r=UX.range(days,{end:'2026-11-01',lookup});
 assert.equal(r.start,'2026-10-26');assert.deepEqual(r.days.map(x=>x.i),[1,2,3]);assert.equal(JSON.stringify(days),before);
});
test('food-only filter removes supplements by data type, including those in ordinary meal slots',()=>{
 const days=[{date:'2026-11-01',entries:[food,{...pill,meal:'snacks'}]},{date:'2026-10-31',entries:[pill]}];
 const r=UX.range(days,{end:'2026-11-01',foodOnly:true,lookup});
 assert.equal(r.days[0].d.entries.length,1);assert.equal(r.days[1].d.entries.length,0);assert.equal(days[0].entries.length,2);
});
test('month and all-time ranges include the same selected days across reports',()=>{
 const days=['2024-02-29','2024-03-01','2026-11-01'].map(date=>({date,entries:[food]}));
 assert.deepEqual(UX.range(days,{period:'month',month:'2024-02'}).days.map(x=>x.i),[0]);
 assert.equal(UX.range(days,{period:'all'}).days.length,3);
});
test('recent foods exclude supplements, latest portion wins without mutating history',()=>{
 const days=[{date:'2026-10-31',entries:[{...food,g:80},pill]},{date:'2026-11-01',entries:[{...food,g:120}]}],before=JSON.stringify(days);
 assert.equal(UX.recent(days,lookup)[0].g,120);assert.equal(UX.recent(days,lookup).length,1);assert.equal(JSON.stringify(days),before);
});
test('same supplement scanned twice is deduplicated, distinct strengths are preserved',()=>{
 const second={...pill,g:6,food:{...pill.food,scanId:'second'}},different={...pill,food:{...pill.food,ingredients:[{key:'magnesium',amount:100,unit:'mg'}]}};
 const r=UX.recent([{date:'2026-11-01',entries:[pill,different,second]}],lookup,true);
 assert.equal(r.length,2);assert.equal(r[0].g,6);
});
