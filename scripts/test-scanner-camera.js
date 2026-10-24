const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scan-ui.js'),'utf8');
function harness(capabilities={torch:true},apply){
 const button={hidden:true,disabled:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
 let live=true,enabled=false,stopped=0;const calls=[],messages=[];
 const track={getCapabilities:()=>capabilities,getSettings:()=>({torch:enabled}),getConstraints:()=>({width:{ideal:2560}}),readyState:'live',stop(){stopped++;this.readyState='ended';enabled=false;},async applyConstraints(c){calls.push(c);if(apply)await apply(c);else enabled=c.advanced.at(-1).torch;}};
 const context=vm.createContext({$:()=>button,valid:()=>live,status:t=>messages.push(t)});
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
