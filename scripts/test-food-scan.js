const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../lib/food-scan'),N=require('../lib/nutrition'),D=require('../lib/diary-sync');
const label='Nutrition per 100g\nEnergy 840kJ / 200kcal\nFat 5g\nSaturates 1.5g\nCarbohydrate 20g\nSugars 3g\nFibre 4g\nProtein 15g\nSalt 0.5g';
const draft=()=>({...F.parseLabel(label),name:'Test food',basis:'100g'});
test('valid product barcode checksums; leading zeroes preserved',()=>{assert.equal(F.barcode('3017 6204 22003'),'3017620422003');assert.equal(F.barcode('012345678905'),'012345678905');for(const c of ['3017620422004','123','https://example.org','123456789012345'])assert.equal(F.barcode(c),null);});
test('English label parsing keeps energy units, salt and missing values separate',()=>{const p=F.parseLabel(label);assert.equal(p.values.energy,200);assert.equal(p.values.salt,0.5);assert.equal(p.values.protein,15);assert.equal(p.basis,'');const us=F.parseLabel('Calories 150\nTotal Fat 7g 10%\nSodium 200mg 8%\nTotal Carbohydrate 16g 6%\nProtein 4g');assert.equal(us.values.salt,0.5);assert.equal(us.values.energy,150);assert.equal(us.values.fibre,undefined);assert.equal(F.parseLabel('Protein <0.5 g\nSalt 20%').values.protein,undefined);assert.equal(F.parseLabel('Salt 20%').values.salt,undefined);});
test('serving and liquid conversion requires explicit weight; unknown is never zero',()=>{const d=draft();d.basis='serving';d.referenceGrams=50;const f=F.makeFood(d,'test-food-123');assert.equal(f.kcal,400);assert.equal(f.nutrients.kcal,400);assert.equal(f.nutrients.sodium,400);assert.equal(f.protein_g_per_100g,30);assert.equal(N.hasAminoAcids(f),false);assert.equal(N.total([{name:f.name,g:100}],()=>f,'vitamin_a_rae').value,null);assert.throws(()=>F.makeFood({...d,basis:'100ml',referenceGrams:''},'test-food-123'));assert.throws(()=>F.makeFood({...d,values:{...d.values,protein:''}},'test-food-123'));assert.throws(()=>F.makeFood({...d,values:{...d.values,protein:-1}},'test-food-123'));assert.throws(()=>F.makeFood({...d,values:{...d.values,protein:500}},'test-food-123'));});
test('barcode missing macros stay blank and liquid products need weight confirmation',()=>{const p=F.fromProduct({product_name:'Milk',quantity:'1 litre',nutriments:{proteins_100g:3.5,fat_100g:0}},'012345678905');assert.equal(p.basis,'100ml');assert.equal(p.values.energy,null);assert.equal(p.values.fat,0);assert.throws(()=>F.makeFood(p,'test-food-123'));});
test('scanned snapshots survive diary reload and never replace same-named atlas foods',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.template.html'),'utf8'),food=F.makeFood(draft(),'test-food-123');
 let json=JSON.stringify({days:[{date:'2026-10-23',entries:[{name:food.name,g:50,meal:'breakfast',food},{name:food.name,g:100,meal:'breakfast'}]}],active:0});
 const ctx=vm.createContext({FoodScan:F,FOOD_BY_NAME:new Map([[food.name,{name:food.name,protein_g_per_100g:99}]]),store:{getItem:()=>json,setItem:(k,v)=>{json=v;}},MEAL_LABEL:{breakfast:'Breakfast'},dedupeDays:D.uniqueDays,todayISO:()=> '2026-10-23',schedulePush:()=>{}});
 vm.runInContext(source.slice(source.indexOf('function foodByName('),source.indexOf('function updateDayBtn(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function loadLog('),source.indexOf('/* Each day remembers')),ctx);
 const l=ctx.loadLog();ctx.saveLog(l);const r=ctx.loadLog();assert.equal(r.days[0].entries.length,2);assert.equal(ctx.foodByName(food.name,r.days[0].entries[0]).protein_g_per_100g,15);assert.equal(ctx.foodByName(food.name,r.days[0].entries[1]).protein_g_per_100g,99);
 const total=N.total(r.days[0].entries,ctx.foodByName,'sodium');assert.equal(total.value,100);assert.equal(total.missing,1);
});
test('sync detects snapshot changes and preserves exact nutrition without adding duplicate servings',()=>{const food=F.makeFood(draft(),'test-food-123');const day={date:'2026-10-23',entries:[{name:food.name,g:50,meal:'breakfast',food}]};const base={days:[day],active:0};const remote=structuredClone(base);remote.days[0].entries[0].food.kcal=201;assert.notEqual(D.key(day),D.key(remote.days[0]));const m=D.merge(remote,base,base).log;assert.equal(m.days[0].entries.length,1);assert.equal(m.days[0].entries[0].g,50);assert.equal(m.days[0].entries[0].food.kcal,201);});
test('snapshot validation drops unknown fields and rejects malformed nutrition',()=>{const f=F.makeFood(draft(),'test-food-123');f.photo='private';f.nutrients.epa=999;const copy=F.snapshot(f);assert.equal(copy.photo,undefined);assert.equal(copy.nutrients.epa,undefined);assert.equal(F.snapshot({...f,kcal:-3}),null);});
function cameraHarness(getUserMedia){
 const source=fs.readFileSync(require('node:path').join(__dirname,'../scan-ui.js'),'utf8');
 const elements={scanCamera:{disabled:false},scanCapture:{hidden:true,disabled:false},scanVideo:{hidden:true,srcObject:null,play:async()=>{}}};
 const messages=[];const ctx=vm.createContext({navigator:{mediaDevices:{getUserMedia}},$:(id)=>elements[id],status:(message)=>messages.push(message),valid:()=>ctx.active,active:true,controls:null,worker:null,abort:null,photoURL:null,epoch:0});
 vm.runInContext(source.slice(source.indexOf('  function stop()'),source.indexOf('  function valid(')),ctx);
 vm.runInContext(source.slice(source.indexOf('  async function camera('),source.indexOf('  function captureLabel(')),ctx);
 return {ctx,elements,messages};
}
test('label camera requests rear video only and releases every track on stop',async()=>{
 let requested,stops=0;const stream={getTracks:()=>[{stop(){stops++;}}]};const {ctx,elements}=cameraHarness(async opts=>{requested=opts;return stream;});
 await ctx.camera('label');assert.equal(requested.audio,false);assert.equal(requested.video.facingMode.ideal,'environment');assert.equal(elements.scanVideo.srcObject,stream);assert.equal(elements.scanCapture.hidden,false);
 ctx.stop();assert.equal(stops,1);assert.equal(elements.scanVideo.srcObject,null);assert.equal(elements.scanCapture.hidden,true);
});
test('a camera permission response arriving after close never leaves the camera on',async()=>{
 let resolve,stops=0;const {ctx,elements}=cameraHarness(()=>new Promise(r=>{resolve=r;}));const pending=ctx.camera('label');ctx.active=false;resolve({getTracks:()=>[{stop(){stops++;}}]});await pending;assert.equal(stops,1);assert.equal(elements.scanVideo.srcObject,null);assert.equal(elements.scanCapture.hidden,true);
});
test('denied camera permission gives a usable photo fallback and enables retry',async()=>{
 const {ctx,elements,messages}=cameraHarness(async()=>{throw Object.assign(Error('Denied'),{name:'NotAllowedError'});});await ctx.camera('label');assert.match(messages.at(-1),/choose a photo/);assert.equal(elements.scanCamera.disabled,false);assert.equal(elements.scanCapture.hidden,true);
});
