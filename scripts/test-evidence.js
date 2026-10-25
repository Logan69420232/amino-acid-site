const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),os=require('node:os');
const E=require('../lib/evidence');
const aa=Object.fromEntries(['histidine','isoleucine','leucine','lysine','methionine','cysteine','phenylalanine','tyrosine','threonine','tryptophan','valine','alanine','arginine','aspartic_acid','glutamic_acid','glycine','proline','serine'].map(k=>[k,1]));
const atlas={protein_rda_g_per_kg:.8,who_requirements_mg_per_kg:{histidine:10,isoleucine:20,leucine:39,lysine:30,saa:15,aaa:25,threonine:15,tryptophan:4,valine:26},who_pattern_mg_per_g_protein:{histidine:15,isoleucine:30,leucine:59,lysine:45,saa:22,aaa:38,threonine:23,tryptophan:6,valine:39},versions:{dataset:'test-data',calculation:'test-calc',references:'test-ref'}};
const foods={a:{name:'Food A',id:1,key:'a',protein_g_per_100g:20,aa,nutrients:{protein:20,kcal:200,iron:0,iodine:'trace',epa:.1},source:'USDA FDC ID 123',state:'cooked'},b:{name:'Food B',id:2,key:'b',protein_g_per_100g:10,aa:{},aaAvailable:false,nutrients:{protein:10},state:'raw'}};
const create=entries=>E.snapshot([{date:'2026-10-25',entries,weightKg:75,proteinGoalG:120,epaDhaGoalMg:250}],n=>foods[n],atlas);
test('snapshot preserves zero, trace, unknown, macros and partial omega sums',()=>{
 const r=create([{name:'a',g:150},{name:'b',g:100}]).days[0].results;
 assert.equal(r.totals.protein.value,40);assert.equal(r.totals.kcal.value,300);assert.equal(r.totals.kcal.unknown,1);assert.equal(r.totals.iron.value,0);assert.equal(r.totals.iron.unknown,1);assert.equal(r.totals.iodine.value,null);assert.equal(r.totals.iodine.trace,1);assert.equal(r.totals.iodine.unknown,1);
 assert.ok(Math.abs(r.totals.omega_3.value-.15)<1e-10);assert.equal(r.totals.omega_3.derived,1);assert.equal(r.amino.leucine.mg,1500);assert.equal(r.amino.leucine.targetMg,5850);assert.equal(r.amino.leucine.partial,true);assert.equal(r.amino.leucine.compositionMgPerG,50);
});
test('snapshot replays without catalogue; identity ignores display array position',()=>{
 const s=create([{name:'a',g:150}]),copy=JSON.parse(JSON.stringify(s)),day=copy.days[0];assert.deepEqual(E.calculate(day,copy.references),day.results);assert.equal(day.entries[0].foodId,'catalogue:a');assert.match(day.entries[0].sources[0].url,/123/);assert.equal(E.identity({...foods.a,id:9999}),'catalogue:a');assert.deepEqual(s.versions,atlas.versions);
});
test('supplement dose units and per-serving amounts survive export',()=>{
 const supp={scanId:'supp-1',name:'Magnesium',supplement:true,doseUnit:'capsules',serving_g:3,ingredients:[{label:'Magnesium',amount:253,unit:'mg',key:'magnesium'}],nutrients:{magnesium:253/3*100},aa:{},aaAvailable:false};
 const s=E.snapshot([{date:'example',entries:[{name:'Magnesium',g:3}],weightKg:75,proteinGoalG:90,epaDhaGoalMg:250}],()=>supp,atlas);assert.equal(s.days[0].entries[0].portion.unit,'capsules');assert.ok(Math.abs(s.days[0].results.totals.magnesium.value-253)<1e-10);assert.equal(s.days[0].entries[0].portion.labelServingQuantity,3);assert.equal(s.days[0].results.amino.leucine.mg,null);
});
test('portion source does not claim entered grams were weighed',()=>{
 assert.match(E.portion(foods.a,{g:100}).method,/whether weighed was not recorded/);assert.match(E.portion(foods.a,{g:100,unit:'cup'}).method,/household/);
 const f={...foods.a,portionEstimate:{packGrams:500,beforePercent:100,afterPercent:80}};assert.match(E.portion(f,{g:100}).method,/pack percentage/);assert.doesNotMatch(E.portion(f,{g:200}).method,/pack percentage/);
});
test('zero portions excluded; invalid quantities rejected',()=>{
 assert.equal(create([{name:'a',g:100},{name:'b',g:0}]).days[0].results.totals.iron.unknown,0);assert.throws(()=>create([{name:'a',g:-1}]));assert.equal(create([{name:'a',g:0}]).days[0].results.amino.leucine.mg,null);
});
test('CSV preserves precision and prevents spreadsheet formula interpretation',()=>{
 const csv=E.csv(create([{name:'a',g:123.456789}]));assert.match(csv,/catalogue:a/);assert.match(csv,/123.456789/);assert.match(csv,/test-data,test-calc,test-ref/);assert.equal(E.cell('=bad'),"'=bad");assert.equal(E.cell(-2),'-2');assert.equal(E.cell('hello\nworld'),'"hello\nworld"');
});
test('Python independently reproduces totals, missingness, AA percentages and omega',()=>{
 const s=create([{name:'a',g:123.456789},{name:'b',g:50}]),dir=fs.mkdtempSync(path.join(os.tmpdir(),'amino-evidence-')),file=path.join(dir,'snapshot.json');
 try{fs.writeFileSync(file,JSON.stringify(s));const result=JSON.parse(cp.execFileSync('python3',[path.join(__dirname,'../reproduce/reproduce.py'),file],{encoding:'utf8'}));assert.equal(result.verified,true);assert.equal(result.days[0].totals.protein.value,s.days[0].results.totals.protein.value);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real worked examples use resolvable foods and match the existing amino acid calculation',()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8'),atlas=JSON.parse(html.match(/const ATLAS = (.*);/)[1]);
 const all=[...atlas.foods,...atlas.nutritionFoods],lookup=n=>all.find(f=>f.name===n);
 const groups=E.references(atlas).aminoGroups,context={ATLAS:atlas,DIARY_FOODS:all,Evidence:E,Nutrition:require('../lib/nutrition'),foodByName:lookup,SCORE_ROWS:Object.entries(groups).map(([id,keys])=>[id,id,keys]),WHO_KG:atlas.who_requirements_mg_per_kg,WHO:atlas.who_pattern_mg_per_g_protein};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../evidence-ui.js'),'utf8')+'\nthis.examples=WORKED_EXAMPLES;',context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../result-method-ui.js'),'utf8'),context);
 assert.equal(new Set(all.map(E.identity)).size,all.length);
 for(const spec of context.examples){
  context.resetWorkedExample(spec.id);const state=vm.runInContext('workedExampleState',context),entries=state.entries;
  const s=E.snapshot([{date:spec.id,entries,weightKg:75,proteinGoalG:90,epaDhaGoalMg:250}],lookup,atlas),r=s.days[0].results,m=context.resultMethodData(entries,75,90);
  assert.ok(r.totals.protein.value>0);assert.ok(r.totals.kcal.value>0);
  for(const row of m.rows){assert.ok(Math.abs(r.amino[row.id].mg-row.got)<1e-8);assert.ok(Math.abs(r.amino[row.id].percent-row.percent)<1e-8);}
  assert.equal(r.amino.leucine.partial,spec.id==='partial');
 }
});
test('source disclosure avoids invented record IDs for scanned labels',()=>{
 const s=E.sources({scanVersion:1,source:'Open Food Facts',barcode:'12345678',nutritionSource:{dataset:'Open Food Facts'}});
 assert.equal(s.length,1);assert.match(s[0].url,/12345678$/);assert.doesNotMatch(JSON.stringify(s),/undefined/);
});
test('source record conflicts are disclosed without modifying nutrient values',()=>{
 const f={name:'Greek yogurt, whole milk',state:'as sold',nutrients:{protein:8.78},nutritionSource:{name:'Yogurt, Greek, plain, nonfat'}};const before=JSON.stringify(f);assert.match(E.cautions(f)[0],/mismatch/);assert.equal(JSON.stringify(f),before);assert.deepEqual(E.cautions({name:'Yogurt, nonfat',state:'as sold',nutritionSource:{name:'Yogurt, nonfat'}}),[]);
});
