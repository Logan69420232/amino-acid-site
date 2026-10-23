/* Scanned food snapshots are private diary entries, never additions to the atlas. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./supplement-scan'));else root.FoodScan=factory(root.SupplementScan);})(typeof globalThis!=='undefined'?globalThis:this,function(SupplementScan){
  const fields=[['energy','Calories','kcal'],['protein','Protein','g'],['carb','Carbohydrate','g'],['fat','Fat','g'],['saturated_fat','Saturates','g'],['sugars','Sugars','g'],['fibre','Fibre','g'],['salt','Salt','g']];
  const number=v=>v===null||v===undefined||String(v).trim()===''?null:Number.isFinite(+String(v).replace(',','.'))?+String(v).replace(',','.'):null;
  function barcode(raw){const code=String(raw||'').replace(/[\s-]/g,'');if(!/^(\d{8}|\d{12,14})$/.test(code))return null;let sum=0;for(let i=code.length-2,w=3;i>=0;i--,w=w===3?1:3)sum+=+code[i]*w;return (10-sum%10)%10===+code.at(-1)?code:null;}
  function fromProduct(product,code){
    const n=product.nutriments||{},values={};
    for(const [key,off] of [['energy','energy-kcal'],['protein','proteins'],['carb','carbohydrates'],['fat','fat'],['saturated_fat','saturated-fat'],['sugars','sugars'],['fibre','fiber'],['salt','salt']])values[key]=number(n[off+'_100g']);
    if(values.energy===null&&number(n.energy_100g)!==null&&/^kj$/i.test(n.energy_unit||''))values.energy=number(n.energy_100g)/4.184;
    if(values.salt===null&&number(n.sodium_100g)!==null)values.salt=number(n.sodium_100g)*2.5;
    const liquid=/\b(?:ml|cl|litres?|liters?)\b/i.test([product.quantity,product.serving_size,product.nutrition_data_per].join(' '));
    return {name:String(product.product_name||product.product_name_en||'').slice(0,160),brand:String(product.brands||'').slice(0,100),barcode:code,source:'Open Food Facts',basis:liquid?'100ml':'100g',referenceGrams:liquid?'':100,values};
  }
  // Conservative English label parser: extract only explicit amounts, never %DV or '<' values.
  // The reviewer chooses which nutrition column was read and confirms its reference weight.
  function parseLabel(text){
    const values={},lines=String(text||'').replace(/\r/g,'').split('\n').map(s=>s.trim());
    const patterns={energy:/\b(?:calories|energy)\b/i,protein:/\bprotein\b/i,carb:/\b(?:total\s+carbohydrate|carbohydrates?)\b/i,fat:/^(?:total\s+)?fat\b/i,saturated_fat:/\b(?:saturates|saturated\s+fat)\b/i,sugars:/^(?:of which\s+|total\s+)?sugars\b/i,fibre:/\b(?:dietary\s+)?fib(?:re|er)\b/i,salt:/\bsalt\b/i};
    for(const [key,re] of Object.entries(patterns)){
      const line=lines.find(s=>re.test(s));if(!line)continue;
      const tail=line.slice(line.match(re).index+line.match(re)[0].length);
      if(/^[\s:]*[<≤]/.test(tail))continue;
      const match=key==='energy'?tail.match(/(\d+(?:[.,]\d+)?)\s*kcal/i)||(/calories/i.test(line)?tail.match(/^\s*:?\s*(\d+(?:[.,]\d+)?)(?![\d.,])(?=\s*(?:kcal|$))/i):null):tail.match(/^\s*:?\s*(\d+(?:[.,]\d+)?)\s*(mg|g)\b/i);
      if(match)values[key]=number(match[1])/(key!=='energy'&&match[2]?.toLowerCase()==='mg'?1000:1);
      else if(key==='energy'){const kj=tail.match(/(\d+(?:[.,]\d+)?)\s*kJ/i);if(kj)values.energy=number(kj[1])/4.184;}
    }
    if(values.salt===undefined){const s=lines.find(s=>/^sodium\b/i.test(s));const m=s?.match(/^sodium\s*:?\s*(\d+(?:[.,]\d+)?)\s*(mg|g)\b/i);if(m)values.salt=number(m[1])*(m[2].toLowerCase()==='mg'?0.001:1)*2.5;}
    // No assumed basis: dual-column and serving labels need a deliberate choice.
    return {name:'',brand:'',source:'Label',basis:'',referenceGrams:'',values,text:String(text||'').slice(0,12000)};
  }
  function makeFood(draft,id){
    const name=String(draft.name||'').trim(),basis=draft.basis,ref=basis==='100g'?100:number(draft.referenceGrams);
    if(!name||name.length>160)throw Error('Enter a product name (up to 160 characters).');
    if(!['100g','100ml','serving'].includes(basis)||!ref||ref<=0||ref>5000)throw Error('Choose the label basis and enter its weight in grams.');
    const values={},nutrients={};
    for(const [key,,unit] of fields){const v=number(draft.values?.[key]);if(v===null){if(['energy','protein','carb','fat'].includes(key))throw Error('Check and enter calories, protein, carbohydrate and fat. Missing values are not zero.');continue;}if(v<0||v/ref*100>(unit==='kcal'?1000:100))throw Error('Check the '+key.replace('_',' ')+' amount and the reference weight.');values[key]=v/ref*100;}
    if(values.protein+values.fat+values.carb>105)throw Error('Protein, carbohydrate and fat exceed 100 g per 100 g. Check the nutrition column and reference weight.');
    if(values.saturated_fat>values.fat+0.5||values.sugars>values.carb+0.5)throw Error('Saturates or sugars exceed their parent nutrient. Check the values.');
    for(const [key,v] of Object.entries(values))if(key!=='salt')nutrients[key==='energy'?'kcal':key]=v;
    if(values.salt!==undefined)nutrients.sodium=values.salt/2.5*1000;
    const source=draft.source==='Open Food Facts'?'Open Food Facts':'Label';
    return {scanVersion:1,scanId:id,name,brand:String(draft.brand||'').slice(0,100),barcode:barcode(draft.barcode)||null,category:'other',state:'as labelled',protein_g_per_100g:values.protein,kcal:values.energy,carb:values.carb,fat:values.fat,aa:{},nutrients,nutritionSource:{dataset:source},source,serving_g:ref,reviewed:true};
  }
  function snapshot(food){
    if(!food||food.scanVersion!==1||food.reviewed!==true||typeof food.scanId!=='string'||!/^[\w-]{8,80}$/.test(food.scanId))return null;
    if(food.supplement)return SupplementScan.snapshot(food);
    try{const n=food.nutrients||{};const f=makeFood({name:food.name,brand:food.brand,barcode:food.barcode,source:food.source,basis:'100g',values:{...n,energy:food.kcal,protein:food.protein_g_per_100g,carb:food.carb,fat:food.fat,salt:number(n.sodium)===null?null:n.sodium/1000*2.5}},food.scanId);f.serving_g=number(food.serving_g)>0?Math.min(food.serving_g,5000):100;return f;}catch{return null;}
  }
  return {fields,number,barcode,fromProduct,parseLabel,makeFood,snapshot};
});
