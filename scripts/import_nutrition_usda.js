// node scripts/import_nutrition_usda.js <SR Legacy CSV directory>
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const Nutrition = require('../lib/nutrition');
const dir = process.argv[2];
if (!dir) throw Error('Supply the extracted USDA SR Legacy CSV directory');
function csv(line) {
  const cells = []; let value = '', quoted = false;
  for (let i=0;i<line.length;i++) {
    const c=line[i];
    if (c==='"') { if(quoted && line[i+1]==='"'){value+='"';i++;}else quoted=!quoted; }
    else if(c===',' && !quoted){cells.push(value);value='';}else value+=c;
  }
  cells.push(value); return cells;
}
function rows(file) {
  const lines=fs.readFileSync(path.join(dir,file),'utf8').trim().split(/\r?\n/), header=csv(lines.shift());
  return lines.map(l=>Object.fromEntries(csv(l).map((v,i)=>[header[i],v])));
}
const mapping = Object.fromEntries(Nutrition.definitions.filter(d=>d.usdaId).map(d=>[d.usdaId,[d.key,d.usdaUnit]]));
Object.assign(mapping,{1003:['protein','G'],1004:['fat','G'],1005:['carb','G'],1008:['kcal','KCAL']});
const meta = Object.fromEntries(rows('nutrient.csv').map(n=>[n.id,n]));
for(const [id,[,unit]] of Object.entries(mapping)) if(meta[id]?.unit_name!==unit) throw Error('Unexpected USDA nutrient unit: '+id);
const foods=Object.fromEntries(rows('food.csv').map(f=>[f.fdc_id,f]));
const groups=Object.fromEntries(rows('food_category.csv').map(g=>[g.id,g.description]));
const ndb=Object.fromEntries(rows('sr_legacy_food.csv').map(f=>[f.fdc_id,f.NDB_number]));
(async()=>{
  const acc={}; let header;
  for await(const line of readline.createInterface({input:fs.createReadStream(path.join(dir,'food_nutrient.csv')),crlfDelay:Infinity})) {
    if(!header){header=csv(line);continue;}
    const c=csv(line), row=Object.fromEntries(header.map((k,i)=>[k,c[i]]));
    const def=mapping[row.nutrient_id]; if(!def)continue;
    const value=Nutrition.amount(row.amount); if(value===null)continue;
    const n=acc[row.fdc_id] ||= {}; if(def[0] in n)throw Error('Duplicate nutrient '+row.fdc_id+'/'+row.nutrient_id);
    n[def[0]]=value;
  }
  const records={};
  for(const [id,n] of Object.entries(acc)) {
    const f=foods[id]; if(!f || groups[f.food_category_id]==='Baby Foods')continue;
    records[id]={name:f.description,ndb:ndb[id],group:groups[f.food_category_id],nutrients:n};
  }
  const file=path.join(dir,'food_nutrient.csv');
  const out={source:'USDA SR Legacy, April 2018',url:'https://fdc.nal.usda.gov/download-datasets/',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),records};
  fs.writeFileSync(path.join(__dirname,'../data/nutrition_usda.json'),JSON.stringify(out));
  console.log('Imported USDA nutrition for '+Object.keys(records).length+' foods');
})().catch(e=>{console.error(e);process.exitCode=1;});
