const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../lib/recommendations');
const N=require('../lib/nutrition');
const food=(name,nutrients={},protein=0)=>({name,nutrients,protein_g_per_100g:protein,kcal:100});
const carrot=food('Carrots, raw',{vitamin_a_rae:835,fibre:2.8},1);
const salmon=food('Salmon, cooked',{epa:0.4,dha:0.8},22);
const chicken=food('Chicken, roasted',{},30);
function run(base,foods=[carrot,salmon,chicken],extra={}){
 const entries=[{name:base.name,g:100}],map=new Map([base,...foods].map(f=>[f.name,f]));
 return R.recommend({entries,lookup:n=>map.get(n),foods,proteinTarget:100,...extra});
}
const keys=r=>r.gaps.map(g=>g.key);

test('covered protein earns no benefit; nutrition-only foods can address vitamin A and EPA + DHA',()=>{
 const r=run(food('Day',{vitamin_a_rae:90,epa:0.025,dha:0.025},120));
 assert.equal(r.proteinCovered,true);
 assert.ok(!keys(r).includes('protein'));
 assert.ok(r.candidates.some(c=>c.f.name===carrot.name));
 assert.ok(r.candidates.some(c=>c.f.name===salmon.name));
 assert.ok(r.candidates.every(c=>c.benefits.every(b=>b.key!=='protein')));
 assert.ok(!r.candidates.some(c=>c.f.name===chicken.name));
});
test('all assessed targets covered means no fallback recommending extra protein',()=>{
 const nutrients={...N.dailyValues,ala:2,la:10,epa:0,dha:0.25};
 const r=run(food('Day',nutrients,120));
 assert.equal(r.gaps.length,0);assert.deepEqual(r.candidates,[]);
});
test('unknown and trace amounts are not zero; partial measured totals carry coverage',()=>{
 const blank=run(food('Unknown',{vitamin_a_rae:'trace'},120));
 assert.ok(!keys(blank).includes('vitamin_a_rae'));assert.deepEqual(blank.candidates,[]);
 const a=food('Known',{vitamin_a_rae:100},120),b=food('Unknown',{});
 const r=run(a,[carrot,b],{entries:[{name:a.name,g:100},{name:b.name,g:100}]});
 const gap=r.gaps.find(g=>g.key==='vitamin_a_rae');
 assert.equal(gap.got,100);assert.equal(gap.partial,true);assert.equal(gap.confidence,0.5);
 assert.equal(r.candidates[0].benefits[0].partial,true);
});
test('EPA and DHA share one target in mg, and ALA is never credited to it',()=>{
 const r=run(food('Day',{epa:0.025,dha:0.025,ala:3},100));
 const g=r.gaps.find(g=>g.key==='epa_dha');assert.equal(g.got,50);assert.equal(g.target,250);
 const fish=r.candidates.find(c=>c.f.name===salmon.name);assert.ok(Math.abs(fish.benefits[0].add-1200)<1e-8);
 const flax=food('Flaxseed',{ala:20,epa:0,dha:0});
 assert.equal(run(food('Day',{epa:0,dha:0},100),[flax]).candidates.length,0);
 assert.ok(!keys(run(food('Day',{epa:0,dha:0.25},100))).includes('epa_dha'));
 assert.ok(!keys(r).some(k=>k==='epa'||k==='dha'));
});
test('a missing EPA or DHA component is an explicitly partial minimum contribution',()=>{
 const r=run(food('Day',{epa:0,dha:0},100),[food('Salmon, cooked',{dha:0.25})]);
 assert.equal(r.candidates[0].benefits[0].add,250);assert.equal(r.candidates[0].benefits[0].partial,true);
});
test('incompatible vitamin measurements and nutrients with no target cannot create goals',()=>{
 const r=run(food('Day',{vitamin_a_re:1,folate:1,niacin:1,sodium:0,chloride:0,saturated_fat:0,cholesterol:0},100));
 assert.deepEqual(r.gaps,[]);
 assert.deepEqual(r.candidates,[]);
});
test('focus changes the ranking, uses bounded portions and drops once covered',()=>{
 const base=food('Day',{vitamin_a_rae:90,epa:0,dha:0},120);
 const r=run(base,undefined,{focus:'vitamin_a_rae'});
 assert.equal(r.candidates[0].f.name,carrot.name);assert.equal(r.focus,'vitamin_a_rae');
 assert.ok(r.candidates.every(c=>c.benefits.every(g=>g.key==='vitamin_a_rae')));
 assert.ok(r.candidates[0].serve<=120);
 const covered=run(food('Day',{vitamin_a_rae:900,epa:0,dha:0},120),undefined,{focus:'vitamin_a_rae'});
 assert.equal(covered.focus,'');assert.equal(covered.candidates[0].f.name,salmon.name);
});
test('vegan and explicitly avoided foods are excluded, with diverse alternatives',()=>{
 const base=food('Day',{vitamin_a_rae:0,epa:0,dha:0},120);
 const r=run(base,undefined,{vegan:true});assert.ok(r.candidates.every(c=>c.f.name!==salmon.name));
 assert.deepEqual(run(base,undefined,{vegan:true,avoided:[carrot.name]}).candidates,[]);
 const r2=run(base,[carrot,{...carrot,name:'Carrots, cooked'},salmon]);
 assert.equal(new Set(r2.candidates.map(c=>c.family)).size,r2.candidates.length);
});
test('shortlist rejects organs, supplements, raw fish and misleading mixed-food names',()=>{
 for(const name of ['Chicken, giblets, cooked','Chicken, liver, cooked','Salmon, raw','Carrot juice','Pumpkin granola','Cereals ready-to-eat, oats','Fish oil','Spinach, with salt','Carrot cake','Sweet potato, raw']){
  assert.equal(R.foodPortion(food(name),false),null,name);
 }
 assert.ok(R.foodPortion(food('Carrots, cooked, without salt'),true));
 assert.ok(R.foodPortion(food('Sardines, canned in oil, drained'),false));
});
test('limits and calorie room are tradeoffs, never targets to fill',()=>{
 const r=run(food('Day',{vitamin_a_rae:0,sodium:2400,saturated_fat:25,kcal:2000},120),[food('Carrots, cooked',{vitamin_a_rae:800,sodium:300,saturated_fat:3})],{calorieTarget:2000});
 assert.equal(r.candidates[0].warnings.length,3);
 assert.ok(!keys(r).includes('sodium'));assert.ok(!keys(r).includes('saturated_fat'));
});
test('amino acid gaps remain supported independently of covered protein',()=>{
 const aa=Object.fromEntries(Array.from({length:18},(_,i)=>['a'+i,1]));
 const base={...food('Day',{},120),aa:{...aa,a0:0.1}};
 const tofu={...food('Tofu',{},15),aa};
 const r=run(base,[tofu],{aminoTargets:[{id:'a0',label:'Test amino acid',keys:['a0'],target:1}]});
 assert.equal(r.candidates[0].benefits[0].key,'aa:a0');
});
test('recommendations never mutate meal entries, foods or preferences',()=>{
 const base=food('Day',{vitamin_a_rae:10},120),foods=[carrot,salmon];
 const entries=[{name:base.name,g:100}],avoided=[];
 const before=JSON.stringify({entries,foods,avoided});
 run(base,foods,{entries,avoided});assert.equal(JSON.stringify({entries,foods,avoided}),before);
});

test('a custom 1500 mg goal keeps EPA + DHA eligible beyond the 250 mg reference',()=>{
 const base=food('Day',{epa:0.1,dha:0.4},120);
 assert.ok(!keys(run(base)).includes('epa_dha'));
 const r=run(base,[salmon],{epaDhaGoalMg:1500,focus:'epa_dha'});
 const gap=r.gaps.find(g=>g.key==='epa_dha');
 assert.equal(gap.got,500);assert.equal(gap.target,1500);assert.equal(gap.gap,1000);
 assert.equal(r.candidates[0].benefits[0].target,1500);
 assert.ok(!keys(run(food('Day',{epa:0.5,dha:1},120),[salmon],{epaDhaGoalMg:1500})).includes('epa_dha'));
});
test('custom EPA + DHA goal stays consistent in lipid progress and explains its provenance',()=>{
 const foods=()=>food('Day',{epa:0.1,dha:0.4});
 const p=N.epaDhaProgress([{name:'Day',g:100}],foods,1500);
 assert.equal(p.targetMg,1500);assert.ok(Math.abs(p.percent-100/3)<1e-8);
 const guidance=N.lipidGuidance('epa',p.epa,p);
 assert.match(guidance.label,/1,500 mg\/day/);assert.match(guidance.progress,/33%/);
 assert.match(guidance.reason,/personal tracking goal/);assert.match(guidance.reason,/250 mg\/day/);
 for(const value of [null,'',0,-1,Infinity,'invalid',true])assert.equal(N.normaliseEpaDhaGoal(value),250);
});
test('custom goal sync preserves newer local changes and stays isolated by account',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../index.template.html'),'utf8');
 const data=new Map(),store=require('../lib/account-storage').create({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});
 const ctx=vm.createContext({store,Nutrition:N,MAX_SAVED_MEALS:30,loadSavedMeals:()=>[],getIntakeProfile:()=>({}),IntakeTargets:{normalise:x=>x}});
 vm.runInContext(source.slice(source.indexOf('function collectSettings()'),source.indexOf('const PRO_ROLES =')),ctx);
 store.setOwner('A');store.setItem('aa_epa_dha_goal_mg','1500');store.setItem('aa_settings_at','200');
 assert.equal(ctx.collectSettings().epaDhaGoalMg,'1500');
 ctx.applySettings({epaDhaGoalMg:250,at:100});assert.equal(store.getItem('aa_epa_dha_goal_mg'),'1500');
 ctx.applySettings({weight:80,at:300});assert.equal(store.getItem('aa_epa_dha_goal_mg'),'1500');
 ctx.applySettings({epaDhaGoalMg:1000,at:400});assert.equal(store.getItem('aa_epa_dha_goal_mg'),'1000');
 store.setOwner('B');assert.equal(store.getItem('aa_epa_dha_goal_mg'),null);
 store.setOwner('A');assert.equal(store.getItem('aa_epa_dha_goal_mg'),'1000');
 ctx.applySettings({epaDhaGoalMg:'',at:500});assert.equal(N.normaliseEpaDhaGoal(store.getItem('aa_epa_dha_goal_mg')),250);
});
