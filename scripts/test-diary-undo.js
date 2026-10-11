const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function harness(){
 let log={days:[{date:'2026-10-11',entries:[{name:'Oats',g:50,meal:'breakfast'}]}],active:0},writes=0;
 const elements={'[role="status"]':{},'[data-undo]':{},'[data-dismiss]':{}};
 const toast={hidden:true,querySelector:s=>elements[s]};
 let mounted=false;
 const ctx=vm.createContext({store:{owner:'A',getItem:()=>null},document:{querySelectorAll:()=>[],getElementById:()=>mounted?toast:null,createElement:()=>toast,body:{appendChild:()=>{mounted=true;}}},window:{__v2Render:()=>{}},loadLog:()=>structuredClone(log),activeLogDay:()=>structuredClone(log.days[log.active]),saveLog:l=>{log=structuredClone(l);writes++;}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../usability-ui.js'),'utf8'),ctx);
 return {ctx,run:c=>vm.runInContext(c,ctx),undo:()=>elements['[data-undo]'].onclick(),get log(){return log},get writes(){return writes}};
}
function remove(h){h.run("uiMutateDay(()=>{const l=loadLog();l.days[0].entries=[];saveLog(l);},'Food removed.');");}
test('Undo restores the changed day once and keeps unrelated days intact',()=>{
 const h=harness();remove(h);h.log.days.push({date:'2026-10-10',entries:[]});h.undo();
 assert.equal(h.log.days[0].entries[0].g,50);assert.equal(h.log.days.length,2);assert.equal(h.writes,2);h.undo();assert.equal(h.writes,2);
});
test('Undo never overwrites an intervening edit or another account',()=>{
 for(const change of [h=>h.log.days[0].entries.push({name:'Rice',g:100}),h=>h.ctx.store.owner='B']){
  const h=harness();remove(h);change(h);const before=JSON.stringify(h.log);h.undo();assert.equal(JSON.stringify(h.log),before);assert.equal(h.writes,1);
 }
});
test('account changes clear pending Undo and previous sync status',()=>{
 const h=harness();remove(h);h.run("uiSetSaveState('Saved to your account','saved');uiResetAccountState();");h.undo();assert.equal(h.writes,1);assert.equal(h.run('uiSaveState.kind'),'local');
});
test('invalid hidden-food preferences cannot break diary rendering',()=>{
 const h=harness();for(const v of ['bad','{}','null','[1,"Oats"]']){h.ctx.store.getItem=()=>v;assert.equal(h.run('uiAvoidedFoods().join()'),v.includes('Oats')?'Oats':'');}
});
