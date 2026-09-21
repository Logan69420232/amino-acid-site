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
  const client = {auth: {getUser: () => h.getUser()}, from: () => ({
    select: () => ({eq: (key, id) => { assert.equal(key, 'user_id'); return {maybeSingle: () => {reads.push(id); return h.pull(id);}};} }),
    upsert: async row => {writes.push(JSON.parse(JSON.stringify(row))); return {error: h.writeError};}
  })};
  const ctx = vm.createContext({store, authedUser: null, initialSessionResolved: false, onboardAfterAuth: false, console,
    setTimeout: (fn, ms) => {jobs.set(++next, {fn, ms}); return next;}, clearTimeout: id => jobs.delete(id),
    sbReady: () => client, loadLog: () => JSON.parse(store.getItem('aa_log') || JSON.stringify(log())),
    collectSettings: () => ({weight: store.getItem('aa_weight')}),
    applySettings: s => {if(s?.weight != null) store.setItem('aa_weight', s.weight);},
    foodByName: name => ({name}), dayKey: d => JSON.stringify(d), dedupeDays: days => days,
    window: {}, document: {body: {dataset: {}}, getElementById: () => ({innerHTML: ''})},
    overlay: {hidden: true}, sheet: {querySelector: () => null}, closeDetail: () => {},
    renderAuthSlot: () => {}, renderAccountPage: () => {}, openOnboardSheet: () => {}
  });
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
  await h.flush(1500); assert.deepEqual(h.reads, ['A','B']); assert.equal(h.writes.length, 1); assert.equal(h.writes[0].user_id, 'B'); assert.deepEqual(h.writes[0].data.days[0].entries, []);
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
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].user_id, 'A'); assert.match(h.names(), /local A/); assert.match(h.names(), /remote A/);
});
test('failed writes are retryable and edits during a read keep their settings', async () => {
  const h = harness(), late = deferred(); h.pull = () => late.promise;
  h.login('A'); const pending = h.flush(0); h.store.setItem('aa_weight', '72'); h.save('new A');
  late.resolve({data: {data: {...log('remote A'), settings: {weight: 99}}}, error: null}); await pending; assert.equal(h.store.getItem('aa_weight'), '72');
  h.writeError = {message:'offline'}; await h.flush(1500); h.writeError = null; h.run('schedulePush()'); await h.flush(1500); assert.equal(h.writes.length, 2);
});
