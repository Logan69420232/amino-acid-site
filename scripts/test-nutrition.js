const test = require('node:test');
const assert = require('node:assert/strict');
const Nutrition = require('../lib/nutrition');
const {enrich} = require('../lib/build-nutrition');
const usda = require('../data/nutrition_usda.json');
const cofid = require('../data/nutrition_cofid.json');

test('portion totals scale grams, preserve measured zero and never substitute zero for missing data', () => {
  const foods = {lentils: {nutrients: usda.records['172421'].nutrients}, unknown: {nutrients: {}}};
  const lookup = name => foods[name];
  const entries = [{name:'lentils',g:120},{name:'unknown',g:30}];
  const t = Nutrition.total(entries,lookup,'vitamin_c');
  assert.ok(Math.abs(t.value-1.8)<1e-10);
  assert.equal(t.known,1); assert.equal(t.missing,1); assert.deepEqual(t.missingFoods,['unknown']);
  assert.equal(Nutrition.total(entries,lookup,'vitamin_b12').value,0);
  assert.equal(Nutrition.total(entries,lookup,'iodine').value,null);
  assert.ok(Math.abs(Nutrition.total([{name:'lentils',g:240}],lookup,'vitamin_c').value-3.6)<1e-10);
  assert.equal(Nutrition.total([{name:'lentils',g:-10}],lookup,'vitamin_c').value,null);
});

test('trace, unknown and low positive values remain distinct', () => {
  for(const v of [null,undefined,'','N',NaN,-1,Infinity,false]) assert.equal(Nutrition.amount(v),null);
  assert.equal(Nutrition.amount('0'),0);
  assert.equal(Nutrition.amount('Tr'),'trace'); assert.equal(Nutrition.amount('trace'),'trace');
  const t = Nutrition.total([{name:'trace',g:100},{name:'unknown',g:100}], n=>({nutrients:{iodine:n==='trace'?'trace':null}}),'iodine');
  assert.equal(t.value,null); assert.equal(t.trace,1); assert.equal(t.missing,1);
  assert.equal(Nutrition.format(0),'0'); assert.equal(Nutrition.format(0.001),'<0.01');
  assert.equal(Nutrition.format(null),'Unknown');
});

test('CoFID duplicate food codes keep distinct records and correct nutrient units', () => {
  const duplicates=Object.values(cofid.records).filter(r=>r.code==='13-669');
  assert.equal(duplicates.length,2);
  const watercress=duplicates.find(r=>r.name==='Watercress, raw');
  const aubergine=duplicates.find(r=>r.name.startsWith('Aubergine'));
  assert.equal(watercress.nutrients.vitamin_c,62); // mg / 100 g
  assert.equal(watercress.nutrients.iodine,7); // µg / 100 g
  assert.equal(watercress.nutrients.carb_uk,'trace');
  assert.equal(aubergine.nutrients.vitamin_c,3);
  assert.equal(aubergine.nutrients.selenium,'trace');
  assert.ok(!Object.values(cofid.records).some(r=>r.group.startsWith('Q')));
});

test('analytically different vitamins and carbohydrates cannot be silently combined', () => {
  const foods={us:{nutrients:{vitamin_a_rae:10,carb:20}},uk:{nutrients:{vitamin_a_re:15,carb_uk:12}}};
  const entries=[{name:'us',g:100},{name:'uk',g:100}];
  assert.deepEqual([Nutrition.total(entries,n=>foods[n],'vitamin_a_rae').value,Nutrition.total(entries,n=>foods[n],'vitamin_a_re').value],[10,15]);
  assert.equal(Nutrition.total(entries,n=>foods[n],'carb').missing,1);
  for(const key of ['vitamin_a_re','vitamin_d_uk','vitamin_e_uk','carb_uk','sugars_uk']) {
    assert.equal(Nutrition.definitions.find(d=>d.key===key).basis,'CoFID');
  }
});

test('enrichment requires an exact citation, retains saved names/macros and creates stable unique diary identities', () => {
  const foods=[{key:'lentil',name:'Lentils, cooked',source:'abbreviated',protein_g_per_100g:9,kcal:116,fat:0.4,carb:20},
    {key:'unmatched',name:'Lentils, something similar',source:'unverified',protein_g_per_100g:10}];
  const extras=enrich(foods,usda,cofid);
  assert.equal(foods[0].name,'Lentils, cooked'); assert.equal(foods[0].nutrients.protein,9);
  assert.equal(foods[0].nutrients.vitamin_c,1.5); assert.equal(foods[0].nutritionSource.id,'172421');
  assert.equal(foods[1].nutritionSource,undefined); assert.equal(foods[1].nutrients.vitamin_c,undefined);
  const all=[...foods,...extras];
  assert.equal(new Set(all.map(f=>f.name)).size,all.length); assert.equal(new Set(all.map(f=>f.key)).size,all.length);
  assert.ok(extras.every(f=>!Nutrition.hasAminoAcids(f)));
  assert.ok(extras.some(f=>f.name==='Watercress, raw (UK)'));
  for(const f of extras) for(const v of Object.values(f.nutrients)) assert.ok(v==='trace'||(typeof v==='number'&&Number.isFinite(v)&&v>=0));
});

test('FDA percentages use matching units and uncapped unrounded amounts', () => {
  const total=value=>({value,known:1,missing:0,trace:0});
  assert.equal(Nutrition.dailyValue('calcium',total(650)).label,'50% DV');
  assert.equal(Nutrition.dailyValue('vitamin_c',total(90)).label,'100% DV');
  assert.equal(Nutrition.dailyValue('vitamin_b12',total(4.8)).label,'200% DV');
  assert.equal(Nutrition.dailyValue('selenium',total(27.5)).label,'50% DV');
  assert.equal(Nutrition.dailyValue('sodium',total(4600)).label,'200% DV');
  assert.equal(Nutrition.dailyValue('vitamin_c',total(0.1)).label,'<1% DV');
  const lentils=Nutrition.total([{name:'lentils',g:120}],()=>({nutrients:usda.records['172421'].nutrients}),'vitamin_c');
  assert.equal(Nutrition.dailyValue('vitamin_c',lentils).label,'2% DV');
  assert.ok(Math.abs(Nutrition.dailyValue('vitamin_c',lentils).percent-2)<1e-10);
});

test('DV keeps zero, unknown, trace and incomplete coverage distinct', () => {
  assert.equal(Nutrition.dailyValue('iron',{value:0}).label,'0% DV');
  for(const value of [null,undefined,NaN,-1,Infinity]) assert.equal(Nutrition.dailyValue('iron',{value,trace:1}).percent,null);
  const partial=Nutrition.dailyValue('iron',{value:9,missing:1});
  assert.equal(partial.label,'50% DV');assert.equal(partial.partial,true);
  assert.equal(Nutrition.dailyValue('iron',{value:9,trace:1}).partial,true);
  assert.equal(Nutrition.dailyValue('vitamin_k',{value:120}).partial,true);
  assert.match(Nutrition.dailyValue('vitamin_k',{value:120}).reason,/K1 only/);
});

test('incompatible measurements and nutrients without a DV never receive a percentage', () => {
  for(const key of ['folate','niacin','vitamin_a_re','vitamin_d_uk','vitamin_e_uk','carb_uk']) {
    const dv=Nutrition.dailyValue(key,{value:100});assert.equal(dv.percent,null);assert.equal(dv.label,'DV unavailable');assert.ok(dv.reason.length>20);
  }
  for(const key of ['sugars','sugars_uk','mono_fat','poly_fat']) assert.equal(Nutrition.dailyValue(key,{value:100}).label,'No DV set');
});

test('dashboard labels its FDA reference, partial percentages, limit references and unavailable forms', () => {
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const foods={a:{key:'a',name:'A',nutritionSource:{dataset:'USDA',id:'172421',name:'A'},nutrients:{vitamin_c:0.1,iron:9,sodium:2300}},b:{key:'b',name:'B',nutrients:{}}};
  const context=vm.createContext({Nutrition,foodByName:name=>foods[name]});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../nutrition-ui.js'),'utf8'),context);
  const html=context.nutritionDashboard([{name:'a',g:100},{name:'b',g:100}]);
  assert.match(html,/%DV · US FDA Daily Values/);
  assert.match(html,/&lt;1% DV/);
  assert.match(html,/50% DV<small>Partial reference %/);
  assert.match(html,/100% DV = 2,300 mg/);
  assert.match(html,/limit reference, not a goal to fill/);
  assert.match(html,/dietary folate equivalents/);
});

test('lipid imports use specifically identified fatty acids and food-basis grams', () => {
  const bacon=Object.values(cofid.records).find(r=>r.code==='19-500');
  assert.equal(bacon.nutrients.omega_3,0.31);assert.equal(bacon.nutrients.ala,0.22);
  assert.equal(bacon.nutrients.la,2.22);assert.equal(bacon.nutrients.dha,0.02);
  assert.equal(bacon.nutrients.trans_fat,0.01);assert.equal(bacon.nutrients.phytosterols,0.1);
  const lentils=usda.records['172421'].nutrients;
  assert.equal(lentils.trans_fat,0);assert.equal(lentils.epa,0);assert.equal(lentils.dha,0);
  assert.equal(lentils.ala,undefined); // Undifferentiated 18:3 is not ALA.
  assert.equal(Nutrition.definitions.find(d=>d.key==='ala').usdaId,1404);
  assert.equal(Nutrition.definitions.find(d=>d.key==='aa_fat').usdaId,1406);
  const total=Nutrition.total([{name:'bacon',g:200}],()=>bacon,'omega_3');
  assert.equal(total.value,0.62);assert.equal(total.derived,0);
});

test('reported omega totals take priority over components, including reported zero', () => {
  const food={nutrients:{omega_3:1,ala:0.8,epa:0.2,dha:0.1,dpa:0.1,omega_6:0,la:2}};
  const day=[{name:'test',g:100}];
  assert.equal(Nutrition.total(day,()=>food,'omega_3').value,1);
  assert.equal(Nutrition.total(day,()=>food,'omega_6').value,0);
  assert.equal(Nutrition.total(day,()=>food,'omega_3').derived,0);
});

test('omega component sums retain partial, unknown and trace coverage without inventing fatty acids', () => {
  const food={nutrients:{ala:0.5,epa:0.1,dha:'trace'}};
  const total=Nutrition.total([{name:'test',g:200}],()=>food,'omega_3');
  assert.equal(total.value,1.2);assert.equal(total.derived,1);assert.equal(total.trace,1);
  const missing=Nutrition.total([{name:'test',g:100}],()=>({nutrients:{}}),'omega_3');
  assert.equal(missing.value,null);assert.equal(missing.missing,1);assert.equal(missing.derived,0);
  const trace=Nutrition.total([{name:'test',g:100}],()=>({nutrients:{ala:'trace'}}),'omega_3');
  assert.equal(trace.value,null);assert.equal(trace.trace,1);
  for(const key of ['omega_3','ala','dha','epa','dpa','omega_6','la','aa_fat','trans_fat','phytosterols']) assert.equal(Nutrition.dailyValue(key,total).label,'No DV set');
});

test('DV bars cap visually, retain percentage text, mark partial coverage and omit unavailable DVs', () => {
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const food={key:'a',name:'A',nutrients:{vitamin_c:180,iron:0,ala:0.5}};
  const context=vm.createContext({Nutrition,foodByName:()=>food});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../nutrition-ui.js'),'utf8'),context);
  const html=context.nutritionDashboard([{name:'a',g:100}]);
  const section=key=>html.match(new RegExp('data-nutrient="'+key+'"[\\s\\S]*?</details>'))[0];
  assert.match(section('vitamin_c'),/width:100.00%/);assert.match(section('vitamin_c'),/200% DV/);
  assert.match(section('iron'),/width:0.00%/);
  assert.doesNotMatch(section('iodine'),/nutrition-meter/);
  assert.doesNotMatch(section('omega_3'),/nutrition-meter/);
  assert.match(section('omega_3'),/Partial amount/);
  assert.match(section('omega_3'),/partial component sum/);
  assert.match(html,/<summary>Lipids<\/summary>/);
  assert.equal((html.match(/data-nutrient="cholesterol"/g)||[]).length,1);
});
