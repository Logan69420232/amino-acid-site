const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../lib/supplement-scan'),F=require('../lib/food-scan'),N=require('../lib/nutrition');
const label=`NUTRITION INFORMATION
Serving Size: 3 Softgels
Servings Per Container: 40
Amount Per Serving % NRV
Fish Oil 3,600 mg **
Omega-3 2,160 mg **
Eicosapentaenoic acid (EPA) 1,300 mg **
Docosahexaenoic acid (DHA) 860 mg **`;
const oil=()=>S.makeFood({...S.parse(label),name:'Omega 3'},'test-supplement-123');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
test('supplement label keeps serving count, thousands, oil and fatty acids distinct',()=>{
 const d=S.parse(label);assert.equal(d.servingCount,3);assert.equal(d.doseUnit,'softgels');assert.equal(d.ingredients.length,4);assert.equal(d.ingredients[0].amount,3600);assert.equal(d.ingredients[0].key,'');assert.equal(S.detect(label),true);
 const f=oil();assert.equal(f.kcal,null);assert.equal(f.protein_g_per_100g,null);assert.equal(f.nutrients.fat,undefined);
 for(const q of [1,3]) {const es=[{name:f.name,g:q,food:f}],lookup=(n,e)=>F.snapshot(e.food);near(N.total(es,lookup,'epa').value,1.3*q/3);near(N.total(es,lookup,'dha').value,.86*q/3);near(N.total(es,lookup,'omega_3').value,2.16*q/3);assert.equal(N.total(es,lookup,'kcal').value,null);assert.equal(N.breakdown(es,lookup,'epa')[0].unit,'softgels');}
});
test('table rule fragments beside supplement names are removed without changing amounts or units',()=>{
 const d=S.parse(label.replace('Omega-3 2,160','Omega-3 "| 2,160'));
 assert.deepEqual(d.ingredients,S.parse(label).ingredients);
});
test('vitamins, minerals and custom ingredients retain units without ambiguous conversions',()=>{
 const d=S.parse('Supplement Facts\nServing Size: 2 Tablets\nVitamin C 500 mg\nVitamin D3 25 mcg\nVitamin A 5000 IU\nVitamin K2 100 mcg\nFolate 400 mcg DFE\nMagnesium (as citrate) 100 mg\nMagnesium citrate 800 mg\nProbiotic blend 10 billion CFU\nCreatine 3 g');
 const f=S.makeFood({...d,name:'Mixed supplement'},'test-mixed-123');near(f.nutrients.vitamin_c*2/100,500);near(f.nutrients.vitamin_d*2/100,25);near(f.nutrients.magnesium*2/100,100);assert.equal(f.nutrients.folate,undefined);assert.equal(f.nutrients.vitamin_k,undefined);assert.equal(f.nutrients.vitamin_a_rae,undefined);assert.equal(f.ingredients.length,9);assert.equal(f.ingredients.at(-2).unit,'billion CFU');
 assert.equal(F.snapshot({...f,photo:'private',nutrients:{epa:999}}).photo,undefined);assert.equal(F.snapshot({...f,nutrients:{epa:999}}).nutrients.epa,undefined);
});
test('bad matches, duplicate nutrients, negative values and impossible omega sums are rejected',()=>{
 const base={name:'Test',servingCount:1,doseUnit:'capsules',ingredients:[{label:'Vitamin A',unit:'IU',amount:5000,key:'vitamin_a_rae'}]};assert.throws(()=>S.makeFood(base,'test-1234'),/Cannot convert/);
 base.ingredients=[{label:'C',unit:'mg',amount:50,key:'vitamin_c'},{label:'C again',unit:'mg',amount:5,key:'vitamin_c'}];assert.throws(()=>S.makeFood(base,'test-1234'),/Two rows/);
 base.ingredients=[{label:'C',unit:'mg',amount:-1,key:'vitamin_c'}];assert.throws(()=>S.makeFood(base,'test-1234'),/Check each/);
 const draft=S.parse(label);draft.ingredients[1].amount=100;assert.throws(()=>S.makeFood({...draft,name:'Bad oil'},'test-1234'),/exceed/);
 assert.equal(S.parse('Serving Size: 2 capsules\nSelenium <5 mcg').ingredients.length,0);
});
test('per scoop and per ml supplements scale by declared units without assumed gram weights',()=>{
 for(const [unit,qty] of [['scoops',1],['ml',5]]) {const f=S.makeFood({name:'Custom',servingCount:qty,doseUnit:unit,ingredients:[{label:'Creatine',amount:3,unit:'g',key:''}]},'test-custom-123');assert.equal(f.doseUnit,unit);assert.equal(f.serving_g,qty);assert.equal(f.nutrients.protein,undefined);assert.deepEqual(F.snapshot(f),f);}
});
test('diary reload, display units, CSV and nutrient dashboard preserve supplement snapshot',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.template.html'),'utf8'),f=oil();let json=JSON.stringify({days:[{date:'2026-10-23',entries:[{name:f.name,g:3,meal:'breakfast',food:f}]}],active:0});
 const ctx=vm.createContext({Nutrition:N,FoodScan:F,FOOD_BY_NAME:new Map(),store:{getItem:()=>json,setItem:(k,v)=>json=v},MEAL_LABEL:{breakfast:'Breakfast'},dedupeDays:require('../lib/diary-sync').uniqueDays,todayISO:()=> '2026-10-23',schedulePush:()=>{},AA_META:[]});
 for(const [a,b] of [['function foodByName(','function updateDayBtn('],['function loadLog(','/* Each day remembers'],['function quantityUnit(','function supplementIngredients('],['function historyCSV(','let uiHistoryMonth=']])vm.runInContext(source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))),ctx);
 const d=ctx.loadLog().days[0];assert.equal(d.entries[0].food.doseUnit,'softgels');assert.equal(ctx.quantityText(d.entries[0]),'3 softgels');
 const csv=ctx.historyCSV([{d,prot:0,kcal:null,carb:null,fat:null}]);assert.match(csv,/quantity,quantity_unit,label_ingredients/);assert.match(csv,/Omega 3,,,,,/);assert.match(csv,/,3,softgels,/);assert.match(csv,/EPA\): 1300 mg/);
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../nutrition-ui.js'),'utf8'),ctx);const html=ctx.nutritionDashboard(d.entries);assert.match(html,/3 softgels/);assert.match(html,/1,300 mg/);
});
test('food-specific household portions use USDA weights',()=>{
 const data=require('../data/portions_usda.json').records;const olive=data['171413'];assert.equal(olive.find(r=>r[2]==='tablespoon')[1],13.5);assert.equal(olive.find(r=>r[2]==='teaspoon')[1],4.5);assert.ok(Object.values(data).some(rs=>rs.some(r=>/slice/.test(r[2]))));
});
test('unreadable units are not guessed, combined ingredients do not count as EPA alone',()=>{
 const draft=S.parse('Serving Size: 3 Softgels\nFish Oil 3,600 te\nOmega3 2160 z\ni Eicosapentaenoic acid (EPA) 1,300 Ded\nDocosahexaenoic acid (DHA) 860mc 4');
 assert.equal(draft.ingredients.length,4);assert.ok(draft.ingredients.every(r=>r.unit===''));assert.throws(()=>S.makeFood({...draft,name:'Oil'},'test-1234'),/Check each/);
 const combined=S.parse('Serving Size: 1 Capsule\nEPA + DHA 500 mg\nFish oil (EPA and DHA) 1000 mg');assert.ok(combined.ingredients.every(r=>r.key===''));
});
test('supplement-only diary does not display missing macro amounts as zero',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.template.html'),'utf8');const f=oil();const ctx=vm.createContext({foodByName:()=>f});vm.runInContext(source.slice(source.indexOf('function mealItemsIntake('),source.indexOf('function renderMealsPage(')),ctx);const result=ctx.mealItemsIntake([{name:f.name,g:3}]);assert.equal(ctx.macroDisplay(result,'prot'),'Unknown');assert.equal(ctx.macroDisplay(result,'kcal'),'Unknown');
});
test('automatic names describe parsed supplement ingredients without inventing brands',()=>{
 assert.equal(S.parse(label).name,'Omega-3 fish oil');
 assert.equal(S.parse('Supplement Facts\nServing Size: 1 Tablet\nVitamin D3 25 mcg').name,'Vitamin D3');
 assert.equal(S.parse('Supplement Facts\nServing Size: 1 Tablet\nMagnesium (as citrate) 100 mg').name,'Magnesium');
 assert.equal(S.parse('Serving Size: 1 scoop\nCreatine monohydrate 3 g').name,'Creatine monohydrate');
 assert.equal(S.parse('Serving Size: 1 tablet\nVitamin C 100 mg\nVitamin D3 10 mcg\nZinc 5 mg').name,'Multivitamin & mineral supplement');
 assert.equal(S.parse('').name,'Scanned supplement');
 const draft=S.parse(label);const custom=S.makeFood({...draft,name:'My preferred fish oil'},'custom-name-123');assert.equal(F.snapshot(custom).name,'My preferred fish oil');
});

test('explicit elemental magnesium counts once; compound and packaging prose do not',()=>{
 for(const prefix of ['Providing Elemental','Foviding Elemental','Elemental','Equivalent to elemental','Of which']){
  const d=S.parse('Nutritional Information\nServing Size: 3 Capsules\nServings Per Container: 30\nMagnesium Bisglycinate 1950mg\n'+prefix+' Magnesium 253mg 67%\nReference Intake of an average adult (8400kJ/2000kcal)\nIngredients: Magnesium Glycinate 1950mg');
  assert.equal(d.name,'Magnesium');assert.equal(d.ingredients.length,2);assert.equal(d.ingredients[0].key,'');assert.equal(d.ingredients[1].key,'magnesium');
  const f=S.makeFood(d,'magnesium-test');near(f.nutrients.magnesium*3/100,253);near(N.total([{name:f.name,g:1,food:f}],(n,e)=>F.snapshot(e.food),'magnesium').value,253/3);
 }
 const compound=S.parse('Serving Size: 1 Capsule\nMagnesium bisglycinate 1950mg');assert.equal(compound.ingredients[0].key,'');
});
test('two amount columns require choosing a value; RI percentages are not extra doses',()=>{
 const d=S.parse('Serving Size: 3 Capsules\nMagnesium 84.3mg 253mg 67%');assert.equal(d.ingredients[0].amount,'');assert.equal(d.issues.length,1);assert.throws(()=>S.makeFood(d,'multi-column'),/Check each/);
 assert.equal(S.parse('Serving Size: 3 Capsules\nMagnesium 253mg 67%').ingredients[0].amount,253);
});

test('explicit per-capsule headers work without confusing container counts',()=>{
 const d=S.parse('Nutritional Information\nServings Per Container: 30\nAmount Per 3 Capsules\nElemental Magnesium 253mg');assert.equal(d.servingCount,3);assert.equal(d.doseUnit,'capsules');assert.equal(S.detect(d.text),true);
 const single=S.parse('Supplement Facts\nPer capsule\nZinc 10mg');assert.equal(single.servingCount,1);
 const blend=S.parse('Serving Size: 1 capsule\nZinc with elemental magnesium 500mg');assert.equal(blend.ingredients[0].key,'');
});

test('supplement search finds generic nutrients without assigning a dose',()=>{
 assert.equal(S.search('iron supplements')[0].key,'iron');assert.deepEqual(S.search('vitamin C').map(d=>d.key),['vitamin_c']);assert.equal(S.search('vitamin d3')[0].key,'vitamin_d');assert.equal(S.search('magnesium glycinate')[0].key,'magnesium');assert.equal(S.search('unlisted product').length,0);
 assert.ok(S.catalog.every(d=>d.amount===undefined));
});
test('manual doses convert units and retain exact amounts through saved snapshots',()=>{
 for(const [key,amount,unit,want] of [['iron',14,'mg',14],['vitamin_c',.5,'g',500],['vitamin_d',25,'µg',25],['epa',600,'mg',.6]]){
  const f=S.fromDose(key,amount,unit,'manual-'+key),snapshot=F.snapshot(f);
  near(N.total([{name:f.name,g:1,meal:'supplements',food:snapshot}],(n,e)=>e.food,key).value,want);
  near(N.total([{name:f.name,g:2,meal:'supplements',food:snapshot}],(n,e)=>e.food,key).value,want*2);
  assert.equal(snapshot.protein_g_per_100g,null);assert.equal(snapshot.kcal,null);
 }
 for(const dose of ['',0,-1,'no',Infinity])assert.throws(()=>S.fromDose('iron',dose,'mg','bad'));
 assert.throws(()=>S.fromDose('iron',14,'IU','bad'));assert.throws(()=>S.fromDose('unknown',14,'mg','bad'));
});
test('supplements category survives diary reload alongside existing meals',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.template.html'),'utf8');const f=S.fromDose('iron',14,'mg','iron-test');
 const entry={name:f.name,g:1,meal:'supplements',food:f};const existing={...entry,meal:'snacks'};
 const ctx=vm.createContext({FoodScan:F,FOOD_BY_NAME:new Map(),store:{getItem:()=>JSON.stringify({days:[{date:'2026-10-24',entries:[existing,entry]}],active:0})},dedupeDays:require('../lib/diary-sync').uniqueDays,todayISO:()=> '2026-10-24'});
 vm.runInContext(source.slice(source.indexOf('const MEALS ='),source.indexOf('function updateDayBtn(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function loadLog('),source.indexOf('function saveLog(')),ctx);
 const entries=ctx.loadLog().days[0].entries;assert.equal(entries[0].meal,'snacks');assert.equal(entries[1].meal,'supplements');assert.equal(entries[1].food.ingredients[0].amount,14);
});


test('each tablet provides and dotted leaders retain copper dose in micrograms',()=>{
 const text='Nutrition Information %NRV*\nEach tablet provides:\nCopper........................2500 μg 250\n*NRV = Nutrient Reference Value\nIngredients: bulking agents';
 const d=S.parse(text);assert.equal(S.detect(text),true);assert.equal(d.servingCount,1);assert.equal(d.doseUnit,'tablets');assert.equal(d.ingredients[0].key,'copper');assert.equal(d.ingredients[0].amount,2500);assert.equal(d.ingredients[0].unit,'µg');
 const f=S.makeFood(d,'copper-tablet');near(N.total([{name:f.name,g:1,food:f}],(n,e)=>e.food,'copper').value,2.5);
});

test('OCR border character before elemental magnesium does not lose nutrient mapping',()=>{
 const d=S.parse('Nutritional Information\nMagnesium Bisglycinate 1950mg\ni Providing Elemental Magnesium 253mg 67%');
 assert.equal(d.name,'Magnesium');assert.equal(d.ingredients[1].key,'magnesium');assert.equal(d.ingredients[0].key,'');
 assert.equal(S.reviewState({...d,weakRead:true}).missingServing,true);
 assert.equal(S.reviewState(d).needsIngredients,false);
 assert.match(S.reviewState(d).message,/Amounts found/);
 const f=S.makeFood({...d,servingCount:3,doseUnit:'capsules'},'border-test');near(f.nutrients.magnesium*3/100,253);
 assert.equal(S.matchKey('i Providing Elemental Magnesium','mg'),'magnesium');
 assert.equal(S.matchKey('Magnesium Bisglycinate','mg'),'');assert.equal(S.matchKey('Zinc with elemental magnesium','mg'),'');
});
test('review distinguishes missing serving, incomplete amounts, conflicting columns and empty scans',()=>{
 const d=S.parse('Serving Size: 3 Capsules\nElemental Magnesium 253mg');
 assert.equal(S.reviewState({...d,weakRead:true}).needsIngredients,false);
 assert.equal(S.reviewState({...d,issues:['A second reading could not confirm every amount.']}).needsIngredients,false);
 assert.doesNotMatch(S.reviewState({...d,weakRead:true}).message,/couldn.t|not read/i);
 assert.equal(S.reviewState(S.parse('Serving Size: 3 Capsules\nMagnesium 84mg 253mg')).needsIngredients,true);
 assert.equal(S.reviewState(S.parse('Serving Size: 3 Capsules\nMagnesium 253')).missingAmounts,true);
 assert.match(S.reviewState(S.parse('')).message,/No ingredient amounts/);
});
