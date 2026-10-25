/* Portable, versioned calculation inputs. No account, storage or network access. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./nutrition'));
  else root.Evidence=factory(root.Nutrition);
})(typeof globalThis!=='undefined'?globalThis:this,function(N){
  const AA=['histidine','isoleucine','leucine','lysine','methionine','cysteine','phenylalanine','tyrosine','threonine','tryptophan','valine','alanine','arginine','aspartic_acid','glutamic_acid','glycine','proline','serine'];
  const groups={histidine:['histidine'],isoleucine:['isoleucine'],leucine:['leucine'],lysine:['lysine'],saa:['methionine','cysteine'],aaa:['phenylalanine','tyrosine'],threonine:['threonine'],tryptophan:['tryptophan'],valine:['valine']};
  function identity(f){return f ? (f.scanId?'scan:'+f.scanId:f.key?'catalogue:'+f.key:'unresolved:'+f.name) : null;}
  function sources(f){
    if(!f)return [];
    const result=[],src=f.source||'',fdc=src.match(/FDC(?: ID)? (\d+)/);
    if(src)result.push({scope:f.scanVersion?'Label / product record':N.hasAminoAcids(f)?'Protein and amino acid profile':'Catalogue citation',text:src,url:f.barcode&&/Open Food Facts/i.test(src)?'https://world.openfoodfacts.org/product/'+encodeURIComponent(f.barcode):fdc?'https://fdc.nal.usda.gov/food-details/'+fdc[1]+'/nutrients':/Gorissen/i.test(src)?'https://doi.org/10.1007/s00726-018-2640-5':null});
    const s=f.nutritionSource;
    if(s?.id)result.push({scope:'Additional nutrient record',text:s.dataset+' · '+s.id+' · '+s.name,url:s.dataset==='USDA'?'https://fdc.nal.usda.gov/food-details/'+s.id+'/nutrients':s.dataset==='CoFID'?'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid':null});
    return result;
  }
  function cautions(f){
    const notes=[],name=f?.name||'',record=f?.nutritionSource?.name||'';
    if(/whole(?:[- ]milk)?/i.test(name)&&/nonfat|skim|fat.free/i.test(record))notes.push('Record mismatch: the food name describes whole milk, but the additional nutrient record describes nonfat or skim milk. Check the record before relying on this comparison.');
    if(f?.state==='raw'&&/\b(cooked|boiled|roasted|fried)\b/i.test(record))notes.push('Preparation mismatch: this profile is marked raw, but its additional nutrient record describes cooked food.');
    if(f?.state==='cooked'&&/\braw\b/i.test(record))notes.push('Preparation mismatch: this profile is marked cooked, but its additional nutrient record describes raw food.');
    if(f?.name==='Ground beef, 90% lean (raw)')notes.push('The original curated citation describes a different lean percentage. Additional nutrient matching has been withheld.');
    return notes;
  }
  function portion(f,e={}){
    if(f?.supplement)return {quantity:e.g??100,unit:f.doseUnit||'servings',basis:'Supplement units; nutrient inputs normalised per 100 units',method:'User-entered count',labelServingQuantity:f.serving_g};
    if(f?.portionEstimate&&Math.abs((f.portionEstimate.beforePercent-f.portionEstimate.afterPercent)*f.portionEstimate.packGrams/100-e.g)<0.001)return {quantity:e.g,unit:'g',basis:'Edible food in the listed preparation state',method:'Estimated from pack percentage',packEstimate:{...f.portionEstimate}};
    return {quantity:e.g??100,unit:'g',basis:'Edible food in the listed preparation state',method:e.unit?'Estimated household measure converted to grams':'Entered grams; whether weighed was not recorded',householdUnit:e.unit||null};
  }
  function inputs(f){
    const definitions=[{key:'protein',label:'Protein',unit:'g'},{key:'kcal',label:'Calories',unit:'kcal'},...N.definitions];
    const rows=definitions.map(d=>{const t=N.total([{name:f?.name,g:100}],()=>f,d.key);return {key:d.key,label:d.label,unit:d.unit,per100:t.value,status:t.derived?'derived_partial':t.value!==null?'reported':t.trace?'trace':'unknown',trace:!!t.trace};});
    // AA eligibility matches the diary. An absent profile never becomes numeric zero.
    for(const k of AA)rows.push({key:'aa:'+k,label:k.replace(/_/g,' '),unit:'g',per100:N.hasAminoAcids(f)?f.aa[k]:null,status:N.hasAminoAcids(f)?'reported':'unknown',trace:false});
    return rows;
  }
  function references(atlas){return {proteinBaselineGPerKg:atlas.protein_rda_g_per_kg,aminoMgPerKg:{...atlas.who_requirements_mg_per_kg},aminoPatternMgPerG:{...atlas.who_pattern_mg_per_g_protein},aminoGroups:groups,lipidGuidance:Object.fromEntries(['fat','ala','la','saturated_fat','trans_fat','cholesterol'].map(k=>[k,N.lipidGuidance(k,{value:0})])),epaDhaReferenceSource:'https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf',dailyValueBasis:'FDA food-label Daily Values, adults and children aged 4+; not personalised requirements',dailyValues:{...N.dailyValues},sources:['https://iris.who.int/handle/10665/43411',N.referenceSource||'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels'],assumptions:['AA targets scale by protein goal / (body weight × protein baseline). This is an Aminodata assumption.','Amino acid amounts are composition values, not digestibility-adjusted values.','Unknown and trace amounts are excluded from numeric sums, not replaced with zero.','Different analytical forms (including RAE and RE) remain separate.']};}
  function calculate(day,ref){
    const totals={};
    for(const e of day.entries){if(!(e.portion.quantity>0))continue;for(const n of e.inputs){
      const t=totals[n.key]||(totals[n.key]={unit:n.unit,value:null,known:0,unknown:0,trace:0,derived:0});
      if(n.per100!==null){t.value=(t.value??0)+n.per100*e.portion.quantity/100;t.known++;}else if(!n.trace)t.unknown++;
      if(n.trace)t.trace++;if(n.status==='derived_partial')t.derived++;
    }}
    const targets={protein:{unit:'g',target:day.proteinGoalG}};
    for(const [key,target]of Object.entries(ref.dailyValues))targets[key]={unit:totals[key]?.unit,target,comparison:'FDA label Daily Value'};
    const aa={};let profileProtein=0;
    for(const e of day.entries)if(e.aminoProfileAvailable&&e.portion.quantity>0)profileProtein+=(e.inputs.find(n=>n.key==='protein')?.per100??0)*e.portion.quantity/100;
    for(const [id,keys] of Object.entries(ref.aminoGroups)){
      const ts=keys.map(k=>totals['aa:'+k]),known=ts.some(t=>t?.value!==null&&t?.value!==undefined);
      const mg=known?ts.reduce((s,t)=>s+(t?.value??0)*1000,0):null;
      const target=ref.aminoMgPerKg[id]*day.weightKg*(day.proteinGoalG/(day.weightKg*ref.proteinBaselineGPerKg));
      aa[id]={mg,targetMg:target,percent:mg===null?null:mg/target*100,partial:ts.some(t=>t?.unknown||t?.trace),compositionMgPerG:profileProtein>0?mg/profileProtein:null,patternMgPerG:ref.aminoPatternMgPerG[id]};
    }
    const omega=['epa','dha'].map(k=>totals[k]);
    const epaDha={valueMg:omega.some(t=>t?.value!=null)?omega.reduce((s,t)=>s+(t?.value??0)*1000,0):null,targetMg:day.epaDhaGoalMg,partial:omega.some(t=>!t||t.unknown||t.trace)};
    return {totals,targets,amino:aa,epaDha};
  }
  function snapshot(days,lookup,atlas){
    const ref=references(atlas);
    return {schema:'aminodata-calculation/v1',versions:{...atlas.versions},references:ref,days:days.map(d=>{
      if(!(d.weightKg>0&&d.proteinGoalG>0&&d.epaDhaGoalMg>0))throw Error('Positive calculation targets are required.');
      const day={date:d.date,weightKg:d.weightKg,proteinGoalG:d.proteinGoalG,epaDhaGoalMg:d.epaDhaGoalMg,targetBasis:d.targetBasis||'Explicit example settings',entries:d.entries.map(e=>{
        if(!Number.isFinite(+e.g)||+e.g<0)throw Error('Invalid portion');
        const f=lookup(e.name,e);return {foodId:identity(f),name:e.name,meal:e.meal||null,preparation:f?.state||'Not recorded',portion:portion(f,e),sources:sources(f),cautions:cautions(f),matching:{nutrients:f?.nutritionSource?.match||'Not recorded',macros:f?.macroProvenance||'Existing catalogue values; match method not recorded'},aminoProfileAvailable:N.hasAminoAcids(f),inputs:inputs(f),labelIngredients:f?.supplement?f.ingredients:null};
      })};day.results=calculate(day,ref);return day;
    })};
  }
  function cell(v){let s=v==null?'':String(v);if(typeof v==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function csv(s){
    const lines=[['date','food_id','food','meal','preparation','quantity','quantity_unit','portion_method','nutrient','unit','per_100_quantity_units','amount','status','trace','sources','dataset_version','calculation_version','reference_version']];
    for(const day of s.days)for(const e of day.entries)for(const n of e.inputs)lines.push([day.date,e.foodId,e.name,e.meal,e.preparation,e.portion.quantity,e.portion.unit,e.portion.method,n.key,n.unit,n.per100,n.per100===null?null:n.per100*e.portion.quantity/100,n.status,n.trace,e.sources.map(s=>s.text+(s.url?' '+s.url:'')).join('; '),s.versions.dataset,s.versions.calculation,s.versions.references]);
    return lines.map(r=>r.map(cell).join(',')).join('\r\n');
  }
  return {identity,sources,cautions,portion,inputs,references,calculate,snapshot,csv,cell};
});
