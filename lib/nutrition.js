/* Shared definitions and portion arithmetic. Values are per 100 g edible food.
   Different analytical definitions stay separate rather than being silently summed. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Nutrition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const definitions = [
    ['fibre','Fibre','g','More nutrition',1079,'G'],
    ['sugars','Total sugars (USDA)','g','More nutrition',2000,'G','USDA'],
    ['sugars_uk','Total sugars (CoFID equivalents)','g','More nutrition',null,null,'CoFID'],
    ['carb','Carbohydrate (USDA total)','g','More nutrition',null,null,'USDA'],
    ['carb_uk','Carbohydrate (CoFID available)','g','More nutrition',null,null,'CoFID'],
    ['fat','Total fat','g','Lipids',1004,'G'],
    ['mono_fat','Monounsaturated','g','Lipids',1292,'G'],
    ['poly_fat','Polyunsaturated','g','Lipids',1293,'G'],
    ['omega_3','Omega-3','g','Lipids'],
    ['ala','ALA','g','Lipids',1404,'G'],
    ['dha','DHA','g','Lipids',1272,'G'],
    ['epa','EPA','g','Lipids',1278,'G'],
    ['dpa','DPA','g','Lipids',1280,'G'],
    ['omega_6','Omega-6','g','Lipids'],
    ['aa_fat','AA · Arachidonic acid','g','Lipids',1406,'G'],
    ['la','LA · Linoleic acid','g','Lipids',1316,'G'],
    ['saturated_fat','Saturated fat','g','Lipids',1258,'G'],
    ['trans_fat','Trans fats','g','Lipids',1257,'G'],
    ['cholesterol','Cholesterol','mg','Lipids',1253,'MG'],
    ['phytosterols','Phytosterols','mg','Lipids',1283,'MG'],
    ['vitamin_a_rae','Vitamin A (RAE)','µg','Vitamins',1106,'UG','USDA'],
    ['vitamin_a_re','Vitamin A (RE)','µg','Vitamins',null,null,'CoFID'],
    ['vitamin_c','Vitamin C','mg','Vitamins',1162,'MG'],
    ['vitamin_d','Vitamin D (D2 + D3)','µg','Vitamins',1114,'UG','USDA'],
    ['vitamin_d_uk','Vitamin D (CoFID total)','µg','Vitamins',null,null,'CoFID'],
    ['vitamin_e','Vitamin E (alpha-tocopherol)','mg','Vitamins',1109,'MG','USDA'],
    ['vitamin_e_uk','Vitamin E (CoFID total)','mg','Vitamins',null,null,'CoFID'],
    ['vitamin_k','Vitamin K1','µg','Vitamins',1185,'UG'],
    ['thiamin','B1 · Thiamin','mg','Vitamins',1165,'MG'],
    ['riboflavin','B2 · Riboflavin','mg','Vitamins',1166,'MG'],
    ['niacin','B3 · Niacin','mg','Vitamins',1167,'MG'],
    ['pantothenic_acid','B5 · Pantothenic acid','mg','Vitamins',1170,'MG'],
    ['vitamin_b6','Vitamin B6','mg','Vitamins',1175,'MG'],
    ['biotin','B7 · Biotin','µg','Vitamins',1176,'UG'],
    ['folate','Folate (total)','µg','Vitamins',1177,'UG'],
    ['vitamin_b12','Vitamin B12','µg','Vitamins',1178,'UG'],
    ['choline','Choline','mg','Vitamins',1180,'MG'],
    ['calcium','Calcium','mg','Minerals',1087,'MG'],
    ['iron','Iron','mg','Minerals',1089,'MG'],
    ['magnesium','Magnesium','mg','Minerals',1090,'MG'],
    ['phosphorus','Phosphorus','mg','Minerals',1091,'MG'],
    ['potassium','Potassium','mg','Minerals',1092,'MG'],
    ['sodium','Sodium','mg','Minerals',1093,'MG'],
    ['zinc','Zinc','mg','Minerals',1095,'MG'],
    ['copper','Copper','mg','Minerals',1098,'MG'],
    ['manganese','Manganese','mg','Minerals',1101,'MG'],
    ['selenium','Selenium','µg','Minerals',1103,'UG'],
    ['iodine','Iodine','µg','Minerals',1100,'UG'],
    ['chloride','Chloride','mg','Minerals',null,null,'CoFID']
  ].map(([key,label,unit,group,usdaId,usdaUnit,basis])=>({key,label,unit,group,usdaId,usdaUnit,basis}));
  // FDA Nutrition Facts Daily Values, adults and children aged 4+.
  // Verified 2026-09-22 against the linked FDA reference; units match definitions.
  const dailyValues = Object.freeze({
    fibre:28, fat:78, carb:275, saturated_fat:20, cholesterol:300,
    vitamin_a_rae:900, vitamin_c:90, vitamin_d:20, vitamin_e:15, vitamin_k:120,
    thiamin:1.2, riboflavin:1.3, pantothenic_acid:5, vitamin_b6:1.7,
    biotin:30, vitamin_b12:2.4, choline:550, calcium:1300, iron:18,
    magnesium:420, phosphorus:1250, potassium:4700, sodium:2300,
    zinc:11, copper:0.9, manganese:2.3, selenium:55, iodine:150, chloride:2300
  });
  const dailyValueSource = 'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels';
  const incompatibleDV = {
    folate:'The FDA reference uses dietary folate equivalents (DFE). This row reports total folate, which cannot be converted without its component amounts.',
    niacin:'The FDA reference uses niacin equivalents (NE), including the contribution from tryptophan. This row reports niacin only.',
    vitamin_a_re:'The FDA reference uses retinol activity equivalents (RAE). CoFID retinol equivalents (RE) are a different measure.',
    vitamin_d_uk:'CoFID total vitamin D can include weighted metabolites. It is kept separate from the D2 + D3 measure used here for FDA comparison.',
    vitamin_e_uk:'The FDA reference uses alpha-tocopherol. CoFID total vitamin E is a different measure.',
    carb_uk:'The FDA reference uses total carbohydrate. CoFID available carbohydrate is a different measure.'
  };
  function dailyValue(key, total) {
    const reference = dailyValues[key];
    if (!reference) return {percent:null, reference:null, label:incompatibleDV[key]?'DV unavailable':'No DV set', reason:incompatibleDV[key] || 'No FDA Daily Value is established for this nutrient.'};
    const partial = !!(total.missing || total.trace || key==='vitamin_k');
    if (total.value===null || !Number.isFinite(total.value) || total.value<0) return {percent:null,reference,partial,label:'DV unavailable',reason:'A numeric amount is needed to calculate a percentage; unknown and trace-only amounts are not zero.'};
    const percent=total.value/reference*100;
    const number=percent>0&&percent<1?'<1':String(Math.round(percent));
    return {percent,reference,partial,label:number+'% DV',reason:key==='vitamin_k'?'Based on vitamin K1 only; other forms of vitamin K are not included.':partial?'Percentage uses reported numeric amounts only; missing and trace amounts are not included.':''};
  }
  function amount(value) {
    if (typeof value === 'string' && /^(tr|trace)$/.test(value.trim().toLowerCase())) return 'trace';
    if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function total(entries, lookup, key) {
    let sum = 0, known = 0, missing = 0, trace = 0, derived = 0;
    const missingFoods = [];
    for (const e of entries) {
      if (!Number.isFinite(+e.g) || +e.g <= 0) continue;
      const f = lookup(e.name, e);
      const n = nutrientValue(f, key);
      if (n.derived) derived++;
      if (n.trace) trace++;
      if (n.value === null) { if(!n.trace){missing++;missingFoods.push(e.name);} continue; }
      sum += n.value * (+e.g / 100); known++;
    }
    return { value: known ? sum : null, known, missing, trace, derived, missingFoods };
  }
  // Per-food contributions to one nutrient, largest first. Same rules as total():
  // trace and unknown stay distinct from zero and carry no numeric amount.
  function breakdown(entries, lookup, key) {
    const rows = [];
    for (const e of entries) {
      if (!Number.isFinite(+e.g) || +e.g <= 0) continue;
      const n = nutrientValue(lookup(e.name, e), key);
      rows.push({ name: e.name, g: +e.g, value: n.value === null ? null : n.value * (+e.g / 100), trace: n.trace, derived: n.derived });
    }
    const sum = rows.reduce((s, r) => s + (r.value || 0), 0);
    for (const r of rows) r.share = r.value !== null && sum > 0 ? r.value / sum : null;
    return rows.sort((a, b) => (b.value === null ? -1 : b.value) - (a.value === null ? -1 : a.value));
  }
  // Prefer reported omega totals. Otherwise show only an explicitly partial
  // sum of identified species; undifferentiated 18:2/18:3/20:4 are not aliases.
  function nutrientValue(food, key) {
    const nutrients=food?.nutrients || {}, direct=amount(nutrients[key]);
    if(direct!==null)return {value:direct==='trace'?null:direct,trace:direct==='trace',derived:false};
    const keys=key==='omega_3'?['ala','dha','epa','dpa']:key==='omega_6'?['la','aa_fat']:null;
    if(!keys)return {value:null,trace:false,derived:false};
    const values=keys.map(k=>amount(nutrients[k])), numbers=values.filter(v=>typeof v==='number');
    return {value:numbers.length?numbers.reduce((a,b)=>a+b,0):null,trace:values.includes('trace'),derived:numbers.length>0||values.includes('trace')};
  }
  // EFSA adult adequate intake: EPA + DHA combined, distinct from FDA DVs.
  const epaDhaTargetMg = 250;
  const epaDhaSource = 'https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf';
  function normaliseEpaDhaGoal(value) {
    const n=amount(value);
    return typeof n==='number' && n>0 ? n : epaDhaTargetMg;
  }
  function epaDhaProgress(entries, lookup, goalMg) {
    const targetMg=normaliseEpaDhaGoal(goalMg);
    const epa = total(entries, lookup, 'epa'), dha = total(entries, lookup, 'dha');
    const values = [epa.value, dha.value].filter(v => v !== null);
    const valueMg = values.length ? values.reduce((sum, v) => sum + v, 0) * 1000 : null;
    return {epa, dha, valueMg, targetMg, customGoal:targetMg!==epaDhaTargetMg,
      percent: valueMg === null ? null : valueMg / targetMg * 100,
      partial: !!(epa.missing || dha.missing || epa.trace || dha.trace)};
  }
  // General adult reference values; energy-based amounts use 2,000 kcal, not
  // the calories logged so far. No reference is invented for individual fats.
  function lipidGuidance(key, t, combined) {
    const efsa = epaDhaSource;
    const who = 'https://www.who.int/news/item/17-07-2023-who-updates-guidelines-on-fats-and-carbohydrates';
    const refs = {
      fat: {kind:'range', label:'Range: 44–78 g/day', reason:'EFSA adult reference range: 20–35% of energy from total fat (44.4–77.8 g at 2,000 kcal). This is a range, not a goal to fill to its upper end.', source:efsa},
      ala: {kind:'target', value:2000*0.005/9, label:'Target: 1.1 g/day', reason:'EFSA adult adequate intake for ALA: 0.5% of energy, about 1.1 g at 2,000 kcal. ALA has its own reference and does not substitute for the EPA + DHA target.', source:efsa},
      la: {kind:'target', value:2000*0.04/9, label:'Target: 8.9 g/day', reason:'EFSA adult adequate intake for linoleic acid (LA): 4% of energy, about 8.9 g at 2,000 kcal. This applies to LA, not all omega-6 fats.', source:efsa},
      saturated_fat: {kind:'limit', value:2000*0.1/9, label:'Limit: ≤22.2 g/day', reason:'WHO recommends no more than 10% of energy from saturated fat, with further reduction below 10% suggested. At 2,000 kcal this is about 22.2 g. A limit is not a target to reach.', source:who},
      trans_fat: {kind:'limit', value:2000*0.01/9, label:'Limit: <2.2 g/day', reason:'WHO advises less than 1% of energy from trans fat, about 2.2 g at 2,000 kcal. Keep intake as low as possible; this is not a target to reach.', source:'https://www.who.int/news-room/fact-sheets/detail/trans-fat/'},
      cholesterol: {kind:'reference', value:300, label:'FDA label reference: 300 mg', reason:'The FDA Daily Value for cholesterol is 300 mg. This is a food-label comparison, not a personalised safe limit or an amount to aim for.', source:dailyValueSource},
      epa: {kind:'combined', label:'EPA + DHA target: 250 mg/day', reason:'EFSA adult adequate intake is 250 mg/day of EPA + DHA combined. This one bar adds the EPA and DHA recorded in the two rows; there are no separate targets. ALA and DPA are excluded. Pregnancy and breastfeeding require additional DHA.', source:efsa},
      dha: {kind:'shared', label:'Shares the EPA + DHA target', reason:'DHA counts towards the combined 250 mg/day EPA + DHA adult target. Combined progress is shown in the EPA row below; there is no separate general adult DHA target here.', source:efsa},
      omega_3: {kind:'none', label:'See ALA and EPA + DHA targets', reason:'Total omega-3 includes different fatty acids. Use the separate ALA and combined EPA + DHA references below; a total omega-3 amount alone cannot show whether either is met.', source:efsa},
      omega_6: {kind:'none', label:'See the LA target below', reason:'The adequate intake applies to linoleic acid (LA), not the entire omega-6 total. There is no separate general adult target for total omega-6 here.', source:efsa},
      mono_fat: {kind:'none', label:'No established target', reason:'EFSA does not set a numerical reference for monounsaturated fat. Prefer unsaturated fats as replacements for saturated fat, within the total-fat range.', source:efsa},
      poly_fat: {kind:'none', label:'Use the individual fatty-acid targets', reason:'EFSA does not set a numerical reference for total polyunsaturated fat. Targets are given for LA, ALA and combined EPA + DHA instead.', source:efsa},
      dpa: {kind:'none', label:'No established target', reason:'No general adult intake target is established for DPA in the reference guidance used here. DPA does not count towards the EPA + DHA target.', source:efsa},
      aa_fat: {kind:'none', label:'No established target', reason:'EFSA does not set a dietary reference value for arachidonic acid.', source:efsa},
      phytosterols: {kind:'none', label:'No general intake target', reason:'There is no general adult nutritional target for phytosterols here. Amounts used in cholesterol-lowering products are not a universal daily requirement.', source:null}
    };
    if(combined?.customGoal){
      refs.epa.label='EPA + DHA goal: '+format(combined.targetMg)+' mg/day';
      refs.epa.reason='Your chosen daily goal is '+format(combined.targetMg)+' mg of EPA + DHA combined, from food and supplements. This is a personal tracking goal, not a prescribed dose or an EFSA recommendation. The EFSA general adult adequate-intake reference remains 250 mg/day. ALA and DPA do not count towards this goal.';
      refs.dha.reason='DHA counts towards your chosen combined '+format(combined.targetMg)+' mg/day EPA + DHA goal. Combined progress is shown in the EPA row; there is no separate DHA goal.';
    }
    const ref = refs[key];
    if (!ref) return null;
    const amount = key==='epa' ? combined?.valueMg : t.value;
    const reference = key==='epa' ? (combined?.targetMg||epaDhaTargetMg) : ref.value;
    const percent = reference && Number.isFinite(amount) && amount >= 0 ? amount/reference*100 : null;
    const partial = key==='epa' ? !!combined?.partial : !!(t.missing || t.trace || t.derived);
    const number = percent>0 && percent<1 ? '<1' : String(Math.round(percent));
    const progress = percent===null ? (reference ? 'Amount unavailable' : '') :
      number + (ref.kind==='limit' ? '% of limit' : ref.kind==='reference' ? '% of label reference' : ref.kind==='combined' ? '% of combined target' : '% of target');
    return {...ref, percent, partial, progress:progress+(partial && percent!==null?' · partial data':''), over:ref.kind==='limit' && (key==='trans_fat'?percent>=100:percent>100)};
  }
  function format(value) {
    if (value == null) return 'Unknown';
    if (value > 0 && value < 0.01) return '<0.01';
    return value.toLocaleString('en-GB', {maximumFractionDigits: value < 10 ? 2 : 1});
  }
  function hasAminoAcids(f) {
    return !!(f && f.aaAvailable !== false && f.aa && Object.keys(f.aa).length === 18);
  }
  return {definitions, amount, total, breakdown, format, hasAminoAcids, dailyValues, dailyValueSource, dailyValue, epaDhaTargetMg, normaliseEpaDhaGoal, epaDhaSource, epaDhaProgress, lipidGuidance};
});
