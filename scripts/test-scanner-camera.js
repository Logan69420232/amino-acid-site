const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scan-ui.js'),'utf8');
function harness(capabilities={torch:true},apply){
 const button={hidden:true,disabled:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
 let live=true,enabled=false,stopped=0;const calls=[],messages=[];
 const track={getCapabilities:()=>capabilities,getSettings:()=>({torch:enabled}),getConstraints:()=>({width:{ideal:2560}}),readyState:'live',stop(){stopped++;this.readyState='ended';enabled=false;},async applyConstraints(c){calls.push(c);if(apply)await apply(c);else enabled=c.advanced.at(-1).torch;}};
 const context=vm.createContext({$:()=>button,valid:()=>live,status:t=>messages.push(t),setTimeout:fn=>fn()});
 vm.runInContext(source.slice(source.indexOf('  let torchTrack='),source.indexOf('  async function camera(mode)')),context);
 context.setupTorch({srcObject:{getVideoTracks:()=>[track]}},1);
 return {context,button,track,calls,messages,stop:()=>context.resetTorch(),invalidate:()=>{live=false;},get stopped(){return stopped;}};
}
test('torch toggles on and off while preserving camera resolution',async()=>{
 const h=harness();assert.equal(h.button.hidden,false);await h.button.onclick();assert.equal(h.button.attrs['aria-pressed'],'true');assert.equal(h.calls[0].width.ideal,2560);await h.button.onclick();assert.equal(h.button.attrs['aria-pressed'],'false');assert.equal(h.button.disabled,false);
});
test('unsupported flash stays hidden',()=>{for(const cap of [{},{torch:false},{torch:[false]}])assert.equal(harness(cap).button.hidden,true);assert.equal(harness({torch:[false,true]}).button.hidden,false);});
test('flash failure keeps scanner usable and does not falsely show enabled',async()=>{const h=harness({torch:true},async()=>{throw Error('unsupported');});await h.button.onclick();assert.equal(h.button.attrs['aria-pressed'],'false');assert.equal(h.button.disabled,false);assert.equal(h.messages.length,1);});
test('closing during a pending flash request stops the track and ignores its result',async()=>{
 let finish;const h=harness({torch:true},()=>new Promise(resolve=>{finish=resolve;}));const pending=h.button.onclick();h.invalidate();h.stop();finish();await pending;assert.equal(h.stopped,1);assert.equal(h.button.hidden,true);assert.equal(h.button.attrs['aria-pressed'],'false');
});
test('photo light turns on before capture and off before processing',async()=>{
 const h=harness();let lit=false;await h.context.withPhotoLight(1,()=>{lit=h.track.getSettings().torch;});
 assert.equal(lit,true);assert.deepEqual(h.calls.map(c=>c.advanced.at(-1).torch),[true,false]);assert.equal(h.track.getSettings().torch,false);assert.equal(h.button.disabled,false);
});
test('unsupported photo light does not prevent capture',async()=>{const h=harness({});let captured=0;await h.context.withPhotoLight(1,()=>captured++);assert.equal(captured,1);assert.equal(h.calls.length,0);});
test('photo still captured if enabling the light fails',async()=>{const h=harness({torch:true},async c=>{if(c.advanced.at(-1).torch)throw Error('unavailable');});let captured=0;await h.context.withPhotoLight(1,()=>captured++);assert.equal(captured,1);assert.equal(h.calls.at(-1).advanced.at(-1).torch,false);});
test('capture failure extinguishes light',async()=>{const h=harness();await assert.rejects(h.context.withPhotoLight(1,()=>{throw Error('canvas failed');}));assert.equal(h.track.getSettings().torch,false);assert.equal(h.button.disabled,false);});
test('closing while light starts prevents capture and stops the track',async()=>{let finish;const h=harness({torch:true},()=>new Promise(resolve=>{finish=resolve;}));let captured=0;const p=h.context.withPhotoLight(1,()=>captured++);h.invalidate();h.stop();finish();await p;assert.equal(captured,0);assert.equal(h.stopped,1);});
test('failure to extinguish photo light stops the camera track',async()=>{const h=harness({torch:true},async c=>{if(!c.advanced.at(-1).torch)throw Error('cannot switch off');});await h.context.withPhotoLight(1,()=>{});assert.equal(h.stopped,1);});
