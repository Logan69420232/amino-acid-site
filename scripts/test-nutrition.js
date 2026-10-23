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
  const section=key=>lipidSection(html,key);
  assert.match(section('vitamin_c'),/width:100.00%/);assert.match(section('vitamin_c'),/200% DV/);
  assert.match(section('iron'),/width:0.00%/);
  assert.doesNotMatch(section('iodine'),/nutrition-meter/);
  assert.doesNotMatch(section('omega_3').split('</summary>')[0],/nutrition-meter/);
  assert.match(section('omega_3'),/Partial amount/);
  assert.match(section('omega_3'),/partial component sum/);
  assert.match(html,/<summary>Lipids<\/summary>/);
  assert.equal((html.match(/data-nutrient="cholesterol"/g)||[]).length,1);
});

test('breakdown lists each food\'s contribution, largest first, without inventing zeros', () => {
  const foods = { a:{nutrients:{iron:2}}, b:{nutrients:{iron:10}}, c:{nutrients:{iron:'Tr'}}, d:{nutrients:{}} };
  const rows = Nutrition.breakdown([{name:'a',g:100},{name:'b',g:50},{name:'c',g:100},{name:'d',g:100},{name:'a',g:0}], n=>foods[n], 'iron');
  assert.deepEqual(rows.map(r=>r.name), ['b','a','c','d']);
  assert.equal(rows[0].value, 5); assert.equal(rows[1].value, 2);
  assert.ok(Math.abs(rows[0].share - 5/7) < 1e-10);
  assert.equal(rows[2].value, null); assert.equal(rows[2].trace, true); assert.equal(rows[2].share, null);
  assert.equal(rows[3].value, null); assert.equal(rows[3].trace, false);
  const sum = rows.reduce((s,r)=>s+(r.value||0),0);
  assert.equal(sum, Nutrition.total([{name:'a',g:100},{name:'b',g:50},{name:'c',g:100},{name:'d',g:100}], n=>foods[n], 'iron').value);
});

// Exercise the actual history exporter, including the existing macro/AA columns.
function historyExport(foods, days) {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../index.template.html'), 'utf8');
  const code = source.slice(source.indexOf('function historyCSV('), source.indexOf('function renderHistoryPage('));
  const context = vm.createContext({Nutrition, foodByName: name => foods[name],
    AA_META: [['leucine']], MEAL_LABEL: {breakfast: 'Breakfast', lunch: 'Lunch'}});
  vm.runInContext(source.slice(source.indexOf('function quantityUnit('),source.indexOf('function quantityText(')),context);
  vm.runInContext(code, context);
  const csv = context.historyCSV(days.map(d => ({d, prot: 10, kcal: 100, carb: 15, fat: 2})));
  // Parse quoted fields, doubled quotes and embedded CR/LF just as a spreadsheet does.
  const rows = [[]]; let field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      rows.at(-1).push(field); field = '';
      if (c === '\n') rows.push([]);
    } else field += c;
  }
  rows.at(-1).push(field);
  const headers = rows.shift();
  assert.equal(new Set(headers).size, headers.length);
  for (const row of rows) assert.equal(row.length, headers.length);
  return {headers, rows: rows.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]])))};
}

test('history CSV appends all vitamin/mineral units and scales food and daily amounts', () => {
  const food = {name: 'Lentils, cooked', protein_g_per_100g: 9, kcal: 116, carb: 20, fat: 0.4,
    aa: Object.fromEntries(Array.from({length:18}, (_, i) => [i ? 'aa' + i : 'leucine', 1])),
    nutrients: usda.records['172421'].nutrients};
  const days = [{date:'2026-10-09', entries:[{name:'lentils',g:120,meal:'breakfast'}, {name:'lentils',g:80,meal:'lunch'}]},
    {date:'2026-10-10', entries:[{name:'lentils',g:50,meal:'breakfast'}]}, {date:'2026-10-11',entries:[]}];
  const {headers, rows} = historyExport({lentils:food}, days);
  assert.deepEqual(headers.slice(0,9), ['date','meal','food','grams','protein_g','kcal','carb_g','fat_g','leucine_g']);
  assert.equal(rows.length,5);
  assert.equal(rows[0].meal,'Breakfast'); assert.equal(rows[0].food,'Lentils, cooked');
  assert.equal(rows[0].protein_g,'10.80'); assert.equal(rows[0].leucine_g,'1.200');
  assert.equal(rows[0].vitamin_c_mg,'1.8'); assert.equal(rows[2].vitamin_c_mg,'3');
  assert.equal(rows[4].vitamin_c_mg,'0.75'); assert.equal(rows[2].food,'DAY TOTAL');
  for (const d of Nutrition.definitions.filter(d => ['Vitamins','Minerals'].includes(d.group))) {
    const key = d.key + '_' + (d.unit === 'µg' ? 'ug' : d.unit);
    assert.ok(headers.includes(key)); assert.ok(headers.includes(d.key + '_status'));
    const expected = Nutrition.total(days[0].entries, () => food, d.key).value;
    if (expected === null) assert.equal(rows[2][key],'');
    else assert.ok(Math.abs(Number(rows[2][key]) - expected) < 1e-8);
  }
});

test('history CSV distinguishes zero, tiny values, unknown, trace and partial daily totals', () => {
  const foods = {
    a:{name:'A',protein_g_per_100g:0,nutrients:{vitamin_c:0,vitamin_b12:0.00001,iron:2,iodine:'trace',selenium:'trace'}},
    b:{name:'B',protein_g_per_100g:0,nutrients:{iron:3,iodine:'trace',selenium:1}},
    legacy:{name:'Legacy',protein_g_per_100g:10}
  };
  const {rows} = historyExport(foods,[{date:'2026-10-11',entries:Object.keys(foods).map(name=>({name,g:50}))}]);
  assert.equal(rows[0].vitamin_c_mg,'0'); assert.equal(rows[0].vitamin_c_status,'reported');
  assert.equal(rows[0].vitamin_b12_ug,'0.000005');
  assert.equal(rows[0].iodine_ug,''); assert.equal(rows[0].iodine_status,'trace');
  assert.equal(rows[2].vitamin_c_mg,''); assert.equal(rows[2].vitamin_c_status,'unknown');
  const total = rows.at(-1);
  assert.equal(total.vitamin_c_mg,'0'); assert.equal(total.vitamin_c_status,'partial');
  assert.equal(total.iron_mg,'2.5'); assert.equal(total.iron_status,'partial');
  assert.equal(total.iodine_ug,''); assert.equal(total.iodine_status,'trace + unknown');
  assert.equal(total.selenium_ug,'0.5'); assert.equal(total.selenium_status,'partial + trace');
  assert.equal(total.biotin_ug,''); assert.equal(total.biotin_status,'unknown');
});

test('history CSV keeps analytical vitamin forms separate and flags unresolved foods', () => {
  const foods = {us:{name:'US',protein_g_per_100g:0,nutrients:{vitamin_a_rae:10,vitamin_d:2,vitamin_e:1}},
    uk:{name:'UK',protein_g_per_100g:0,nutrients:{vitamin_a_re:15,vitamin_d_uk:3,vitamin_e_uk:4}}};
  const {rows} = historyExport(foods,[{date:'2026-10-11',entries:['us','uk','unresolved'].map(name=>({name,g:100}))}]);
  const total = rows.at(-1);
  for (const [key, value] of Object.entries({vitamin_a_rae_ug:10,vitamin_a_re_ug:15,vitamin_d_ug:2,vitamin_d_uk_ug:3,vitamin_e_mg:1,vitamin_e_uk_mg:4})) assert.equal(Number(total[key]),value);
  assert.equal(total.vitamin_a_rae_status,'partial');
  assert.equal(rows[0].vitamin_a_re_ug,''); assert.equal(rows[1].vitamin_a_rae_ug,'');
});

test('history CSV preserves quoted food names and does not change the diary', () => {
  const name = 'Food, "quoted"\r\nsecond line';
  const days = [{date:'2026-10-11',entries:[{name:'food',g:100,meal:'breakfast'}]}];
  const before = JSON.stringify(days);
  const {rows} = historyExport({food:{name,protein_g_per_100g:0,nutrients:{calcium:20}}}, days);
  assert.equal(rows[0].food,name); assert.equal(rows[0].calcium_mg,'20');
  assert.equal(JSON.stringify(days),before);
});

test('EPA + DHA target scales portions from grams to mg and excludes other omega-3s', () => {
  const foods={fish:{nutrients:{epa:0.3,dha:0.2,ala:2,dpa:1,omega_3:4}}};
  const p=Nutrition.epaDhaProgress([{name:'fish',g:50}],n=>foods[n]);
  assert.equal(p.targetMg,250);assert.equal(p.valueMg,250);assert.equal(p.percent,100);assert.equal(p.partial,false);
  assert.equal(Nutrition.epaDhaProgress([{name:'fish',g:200}],n=>foods[n]).percent,400);
  assert.equal(Nutrition.dailyValue('epa',{value:0.25}).label,'No DV set');
});

test('EPA + DHA target preserves zero, missing components, trace and empty logs', () => {
  const calc=nutrients=>Nutrition.epaDhaProgress([{name:'food',g:100}],()=>({nutrients}));
  const zero=calc({epa:0,dha:0});assert.equal(zero.valueMg,0);assert.equal(zero.percent,0);assert.equal(zero.partial,false);
  const partial=calc({epa:0.1});assert.equal(partial.valueMg,100);assert.equal(partial.percent,40);assert.equal(partial.partial,true);
  const trace=calc({epa:0.1,dha:'trace'});assert.equal(trace.valueMg,100);assert.equal(trace.partial,true);
  for(const nutrients of [{},{epa:'trace'},{omega_3:1,ala:1}]){const p=calc(nutrients);assert.equal(p.valueMg,null);assert.equal(p.percent,null);}
  assert.equal(Nutrition.epaDhaProgress([],()=>null).valueMg,null);
  const p=Nutrition.epaDhaProgress([{name:'fish',g:100},{name:'missing',g:100}],n=>n==='fish'?{nutrients:{epa:0.1,dha:0.2}}:undefined);
  assert.ok(Math.abs(p.valueMg-300)<1e-9);assert.equal(p.partial,true);
});

function renderLipidTest(nutrients, options) {
  const vm=require('node:vm'),fs=require('node:fs');
  const context=vm.createContext({Nutrition,foodByName:()=>({key:'f',name:'Food',nutrients})});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../nutrition-ui.js'),'utf8'),context);
  return context.nutritionDashboard([{name:'f',g:100}], options);
}
function lipidSection(html,key) {
  const marker=html.indexOf('data-nutrient="'+key+'"');
  assert.notEqual(marker,-1);
  const start=html.lastIndexOf('<details',marker);
  let depth=0;
  for(const match of html.slice(start).matchAll(/<\/?details\b[^>]*>/g)) {
    depth+=match[0].startsWith('</')?-1:1;
    if(depth===0)return html.slice(start,start+match.index+match[0].length);
  }
  assert.fail('Unclosed nutrient section: '+key);
}

test('existing EPA/DHA rows share one combined target without a duplicate card', () => {
  const html=renderLipidTest({epa:0.1,dha:0.4});
  assert.doesNotMatch(html,/omega-target|omegaTargetTitle/);
  for(const key of ['epa','dha'])assert.equal((html.match(new RegExp('data-nutrient="'+key+'"','g'))||[]).length,1);
  assert.match(lipidSection(html,'epa'),/100 mg/);assert.match(lipidSection(html,'dha'),/400 mg/);
  assert.match(lipidSection(html,'epa'),/200% of combined target/);assert.match(lipidSection(html,'epa'),/width:100.00%/);
  assert.doesNotMatch(lipidSection(html,'dha'),/nutrition-meter/);
  const partial=renderLipidTest({epa:0.1});assert.match(lipidSection(partial,'epa'),/40% of combined target · partial data/);
  assert.match(lipidSection(partial,'dha'),/Unknown/);
  assert.doesNotMatch(lipidSection(renderLipidTest({}),'epa'),/nutrition-meter|0% of combined target/);
});

test('lipid targets and limits use correct energy units, retain unknowns and never invent subtype targets',()=>{
  const t=value=>({value,missing:0,trace:0});
  assert.equal(Nutrition.lipidGuidance('ala',t(2000*0.005/9)).percent,100);
  assert.equal(Nutrition.lipidGuidance('la',t(2000*0.04/9)).percent,100);
  assert.equal(Nutrition.lipidGuidance('saturated_fat',t(2000*0.1/9)).over,false);
  assert.equal(Nutrition.lipidGuidance('saturated_fat',t(30)).over,true);
  assert.equal(Nutrition.lipidGuidance('trans_fat',t(2000*0.01/9)).over,true);
  assert.equal(Nutrition.lipidGuidance('cholesterol',t(600)).progress,'200% of label reference');
  for(const key of ['mono_fat','poly_fat','omega_3','omega_6','dpa','aa_fat','phytosterols','dha'])assert.equal(Nutrition.lipidGuidance(key,t(1)).percent,null);
  for(const value of [null,undefined,NaN,-1,Infinity])assert.equal(Nutrition.lipidGuidance('ala',t(value)).percent,null);
  assert.equal(Nutrition.lipidGuidance('trans_fat',t(0)).progress,'0% of limit');
  assert.equal(Nutrition.lipidGuidance('la',{value:1,missing:1}).partial,true);
});

test('every lipid has guidance with target, range and limit semantics distinct from FDA DVs',()=>{
  const html=renderLipidTest({saturated_fat:40,trans_fat:3,ala:0.5,la:4,cholesterol:500});
  for(const d of Nutrition.definitions.filter(d=>d.group==='Lipids')){
    assert.ok(Nutrition.lipidGuidance(d.key,{value:null}));
    assert.doesNotMatch(lipidSection(html,d.key),/No DV set/);
  }
  assert.match(html,/2,000 kcal reference diet/);assert.match(lipidSection(html,'fat'),/Range: 44–78 g/);
  assert.match(lipidSection(html,'saturated_fat'),/is-limit is-over/);assert.match(lipidSection(html,'trans_fat'),/Limit: &lt;2.2 g/);
  assert.match(lipidSection(html,'ala'),/Target: 1.1 g/);assert.match(lipidSection(html,'la'),/Target: 8.9 g/);
  assert.doesNotMatch(lipidSection(html,'mono_fat'),/nutrition-meter/);
});


test('omega groups preserve total arithmetic and keep the chosen component targets inside the correct family',()=>{
  const html=renderLipidTest({omega_3:4,ala:3,epa:0.1,dha:0.2,dpa:0.4,omega_6:12,la:8,aa_fat:0.5},{epaDhaGoalMg:1500});
  const three=lipidSection(html,'omega_3'),six=lipidSection(html,'omega_6');
  assert.match(three.split('</summary>')[0],/4 g/);
  assert.match(six.split('</summary>')[0],/12 g/);
  assert.doesNotMatch(three.split('</summary>')[0],/nutrition-meter|100%|target reached/i);
  assert.match(three,/EPA \+ DHA goal: 1,500 mg/);
  assert.match(three,/20% of combined target/); // Abundant ALA does not cover the EPA/DHA gap.
  assert.match(six,/Target: 8.9 g/);
  for(const key of ['ala','epa','dha','dpa'])assert.match(three,new RegExp('data-nutrient="'+key+'"'));
  for(const key of ['la','aa_fat'])assert.match(six,new RegExp('data-nutrient="'+key+'"'));
  for(const key of ['omega_3','omega_6','ala','epa','dha','dpa','la','aa_fat'])assert.equal(html.split('data-nutrient="'+key+'"').length-1,1);
  const unknown=lipidSection(renderLipidTest({}),'omega_3').split('</summary>')[0];
  assert.match(unknown,/Unknown/);assert.doesNotMatch(unknown,/0 g|nutrition-meter/);
});
