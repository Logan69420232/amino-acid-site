const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.template.html'),'utf8');
test('history retains more than 31 unique days without dropping old history',()=>{
 const context=vm.createContext({DiarySync:require('../lib/diary-sync'),preserveSyncCopy:()=>{throw Error('Unexpected conflict');}});
 vm.runInContext(source.slice(source.indexOf('function dedupeDays('),source.indexOf('function loadLog(')),context);
 const days=Array.from({length:65},(_,i)=>({date:new Date(Date.UTC(2026,7,1+i)).toISOString().slice(0,10),entries:[{name:'Egg',g:100,meal:'breakfast'}]}));
 const kept=context.dedupeDays(days);assert.equal(kept.length,65);assert.equal(kept[0].date,days[0].date);assert.equal(kept.at(-1).date,days.at(-1).date);
});
