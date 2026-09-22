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
