const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const AccountStorage = require('../lib/account-storage');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.template.html'), 'utf8');
const syncCode = source.slice(source.indexOf('let _pushTimer ='), source.indexOf('function renderAuthSlot('));
const sessionCode = source.slice(source.indexOf('let intakeSyncUser ='), source.indexOf('function initAuth()'));
const log = name => ({days: [{date: '2026-09-21', note: '', entries: name ? [{name, g: 100, meal: 'lunch'}] : []}], active: 0});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function harness() {
  const backing = new Map(), jobs = new Map(), writes = [], reads = [], remote = new Map();
  const store = AccountStorage.create({getItem: k => backing.get(k) ?? null, setItem: (k,v) => backing.set(k,v), removeItem: k => backing.delete(k)});
  let next = 0, currentUser = null;
  const h = {store, backing, writes, reads, remote, pull: async id => ({data: remote.has(id) ? {data: remote.get(id)} : null, error: null}), getUser: async () => ({data: {user: currentUser}}), writeError: null};
  let serverVersion = 0;
  const client = {auth: {getUser: () => h.getUser()}, from: () => ({
    select: () => ({eq: (key, id) => { assert.equal(key, 'user_id'); return {maybeSingle: async () => {reads.push(id); const r=await h.pull(id);if(r.data && !r.data.updated_at)r.data.updated_at=String(serverVersion);return r;}};} }),
    update: row => ({eq: (key,id) => ({eq: (field,version) => ({select: async () => {
      assert.equal(key,'user_id'); assert.equal(field,'updated_at');
      if(h.beforeWrite)await h.beforeWrite();
      if(version!==String(serverVersion))return {data:[],error:null};
      writes.push(JSON.parse(JSON.stringify(row)));if(h.writeError)return {error:h.writeError};
      remote.set(id,structuredClone(row.data));serverVersion++;return {data:[{updated_at:String(serverVersion)}],error:null};
    }})})}),
    insert: row => ({select: async () => {
      if(remote.has(row.user_id))return {error:{code:'23505'}};
      writes.push(JSON.parse(JSON.stringify(row)));if(h.writeError)return {error:h.writeError};
      remote.set(row.user_id,structuredClone(row.data));serverVersion++;return {data:[{updated_at:String(serverVersion)}],error:null};
    }})
  })};
  h.serverEdit = (id, data) => {remote.set(id,structuredClone(data));serverVersion++;};
  const ctx = vm.createContext({store, DiarySync:require("../lib/diary-sync"), blankLogDay:()=>log().days[0], authedUser: null, initialSessionResolved: false, onboardAfterAuth: false, console,
    setTimeout: (fn, ms) => {jobs.set(++next, {fn, ms}); return next;}, clearTimeout: id => jobs.delete(id),
    sbReady: () => client, loadLog: () => JSON.parse(store.getItem('aa_log') || JSON.stringify(log())),
    collectSettings: () => ({weight: store.getItem('aa_weight')}),
    applySettings: s => {if(s?.weight != null) store.setItem('aa_weight', s.weight);},
    foodByName: name => ({name}), dayKey: d => JSON.stringify(d), dedupeDays: days => days,
    window: {}, document: {querySelectorAll:()=>[],body: {dataset: {}}, createElement: () => ({addEventListener:()=>{}}), getElementById: () => ({innerHTML: '',append:()=>{}})},
    overlay: {hidden: true}, sheet: {querySelector: () => null}, closeDetail: () => {},
    renderAuthSlot: () => {}, renderAccountPage: () => {}, openOnboardSheet: () => {}
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../usability-ui.js'),'utf8'),ctx);
  vm.runInContext(syncCode + '\nfunction saveLog(log) {store.setItem("aa_log", JSON.stringify(log)); schedulePush();}\n' + sessionCode, ctx);
  h.run = code => vm.runInContext(code, ctx);
  h.login = id => { currentUser = id ? {id, user_metadata: {}} : null; ctx.session = currentUser ? {user: currentUser} : null; h.run('applyAccountSession(session)'); };
  h.flush = async ms => {for(const [id, job] of [...jobs]) if(job.ms === ms){jobs.delete(id); await job.fn();}};
  h.save = name => {ctx.testLog = log(name); h.run('saveLog(testLog)');};
  h.names = () => h.run('loadLog().days.flatMap(d => d.entries.map(e => e.name)).join(",")');
  return h;
}
test('browser meals, settings and portions are isolated across accounts and guests', () => {
  const h = harness(); h.backing.set('aa_log', JSON.stringify(log('legacy')));
  h.store.setItem('aa_log', JSON.stringify(log('guest')));
  h.login('A'); assert.equal(h.names(), ''); h.save('A food'); h.store.setItem('aa_weight', '80'); h.store.setItem('aa_portion_1', '140');
  h.login('B'); assert.equal(h.names(), ''); assert.equal(h.store.getItem('aa_weight'), null); assert.equal(h.store.getItem('aa_portion_1'), null); h.save('B food');
  h.login(null); assert.equal(h.names(), 'guest');
  h.login('A'); assert.equal(h.names(), 'A food'); assert.equal(h.store.getItem('aa_weight'), '80');
  assert.match(h.backing.get('aa_log'), /legacy/); // Preserve unowned data without importing it.
});
test('login reads only the active account and never merges another account or guest', async () => {
  const h = harness(); h.save('guest'); h.remote.set('A', {...log('A remote'), settings: {weight: 80}});
  h.login('A'); await h.flush(0); assert.equal(h.names(), 'A remote');
  h.login('B'); await h.flush(0); assert.equal(h.names(), ''); assert.equal(h.store.getItem('aa_weight'), null);
  await h.flush(1500); assert.deepEqual(h.reads, ['A','B','B']); assert.equal(h.writes.length, 1); assert.equal(h.writes[0].user_id, 'B'); assert.deepEqual(h.writes[0].data.days[0].entries, []);
});
test('slow previous-account reads cannot alter the next account or sign-out state', async () => {
  const h = harness(), late = deferred(); h.pull = id => id === 'A' ? late.promise : Promise.resolve({data: {data: log('B remote')}, error: null});
  h.login('A'); const pending = h.flush(0); h.login('B'); await h.flush(0);
  late.resolve({data: {data: {...log('A remote'), settings: {weight: 99}}}, error: null}); await pending;
  assert.equal(h.names(), 'B remote'); assert.equal(h.store.getItem('aa_weight'), null);
  h.login(null); await h.flush(1500); assert.equal(h.names(), ''); assert.equal(h.writes.length, 0);
});
test('a delayed identity lookup cannot save old meals to the new account', async () => {
  const h = harness(); h.login('A'); await h.flush(0); h.save('A food');
  const late = deferred(); h.getUser = () => late.promise; const pending = h.flush(1500);
  h.login('B'); await h.flush(0); late.resolve({data: {user: {id:'B'}}}); await pending;
  assert.equal(h.writes.length, 0); assert.equal(h.names(), '');
});
test('failed initial read blocks uploads; a later auth event can retry', async () => {
  const h = harness(); h.pull = async () => ({data: null, error: {message:'offline'}});
  h.login('A'); await h.flush(0); h.save('local A'); await h.flush(1500); assert.equal(h.writes.length, 0);
  h.pull = async () => ({data: {data: log('remote A')}, error: null}); h.login('A'); await h.flush(0); await h.flush(1500);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].user_id, 'A'); assert.equal(h.names(), 'remote A'); assert.match(h.store.getItem('aa_sync_backups'), /local A/);
});
test('failed writes are retryable and edits during a read keep their settings', async () => {
  const h = harness(), late = deferred(); h.pull = () => late.promise;
  h.login('A'); const pending = h.flush(0); h.store.setItem('aa_weight', '72'); h.save('new A');
  late.resolve({data: {data: {...log('remote A'), settings: {weight: 99}}}, error: null}); await pending; assert.equal(h.store.getItem('aa_weight'), '72');
  h.writeError = {message:'offline'}; await h.flush(1500); h.writeError = null; h.run('schedulePush()'); await h.flush(1500); assert.equal(h.writes.length, 2);
});

test('repeated account sync does not sum conflicting portions and keeps a recovery copy', async () => {
  const h=harness();h.remote.set('A',log('remote'));h.login('A');h.save('stale');await h.flush(0);await h.flush(1500);
  assert.equal(h.names(),'remote');assert.match(h.store.getItem('aa_sync_backups'),/stale/);
  for(let i=0;i<5;i++){h.login(null);h.login('A');await h.flush(0);await h.flush(1500);assert.equal(h.names(),'remote');}
});

test('a stale device cannot overwrite newer edits on a different day', async () => {
  const h=harness();h.remote.set('A',log('original'));h.login('A');await h.flush(0);await h.flush(1500);
  h.save('local edit');
  const other={...log('original'),days:[...log('original').days,{date:'2026-09-22',note:'',entries:[{name:'other device',g:50,meal:'lunch'}]}]};
  h.serverEdit('A',other);await h.flush(1500);
  assert.deepEqual(h.remote.get('A').days.flatMap(d=>d.entries.map(e=>e.name)),['local edit','other device']);
});

test('a simultaneous same-day change retries compare-and-swap and archives the losing copy', async () => {
  const h=harness();h.remote.set('A',log('original'));h.login('A');await h.flush(0);await h.flush(1500);
  h.save('local edit');h.beforeWrite=async()=>{h.beforeWrite=null;h.serverEdit('A',log('new remote'));};await h.flush(1500);
  assert.equal(h.names(),'new remote');assert.equal(h.remote.get('A').days[0].entries[0].name,'new remote');
  assert.match(h.store.getItem('aa_sync_backups'),/local edit/);
});

test('a local edit made during the database write remains pending and is subsequently saved', async () => {
  const h=harness();h.remote.set('A',log('original'));h.login('A');await h.flush(0);await h.flush(1500);
  h.save('first edit');h.beforeWrite=async()=>{h.beforeWrite=null;h.save('second edit');};await h.flush(1500);
  assert.equal(h.names(),'second edit');await h.flush(1500);assert.equal(h.remote.get('A').days[0].entries[0].name,'second edit');
});

test('removed foods stay removed after sign-out and another login', async () => {
  const h=harness();h.remote.set('A',log('original'));h.login('A');await h.flush(0);await h.flush(1500);
  h.save('');await h.flush(1500);h.login(null);h.login('A');await h.flush(0);await h.flush(1500);assert.equal(h.names(),'');assert.deepEqual(h.remote.get('A').days[0].entries,[]);
});

test('failure to preserve a conflicting copy blocks synchronization instead of discarding it', async () => {
  const h=harness();h.remote.set('A',log('remote'));h.login('A');h.save('local conflict');
  const original=h.store.setItem;h.store.setItem=(key,value)=>{if(key==='aa_sync_backups')throw new Error('quota');return original(key,value);};
  await h.flush(0);await h.flush(1500);assert.equal(h.names(),'local conflict');assert.equal(h.writes.length,0);assert.equal(h.remote.get('A').days[0].entries[0].name,'remote');
});


test('saving status follows pending, failed and successful writes', async () => {
 const h=harness();h.login('A');await h.flush(0);h.save('A food');
 assert.equal(h.run('uiSaveState.kind'),'saving');
 h.writeError={message:'offline'};await h.flush(1500);assert.equal(h.run('uiSaveState.kind'),'error');
 h.writeError=null;h.run('schedulePush()');await h.flush(1500);assert.equal(h.run('uiSaveState.kind'),'saved');
});
