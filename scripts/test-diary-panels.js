const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../lib/diary-panels');
const backing = () => { const data=new Map(); return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}; };
function panel(key, open=true) {
  const listeners=[];
  return {dataset:{diarySection:key},open,isConnected:true,
    addEventListener:(name,fn)=>listeners.push(fn),toggle(){listeners.forEach(fn=>fn());}};
}
const root = (...panels) => ({querySelectorAll:()=>panels});
test('closed categories survive renders and a new page session; untouched defaults remain',()=>{
  const storage=backing(),prefs=create(storage),lipids=panel('lipids'),amino=panel('amino-acids');
  prefs.bind(root(lipids,amino));lipids.open=false;lipids.toggle();amino.open=false;amino.toggle();
  for(const session of [prefs,create(storage)]){
    const next=[panel('lipids'),panel('amino-acids'),panel('minerals'),panel('more-nutrition',false)];
    session.bind(root(...next));assert.deepEqual(next.map(p=>p.open),[false,false,true,false]);
  }
});
test('reopening a section is saved without changing another section',()=>{
 const storage=backing(),prefs=create(storage),a=panel('essential-amino-acids'),b=panel('nonessential-amino-acids');
 prefs.bind(root(a,b));a.open=false;a.toggle();b.open=false;b.toggle();a.open=true;a.toggle();
 const aa=panel('essential-amino-acids',false),bb=panel('nonessential-amino-acids');create(storage).bind(root(aa,bb));
 assert.equal(aa.open,true);assert.equal(bb.open,false);
});
test('capture preserves a toggle immediately before a rerender; detached events cannot overwrite it',()=>{
 const prefs=create(backing()),old=panel('lipids');prefs.bind(root(old));old.open=false;prefs.capture(root(old));old.isConnected=false;
 const next=panel('lipids');prefs.bind(root(next));assert.equal(next.open,false);
 next.open=true;next.toggle();old.toggle();const newest=panel('lipids',false);prefs.bind(root(newest));assert.equal(newest.open,true);
});
test('invalid or unavailable storage preserves native controls and session preferences',()=>{
 for(const storage of [{getItem:()=>'{bad',setItem:()=>{}},{getItem:()=>'{"lipids":"false"}',setItem:()=>{}},{getItem(){throw Error();},setItem(){throw Error();}}]){
  const prefs=create(storage),a=panel('lipids');prefs.bind(root(a));assert.equal(a.open,true);a.open=false;a.toggle();
  const b=panel('lipids');prefs.bind(root(b));assert.equal(b.open,false);
 }
});
