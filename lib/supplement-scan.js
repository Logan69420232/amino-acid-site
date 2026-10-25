/* Supplement quantities are label units, NOT assumed grams. The legacy entry.g field
   holds that quantity; normalized nutrient values are per 100 label units. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./nutrition'));else root.SupplementScan=factory(root.Nutrition);})(typeof globalThis!=='undefined'?globalThis:this,function(Nutrition){
  const units=['softgels','capsules','tablets','scoops','drops','gummies','sachets','servings','ml','g'];
  const definitions=[{key:'kcal',label:'Calories',unit:'kcal'},{key:'protein',label:'Protein',unit:'g'},...Nutrition.definitions];
  const mass={g:1,mg:0.001,'µg':0.000001};
  const cleanUnit=u=>String(u||'').replace(/μg|mcg|ug/gi,'µg').replace(/^iu$/i,'IU').trim();
  function number(v){const s=String(v??'').trim();if(!s)return null;const n=Number(s.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,''));return Number.isFinite(n)?n:null;}
  // NIH ODS/DSID label conversions: https://dsid.od.nih.gov/unit-conversions
  // Vitamin D: https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/
  function iuFactor(key,label){
    if(key==='vitamin_d')return .025;
    if(key==='vitamin_a_rae'&&/\bretinol\b|\bretinyl (?:acetate|palmitate)\b|supplemental beta.carotene/i.test(label))return .3;
    if(key==='vitamin_e'){
      if(/\bdl-alpha|\ball-rac-alpha|\bsynthetic\b/i.test(label))return .45;
      if(/\bd-alpha|\brrr-alpha|\bnatural\b/i.test(label))return .67;
    }
    return null;
  }
  function doseUnits(key){
    const opts=[['mg','mg'],['µg','mcg (µg)'],['g','g']];
    if(key==='vitamin_d')opts.push(['IU','IU']);
    if(key==='vitamin_a_rae')opts.push(['IU-retinol','IU · retinol'],['IU-beta','IU · supplemental beta-carotene']);
    if(key==='vitamin_e')opts.push(['IU-natural','IU · natural (d-alpha)'],['IU-synthetic','IU · synthetic (dl-alpha)']);
    return opts;
  }
  function matchKey(label,unit){
    if(cleanUnit(unit)==='IU'){const key=matchKey(label,'mg');return key&&iuFactor(key,label)!==null?key:'';}
    let s=String(label||'').replace(/^[iIl|¦]\s+(?=(?:providing|provides|elemental)\b)/i,'').toLowerCase().replace(/[–−]/g,'-').replace(/\s+/g,' ').trim();
    // Match an explicit elemental declaration, including a damaged leading
    // "providing" word. Never infer elemental content from a compound weight.
    const elemental=s.match(/^(?:(?:providing|provides|equivalent to|of which|[a-z]{1,3}viding)\s+)?elemental\s+([a-z]+)(?:\s*\(as [^)]*\))?$/);
    if(elemental){const mineral=definitions.find(d=>d.group==='Minerals'&&d.label.toLowerCase()===elemental[1]);if(mineral)return mineral.key;}
    s=s.replace(/^(?:(?:providing|provides|equivalent to|of which)\s+)+/,'');
    if(unit==='IU'||/df[e]|proprietary|blend|fish oil|cod liver oil/i.test(s)||(/\bepa\b/i.test(s)&&/\bdha\b/i.test(s)))return '';
    const specific=[['epa',/\bepa\b|eicosapentaenoic/],['dha',/\bdha\b|docosahexaenoic/],['dpa',/\bdpa\b|docosapentaenoic/],['ala',/alpha.linolenic/],['omega_3',/^(?:total\s+)?omega[ -]?3\b/],['omega_6',/^(?:total\s+)?omega[ -]?6\b/],['vitamin_a_rae',/^vitamin a\b.*\brae\b/],['vitamin_a_re',/^vitamin a\b.*\bre\b/],['vitamin_d',/^vitamin d[23]?\b/],['vitamin_e',/^vitamin e\b.*alpha.tocopherol/],['vitamin_k',/^vitamin k1\b|^phylloquinone\b/],['vitamin_b6',/^vitamin b[- ]?6\b/],['vitamin_b12',/^vitamin b[- ]?12\b/],['thiamin',/^(?:vitamin b1\b|thiamin)/],['riboflavin',/^(?:vitamin b2\b|riboflavin)/],['niacin',/^(?:vitamin b3\b|niacin)/],['pantothenic_acid',/^(?:vitamin b5\b|pantothenic)/],['biotin',/^(?:vitamin b7\b|biotin)/],['saturated_fat',/^saturated fat/],['fat',/^total fat$/],['carb',/^total carbohydrate$/],['kcal',/^calories$/]];
    const found=specific.find(([,re])=>re.test(s));if(found)return found[0];
    // Elemental mineral declarations may say "Magnesium (as citrate)". A compound
    // weight such as "Magnesium citrate" is deliberately left as label-only.
    return definitions.find(d=>s===d.label.toLowerCase()||s===d.key.replaceAll('_',' ')||s.startsWith(d.key.replaceAll('_',' ')+' ('))?.key||'';
  }
  // Names describe the parsed ingredients, not an inferred brand or health claim.
  function suggestName(ingredients=[]) {
    const rows=ingredients.filter(r=>r&&typeof r.label==='string'&&r.label.trim());
    const labels=rows.map(r=>r.label),keys=new Set(rows.map(r=>r.key));
    const fish=labels.some(s=>/^fish oil\b/i.test(s));
    if(keys.has('omega_3')||(keys.has('epa')&&keys.has('dha'))||labels.some(s=>/^omega[ -]?3\b/i.test(s)))return fish?'Omega-3 fish oil':'Omega-3 supplement';
    const micros=rows.filter(r=>definitions.some(d=>d.key===r.key&&['Vitamins','Minerals'].includes(d.group)));
    if(new Set(micros.map(r=>r.key)).size>=3){
      const groups=new Set(micros.map(r=>definitions.find(d=>d.key===r.key).group));
      return groups.size>1?'Multivitamin & mineral supplement':groups.has('Vitamins')?'Multivitamin supplement':'Mineral supplement';
    }
    if(micros.length===1&&definitions.find(d=>d.key===micros[0].key).group==='Minerals'&&rows.every(r=>r===micros[0]||r.label.toLowerCase().includes(definitions.find(d=>d.key===micros[0].key).label.toLowerCase())))return definitions.find(d=>d.key===micros[0].key).label;
    const active=rows.filter(r=>!['kcal','fat','carb','protein','sugars','fibre','sodium','saturated_fat'].includes(r.key));
    const chosen=active.length?active:rows;
    const names=[...new Set(chosen.map(r=>{
      const vitamin=r.label.match(/^vitamin\s+([a-ek]|b[- ]?\d{1,2}|d[23]|k[12])\b/i);
      if(vitamin)return 'Vitamin '+vitamin[1].replace(/[- ]/g,'').toUpperCase();
      const definition=definitions.find(d=>d.key===r.key);
      const label=(definition?definition.label:r.label).replace(/\s*\([^)]*\)/g,'').trim();
      return label.charAt(0).toUpperCase()+label.slice(1);
    }).filter(n=>n.length>=2&&n.length<=70&&!/[<>@]|https?:|www\./i.test(n)))];
    return names.length?names.slice(0,2).join(' + ')+(names.length>2?' blend':''):'Scanned supplement';
  }
  function parse(text){
    const lines=String(text||'').replace(/\r/g,'').split('\n').map(s=>s.trim().replace(/^each\s+(softgel|capsule|tablet|scoop|drop|gummy|sachet)\s+(?:provides|contains)\s*:?$/i,(_,unit)=>'Serving size: 1 '+unit));
    // Read explicit serving headers, including wrapped OCR headings. Never infer
    // strength per tablet from a product name or from directions to take tablets.
    const servingText=lines.join('\n');
    const unitPattern='(softgels?|capsules?|tablets?|scoops?|drops?|gummies|gummy|sachets?|servings?|ml|g)';
    let sm=servingText.match(new RegExp('(?:^|\\n)\\s*serving\\s+size\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*'+unitPattern+'\\b','i'));
    if(!sm){const m=servingText.match(new RegExp('(?:^|\\n)\\s*(?:(?:amount|amounts|nutrition|nutritional information)\\s+)?per\\s+(?:(\\d+(?:\\.\\d+)?)\\s+)?'+unitPattern+'\\b','i'));if(m)sm=[m[0],m[1]||'1',m[2]];}
    if(!sm){const m=servingText.match(/(?:^|\n)\s*each\s+(softgel|capsule|tablet|scoop|drop|gummy|sachet)\s+(?:provides|contains)\b/i);if(m)sm=[m[0],'1',m[1]];}
    let doseUnit=sm?sm[2].toLowerCase():'servings';if(doseUnit==='gummy')doseUnit='gummies';else if(!['ml','g'].includes(doseUnit)&&!doseUnit.endsWith('s'))doseUnit+='s';
    const ingredients=[],issues=[];
    for(let i=0;i<lines.length;i++){
      let line=lines[i].replace(/^[|¦\s*]+/,'').replace(/\.{2,}/g,' ');
      if(ingredients.length&&/^(?:ingredients\b|reference intake\b|nutrient reference\b|daily value\b|suggested use\b|directions\b|storage\b|manufactured\b|distributed\b|allergy\b|contains\b)/i.test(line))break;
      if(/^(?:serving|amount per|%|ingredients|contains|nutrition|supplement facts|daily value|reference intake|\*|nutrient reference)/i.test(line))continue;
      // Also accept wrapped rows, but never borrow a number from a different nutrient.
      if(!/\d/.test(line)&&/^\d[\d,.]*\s*(?:mg|mcg|µg|g|IU|CFU)\b/i.test(lines[i+1]||''))line+=' '+lines[++i];
      let m=line.match(/^(.+?)\s+([\d][\d,]*(?:\.\d+)?)\s*(billion\s+CFU|million\s+CFU|CFU|mcg|µg|μg|ug|mg|g|IU|kcal)(?=\s|$|[*%])/i);
      if(!m){
        const partial=line.match(/^(.+?)\s+([\d][\d,]*(?:\.\d+)?)(?![\d.,])/);
        if(partial && (matchKey(partial[1],'mg')||/^fish oil$/i.test(partial[1])))m=[partial[0],partial[1],partial[2],''];
      }
      if(!m||/[<≤]/.test(m[1]))continue;
      const label=m[1].replace(/[\s:.'"|~_]+$/,'').trim(),unit=cleanUnit(m[3]),amount=number(m[2]);
      if(label.length<2||amount===null)continue;
      const multiple=/\d[\d,.]*\s*(?:mcg|µg|μg|ug|mg|g|IU|kcal)\b/i.test(line.slice(m[0].length));
      if(multiple)issues.push('More than one amount was read for '+label+'. Choose the amount per serving from your label.');
      const key=/\bDFE\b/i.test(line)?'':matchKey(label,unit);
      const readableLabel=key&&/\belemental\b/i.test(label)?'Elemental '+definitions.find(d=>d.key===key).label:label;
      ingredients.push({label:readableLabel,amount:multiple?'':amount,unit,key});
    }
    return {supplement:true,name:suggestName(ingredients),brand:'',servingCount:sm?number(sm[1]):'',doseUnit,ingredients,issues,text:String(text||'').slice(0,12000)};
  }
  function detect(text){return /each\s+(?:softgel|capsule|tablet|scoop|drop|gummy|sachet)\s+(?:provides|contains)\b|supplement facts|(?:amount\s+)?per\s+(?:\d+(?:\.\d+)?\s+)?(?:softgels?|capsules?|tablets?|scoops?|gummies|drops?|sachets?)\b|serving size[^\n]*(?:softgel|capsule|tablet|scoop|gumm|drop|sachet)|\b(?:eicosapentaenoic|docosahexaenoic|fish oil|creatine|probiotic)\b/i.test(text);}
  function makeFood(draft,id){
    const name=String(draft.name||'').trim(),count=number(draft.servingCount),doseUnit=draft.doseUnit;
    if(!name||name.length>160)throw Error('Enter a supplement name (up to 160 characters).');
    if(!units.includes(doseUnit)||!count||count<=0||count>5000)throw Error('Check the serving quantity and unit printed on the label.');
    if(!Array.isArray(draft.ingredients)||!draft.ingredients.length||draft.ingredients.length>100)throw Error('Enter at least one label ingredient and its amount (up to 100 rows).');
    const nutrients={},ingredients=draft.ingredients.map(r=>{
      const label=String(r.label||'').trim(),amount=number(r.amount),unit=cleanUnit(r.unit),key=String(r.key||'');
      if(!label||label.length>160||amount===null||amount<0||amount>1e12||!unit||unit.length>24||/[<>]/.test(unit))throw Error('Check each ingredient name, amount and unit. Leave out unknown amounts.');
      if(key){const d=definitions.find(d=>d.key===key);if(!d)throw Error('Choose a recognised nutrient or keep the row as label only.');if(Object.hasOwn(nutrients,key))throw Error('Two rows count toward '+d.label+'. Keep one as label only to avoid double counting.');
        const iu=unit==='IU'?iuFactor(key,label):null;
        if(iu===null&&!(mass[unit]&&mass[d.unit])&&unit!==d.unit)throw Error('Cannot convert '+unit+' to '+d.unit+' for '+d.label+'. Keep this row as label only.');
        const value=amount*(iu!==null?iu:mass[unit]&&mass[d.unit]?mass[unit]/mass[d.unit]:1)/count*100;
        if(!Number.isFinite(value))throw Error('Check the amount and serving quantity.');nutrients[key]=value;
      }
      return {label,amount,unit,key};
    });
    if(nutrients.omega_3!=null && ['epa','dha','dpa','ala'].reduce((s,k)=>s+(nutrients[k]||0),0)>nutrients.omega_3*1.02+0.000001)throw Error('Omega-3 components exceed the total. Check the label amounts and column.');
    return {scanVersion:1,scanId:id,supplement:true,name,brand:String(draft.brand||'').slice(0,100),category:'other',state:'as labelled',doseUnit,serving_g:count,ingredients,protein_g_per_100g:nutrients.protein??null,kcal:nutrients.kcal??null,carb:nutrients.carb??null,fat:nutrients.fat??null,aa:{},nutrients,nutritionSource:{dataset:'Label'},source:'Label',reviewed:true};
  }
  // Generic nutrient entries record the user's label dose, never a recommended dose.
  const searchKeys=['vitamin_c','vitamin_d','vitamin_b6','vitamin_b12','thiamin','riboflavin','niacin','pantothenic_acid','biotin','vitamin_k','vitamin_e','vitamin_a_rae','vitamin_a_re','choline','iron','magnesium','calcium','zinc','selenium','iodine','copper','manganese','potassium','epa','dha','ala','omega_3'];
  const aliases={vitamin_d:'vitamin d2 vitamin d3',thiamin:'vitamin b1 thiamine',riboflavin:'vitamin b2',niacin:'vitamin b3',pantothenic_acid:'vitamin b5',biotin:'vitamin b7',omega_3:'omega 3 fish oil omega-3',magnesium:'magnesium citrate glycinate bisglycinate oxide'};
  const catalog=searchKeys.map(key=>{const d=definitions.find(d=>d.key===key);return {...d,doseUnit:['epa','dha','ala','omega_3'].includes(key)?'mg':d.unit,aliases:aliases[key]||''};});
  function search(query='') {
    const words=String(query).toLowerCase().replace(/supplements?|tablets?|capsules?/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
    return catalog.filter(d=>{const text=(d.label+' '+d.aliases).toLowerCase().replace(/[^a-z0-9]+/g,' ');return words.every(w=>text.split(/\s+/).some(token=>w.length===1?token===w:token.startsWith(w)));});
  }
  function fromDose(key,amount,unit,id) {
    const d=catalog.find(d=>d.key===key),n=number(amount);unit=cleanUnit(unit);
    if(!d||n===null||n<=0||!doseUnits(key).some(([value])=>value===unit))throw Error('Enter a positive dose and choose a supported unit from your label.');
    const form={'IU-retinol':'retinol','IU-beta':'supplemental beta-carotene','IU-natural':'natural d-alpha-tocopherol','IU-synthetic':'synthetic dl-alpha-tocopherol'}[unit];
    const label=d.label+(form?' ('+form+')':'');
    const storedUnit=unit.startsWith('IU')?'IU':unit;
    return makeFood({name:d.label+' · '+n+' '+storedUnit+(form?' ('+form+')':''),servingCount:1,doseUnit:'servings',ingredients:[{label,key:d.key,amount:n,unit:storedUnit}]},id);
  }
  function snapshot(f){try{return makeFood({name:f.name,brand:f.brand,servingCount:f.serving_g,doseUnit:f.doseUnit,ingredients:f.ingredients},f.scanId);}catch{return null;}}
  function intakeQuantity(servingCount,doseUnit,amount){
    const count=number(servingCount),qty=number(amount);
    if(!count||count<=0||count>5000||!units.includes(doseUnit)||qty===null||qty<=0)return null;
    // Tablets/capsules in a multi-unit serving are logged as a fraction or
    // multiple of that serving. Liquids and powders retain their label units.
    const servings=count>1&&!['ml','g'].includes(doseUnit);
    const unitsTaken=qty*(servings?count:1);
    if(unitsTaken>2000)return null;
    return {unitsTaken,unit:servings?'servings':doseUnit,servings};
  }
  function reviewState(draft){
    const rows=draft.ingredients||[];
    const missingAmounts=rows.some(r=>!String(r.label||'').trim()||number(r.amount)===null||number(r.amount)<0||!cleanUnit(r.unit));
    const missingServing=!(number(draft.servingCount)>0);
    const issues=draft.issues||[];
    const message=!rows.length?'No ingredient amounts were found. Try another photo or search for your supplement.':missingAmounts?'Some ingredient amounts or units are missing.':missingServing?'Amounts found. How many capsules or tablets are these amounts for?':issues.length?'Amounts found. Please double-check them against your label.':'Check the amounts against your label, then add your dose.';
    return {message,missingServing,missingAmounts,needsIngredients:!rows.length||missingAmounts};
  }
  return {units,definitions,number,parse,detect,makeFood,snapshot,suggestName,catalog,search,fromDose,matchKey,reviewState,doseUnits,intakeQuantity};
});
