const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../result-method-ui.js'),'utf8');
const usability=fs.readFileSync(path.join(__dirname,'../usability-ui.js'),'utf8');
function setup(){
 const foods={known:{name:'Known food',protein_g_per_100g:20,aa:{leucine:2},source:'FDC 123'},missing:{name:'Unknown profile',protein_g_per_100g:30,aaAvailable:false,aa:{}},zero:{name:'Zero protein',protein_g_per_100g:0,aa:{leucine:0}}};
 const c={ATLAS:{protein_rda_g_per_kg:.8},SCORE_ROWS:[['leucine','Leucine',['leucine']]],WHO_KG:{leucine:39},WHO:{leucine:59},Nutrition:{hasAminoAcids:f=>!!f&&f.aaAvailable!==false&&f.aa?.leucine!=null},foodByName:n=>foods[n],quantityUnit:()=> 'g',sourceURL:()=>null,uiEsc:s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))};
 vm.createContext(c);vm.runInContext(source,c);return c;
}
test('daily explanation uses portion weights and existing scaled reference, independently of composition',()=>{
 const c=setup(),entries=[{name:'known',g:150}],before=JSON.stringify(entries),d=c.resultMethodData(entries,75,120),r=d.rows[0];
 assert.equal(r.got,3000);assert.equal(r.baseline,2925);assert.equal(r.target,5850);assert.equal(d.scale,2);assert.equal(r.composition,100);assert.equal(r.percent,3000/5850*100);assert.equal(r.score,100/59*100);assert.equal(JSON.stringify(entries),before);
 const changed=c.resultMethodData(entries,75,60).rows[0];assert.equal(changed.target,2925);assert.equal(changed.score,r.score);assert.equal(changed.percent,r.percent*2);
});
test('missing profiles do not dilute composition or appear as known zero intake',()=>{
 const c=setup(),d=c.resultMethodData([{name:'known',g:100},{name:'missing',g:100}],75,120);
 assert.equal(d.profileProtein,20);assert.equal(d.rows[0].got,2000);assert.equal(d.rows[0].composition,100);assert.equal(d.missing.length,1);
 const markup=c.uiResultMethod([{name:'missing',g:100}],75,120);assert.match(markup,/Amount unavailable/);assert.match(markup,/unknown, not zero/);assert.doesNotMatch(markup,/NaN|Infinity|0 mg logged/);
});
test('zero protein cannot produce a composition score',()=>{
 const c=setup(),markup=c.uiResultMethod([{name:'zero',g:100}],75,120,'composition');assert.match(markup,/Unavailable/);assert.doesNotMatch(markup,/NaN|Infinity/);
});
test('food labels are escaped and saved targets are explicitly identified',()=>{
 const c=setup(),entry={name:'<img onerror="bad">',g:100};
 c.foodByName=()=>({aaAvailable:false,source:'<script>bad</script>'});
 const markup=c.uiResultMethod([entry],60,90,'daily',true);assert.match(markup,/&lt;img/);assert.doesNotMatch(markup,/<img|<script>/);assert.match(markup,/saved body weight and protein goal/);
});
test('older-day overview and explanation use saved targets rather than today’s profile',()=>{
 const c=setup();Object.assign(c,{activeLogDay:()=>({date:'2020-01-01',w:60,t:90}),todayISO:()=> '2026-10-25',getWeight:()=>75,getThriveG:()=>120,mealItemsIntake:()=>({prot:45,miss:0}),macroDisplay:(_t,k)=>k==='prot'?45:0,uiSaveState:{text:'Saved',kind:'local'}});
 const start=usability.indexOf('function uiSummary('),end=usability.indexOf('function uiAvoidedFoods');vm.runInContext(usability.slice(start,end),c);
 const markup=c.uiSummary([]);assert.match(markup,/\/ 90 g/);assert.match(markup,/saved body weight is 60 kg/);assert.match(markup,/50%/);assert.doesNotMatch(markup,/120 g/);
 c.activeLogDay=()=>({date:'2026-10-25',w:60,t:90});assert.match(c.uiSummary([]),/\/ 120 g/);
});
