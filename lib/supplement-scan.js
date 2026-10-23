/* Supplement quantities are label units, NOT assumed grams. The legacy entry.g field
   holds that quantity; normalized nutrient values are per 100 label units. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./nutrition'));else root.SupplementScan=factory(root.Nutrition);})(typeof globalThis!=='undefined'?globalThis:this,function(Nutrition){
  const units=['softgels','capsules','tablets','scoops','drops','gummies','sachets','servings','ml','g'];
  const definitions=[{key:'kcal',label:'Calories',unit:'kcal'},{key:'protein',label:'Protein',unit:'g'},...Nutrition.definitions];
  const mass={g:1,mg:0.001,'µg':0.000001};
  const cleanUnit=u=>String(u||'').replace(/μg|mcg|ug/gi,'µg').replace(/^iu$/i,'IU').trim();
  function number(v){const s=String(v??'').trim();if(!s)return null;const n=Number(s.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,''));return Number.isFinite(n)?n:null;}
  function matchKey(label,unit){
    const s=label.toLowerCase().replace(/[–−]/g,'-').trim();
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
    const lines=String(text||'').replace(/\r/g,'').split('\n').map(s=>s.trim());
    const serving=lines.find(s=>/^serving size\b/i.test(s))||'';
    const sm=serving.match(/serving size\s*:?\s*(\d+(?:\.\d+)?)\s*(softgels?|capsules?|tablets?|scoops?|drops?|gummies|gummy|sachets?|servings?|ml|g)\b/i);
    let doseUnit=sm?sm[2].toLowerCase():'servings';if(doseUnit==='gummy')doseUnit='gummies';else if(!['ml','g'].includes(doseUnit)&&!doseUnit.endsWith('s'))doseUnit+='s';
    const ingredients=[];
    for(let i=0;i<lines.length;i++){
      let line=lines[i].replace(/^[|¦\s]+/,'');if(/^(?:serving|amount per|%|ingredients|contains|nutrition|supplement facts|daily value|\*|nutrient reference)/i.test(line))continue;
      // Also accept wrapped rows, but never borrow a number from a different nutrient.
      if(!/\d/.test(line)&&/^\d[\d,.]*\s*(?:mg|mcg|µg|g|IU|CFU)\b/i.test(lines[i+1]||''))line+=' '+lines[++i];
      let m=line.match(/^(.+?)\s+([\d][\d,]*(?:\.\d+)?)\s*(billion\s+CFU|million\s+CFU|CFU|mcg|µg|μg|ug|mg|g|IU|kcal)(?=\s|$|[*%])/i);
      if(!m){
        const partial=line.match(/^(.+?)\s+([\d][\d,]*(?:\.\d+)?)(?![\d.,])/);
        if(partial && (matchKey(partial[1],'mg')||/^fish oil$/i.test(partial[1])))m=[partial[0],partial[1],partial[2],''];
      }
      if(!m||/[<≤]/.test(m[1]))continue;
      const label=m[1].replace(/[:.]+$/,'').trim(),unit=cleanUnit(m[3]),amount=number(m[2]);
      if(label.length<2||amount===null)continue;
      ingredients.push({label,amount,unit,key:/\bDFE\b/i.test(line)?'':matchKey(label,unit)});
    }
    return {supplement:true,name:suggestName(ingredients),brand:'',servingCount:sm?number(sm[1]):'',doseUnit,ingredients,text:String(text||'').slice(0,12000)};
  }
  function detect(text){return /supplement facts|serving size[^\n]*(?:softgel|capsule|tablet|scoop|gumm|drop|sachet)|\b(?:eicosapentaenoic|docosahexaenoic|fish oil|creatine|probiotic)\b/i.test(text);}
  function makeFood(draft,id){
    const name=String(draft.name||'').trim(),count=number(draft.servingCount),doseUnit=draft.doseUnit;
    if(!name||name.length>160)throw Error('Enter a supplement name (up to 160 characters).');
    if(!units.includes(doseUnit)||!count||count<=0||count>5000)throw Error('Check the serving quantity and unit printed on the label.');
    if(!Array.isArray(draft.ingredients)||!draft.ingredients.length||draft.ingredients.length>100)throw Error('Enter at least one label ingredient and its amount (up to 100 rows).');
    const nutrients={},ingredients=draft.ingredients.map(r=>{
      const label=String(r.label||'').trim(),amount=number(r.amount),unit=cleanUnit(r.unit),key=String(r.key||'');
      if(!label||label.length>160||amount===null||amount<0||amount>1e12||!unit||unit.length>24||/[<>]/.test(unit))throw Error('Check each ingredient name, amount and unit. Leave out unknown amounts.');
      if(key){const d=definitions.find(d=>d.key===key);if(!d)throw Error('Choose a recognised nutrient or keep the row as label only.');if(Object.hasOwn(nutrients,key))throw Error('Two rows count toward '+d.label+'. Keep one as label only to avoid double counting.');
        if(!(mass[unit]&&mass[d.unit])&&unit!==d.unit)throw Error('Cannot convert '+unit+' to '+d.unit+' for '+d.label+'. Keep this row as label only.');
        const value=amount*(mass[unit]&&mass[d.unit]?mass[unit]/mass[d.unit]:1)/count*100;
        if(!Number.isFinite(value))throw Error('Check the amount and serving quantity.');nutrients[key]=value;
      }
      return {label,amount,unit,key};
    });
    if(nutrients.omega_3!=null && ['epa','dha','dpa','ala'].reduce((s,k)=>s+(nutrients[k]||0),0)>nutrients.omega_3*1.02+0.000001)throw Error('Omega-3 components exceed the total. Check the label amounts and column.');
    return {scanVersion:1,scanId:id,supplement:true,name,brand:String(draft.brand||'').slice(0,100),category:'other',state:'as labelled',doseUnit,serving_g:count,ingredients,protein_g_per_100g:nutrients.protein??null,kcal:nutrients.kcal??null,carb:nutrients.carb??null,fat:nutrients.fat??null,aa:{},nutrients,nutritionSource:{dataset:'Label'},source:'Label',reviewed:true};
  }
  function snapshot(f){try{return makeFood({name:f.name,brand:f.brand,servingCount:f.serving_g,doseUnit:f.doseUnit,ingredients:f.ingredients},f.scanId);}catch{return null;}}
  return {units,definitions,number,parse,detect,makeFood,snapshot,suggestName};
});
