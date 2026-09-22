const Nutrition = require('./nutrition');
const norm = s => s.toLowerCase().split(',').map(x=>x.trim()).sort().join('|');
// Explicit reference matches for abbreviated curated citations. Never fuzzy-fill
// micronutrients from a food with a similar name. The source record stays visible.
const REFERENCES = {
  'Lentils, cooked': '172421', 'Chickpeas, cooked': '173757',
  'Kidney beans, cooked': '175194', 'Brown rice, cooked': '169704',
  'Walnuts, raw': '170187'
};
function enrich(foods, usda, cofid) {
  const records = usda.records, represented = new Set();
  const byNdb = Object.fromEntries(Object.entries(records).map(([id,r])=>[String(+r.ndb),id]));
  const byName = Object.fromEntries(Object.entries(records).map(([id,r])=>[norm(r.name),id]));
  for(const f of foods) {
    const source=f.source || '';
    let id=source.match(/FDC (?:ID )?(\d+)/)?.[1];
    if(!id){const ndb=source.match(/NDB (\d+)/)?.[1];if(ndb)id=byNdb[String(+ndb)];}
    if(!id) {
      const name=source.match(/USDA SR Legacy, (.+?)(?: \(via nutritionvalue.*|$)/)?.[1]
        || source.match(/USDA SR Legacy \((.+)\)/)?.[1];
      if(name)id=byName[norm(name)];
    }
    if(!id)id=REFERENCES[f.name];
    // This pre-existing curated label says 90% lean but cites an 80% lean record.
    // Do not add another misleading profile until the legacy entry is corrected.
    if(f.name==='Ground beef, 90% lean (raw)')id=null;
    const r=records[id];
    f.nutrients={};
    if(r){f.nutrients={...r.nutrients};f.nutritionSource={dataset:'USDA',id,name:r.name};represented.add(id);}
    // Preserve existing food/portion macro values for existing saved meals.
    f.nutrients.protein=f.protein_g_per_100g;
    for(const k of ['kcal','fat','carb'])if(f[k]!=null)f.nutrients[k]=f[k];
  }
  const extras=[];
  for(const [id,r] of Object.entries(records)) {
    if(represented.has(id)||!Number.isFinite(r.nutrients.protein)||!Number.isFinite(r.nutrients.kcal))continue;
    extras.push(makeFood('u'+id,r.name+' (USDA)',r.nutrients,{dataset:'USDA',id,name:r.name}));
  }
  for(const [identity,r] of Object.entries(cofid.records)) {
    extras.push(makeFood('c'+identity,r.name+' (UK)',r.nutrients,{dataset:'CoFID',id:r.code,name:r.name}));
  }
  const names=new Set(foods.map(f=>f.name)), keys=new Set(foods.map(f=>f.key));
  for(const f of extras) {
    if(keys.has(f.key))throw Error('Duplicate nutrition key '+f.key);
    if(names.has(f.name))f.name+=' ['+f.key+']';
    keys.add(f.key);names.add(f.name);
    for(const [k,v] of Object.entries(f.nutrients))if(v!=='trace'&&Nutrition.amount(v)===null)throw Error('Invalid nutrition '+f.name+'/'+k);
  }
  return extras;
}
function makeFood(key,name,nutrients,nutritionSource) {
  return {key,name,nutrients,nutritionSource,protein_g_per_100g:nutrients.protein,
    kcal:nutrients.kcal,fat:typeof nutrients.fat==='number'?nutrients.fat:null,
    carb:typeof nutrients.carb==='number'?nutrients.carb:null,
    aa:{},aaAvailable:false,category:'other',tier:'nutrition',state:'as listed',serving_g:100,
    aliases:nutritionSource.dataset==='CoFID'?'UK British CoFID':'USDA',
    source:nutritionSource.dataset==='CoFID'?'UK CoFID 2021, food code '+nutritionSource.id:'USDA SR Legacy, FDC ID '+nutritionSource.id};
}
module.exports={enrich};
