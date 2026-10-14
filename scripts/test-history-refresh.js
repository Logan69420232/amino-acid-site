const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.template.html'),'utf8');
const Sync=require('../lib/diary-sync');
const day=(date,logged=true)=>({date,note:'',entries:logged?[{name:'Egg',g:100,meal:'breakfast'}]:[]});
function harness(initial=[day('2026-10-14',false)]) {
  let log={days:initial,active:0},resolveRead,focusCount=0,diaryRenders=0;
  const read=new Promise(resolve=>{resolveRead=resolve;});
  const handlers={};
  const element=id=>({focus:()=>focusCount++,addEventListener:(event,fn)=>{handlers[id+':'+event]=fn;}});
  const chart={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
  const page={innerHTML:'',querySelector:id=>id==='#histChart'?chart:element(id),querySelectorAll:()=>[]};
  const store={owner:'a',revision:0,setItem:()=>{}};
  const context=vm.createContext({console,Set,Map,Date,store,authedUser:{id:'a'},_accountEpoch:1,_syncReadyOwner:null,_historySyncError:false,
    document:{body:{dataset:{view:'history'}},getElementById:()=>page},window:{__v2Render:()=>{diaryRenders++;}},
    sbReady:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:()=>read})})})}),
    loadLog:()=>log,saveLog:value=>{log=value;},mergeLogs:(remote,local)=>Sync.merge(remote,local).log,applySettings:()=>{},schedulePush:()=>{},
    dayIntake:d=>({prot:d.entries.length?10:0,kcal:100,carb:1,fat:1,balance:1}),getWeight:()=>75,getThriveG:()=>120,
    niceStep:()=>50,todayISO:()=> '2026-10-14',_histMetric:'prot',overlay:{hidden:true},downloadCSV:()=>{},historyCSV:()=>'',navigateApp:()=>{},showView:()=>{},closeDetail:()=>{}});
  for(const [start,end] of [
    ['function isCurrentAccount(', 'let _pushJob'],
    ['function refreshHistoryIfVisible(', 'function isCurrentAccount('],
    ['async function syncOnLogin(', 'function renderAuthSlot('],
    ['let uiHistoryMonth=', '/* ================= saved meals:']
  ]) vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context);
  return {context,page,chart,handlers,resolveRead,get log(){return log;},get focusCount(){return focusCount;},get diaryRenders(){return diaryRenders;}};
}
test('delayed account load refreshes Progress from placeholder to seven logged days without moving focus',async()=>{
  const h=harness();h.context.renderHistoryPage();
  assert.match(h.page.innerHTML,/Loading saved days/);
  assert.doesNotMatch(h.page.innerHTML,/1 saved days|Your progress starts with a meal/);
  const beforeFocus=h.focusCount;
  const syncing=h.context.syncOnLogin('a',1);
  const remote={days:Array.from({length:7},(_,i)=>day('2026-10-0'+(i+1))),active:0};
  const original=JSON.stringify(remote);
  h.resolveRead({data:{data:remote},error:null});await syncing;
  assert.match(h.page.innerHTML,/7 logged days across 1 month/);
  assert.match(h.page.innerHTML,/<dt>Days logged<\/dt><dd>7<\/dd>/);
  assert.match(h.page.innerHTML,/7 of 7 days logged/); // A later empty placeholder cannot move the latest logged week.
  assert.doesNotMatch(h.page.innerHTML,/Loading saved days|Your progress starts with a meal/);
  assert.equal(h.focusCount,beforeFocus);assert.equal(h.diaryRenders,1);
  assert.equal(JSON.stringify(remote),original);
});
test('failed account read shows retry rather than pretending the account has no history',async()=>{
  const h=harness();const syncing=h.context.syncOnLogin('a',1);
  h.resolveRead({error:{message:'Offline'},data:null});await syncing;
  assert.match(h.page.innerHTML,/Could not load your latest diary/);
  assert.match(h.page.innerHTML,/Retry sync/);
  assert.doesNotMatch(h.page.innerHTML,/Your progress starts with a meal/);
  assert.equal(h.log.days.length,1);assert.equal(h.context._syncReadyOwner,null);
  assert.equal(typeof h.handlers['#historyRetrySync:click'],'function');
});
test('day counts exclude placeholders, count months independently and explain empty selected months',()=>{
  const h=harness([day('2026-09-30'),...Array.from({length:6},(_,i)=>day('2026-10-0'+(i+1))),day('2026-11-01',false)]);
  h.context._syncReadyOwner='a';h.context.renderHistoryPage();
  assert.match(h.page.innerHTML,/7 logged days across 2 months/);
  assert.match(h.page.innerHTML,/<option value="2026-10" selected>/);
  vm.runInContext('uiHistoryMonth="2026-11"',h.context);h.context.renderHistoryPage();
  assert.match(h.page.innerHTML,/No food logged in this month/);
  assert.match(h.page.innerHTML,/7 logged days are available in the other months/);
  assert.equal(h.log.days.length,8);
  const empty=harness();empty.context._syncReadyOwner='a';empty.context.renderHistoryPage();
  assert.match(empty.page.innerHTML,/0 logged days across 0 months/);
  assert.match(empty.page.innerHTML,/Your progress starts with a meal/);
});
test('a late sync response cannot redraw a different account or replace its data',async()=>{
  const h=harness();const syncing=h.context.syncOnLogin('a',1);
  h.context.authedUser={id:'b'};h.context.store.owner='b';h.context._accountEpoch=2;
  h.page.innerHTML='Account B';
  h.resolveRead({data:{data:{days:[day('2026-10-01')],active:0}},error:null});await syncing;
  assert.equal(h.page.innerHTML,'Account B');assert.equal(h.log.days[0].entries.length,0);
  assert.equal(h.diaryRenders,0);
});

 test('all seven logged dates appear in every chart metric; longer months remain scrollable',()=>{
  const h=harness(Array.from({length:7},(_,i)=>day('2026-10-'+String(i+8).padStart(2,'0'))));
  h.context._syncReadyOwner='a';h.context.renderHistoryPage();
  for(const metric of ['prot','kcal','carb','fat','macros']) {
    h.context._histMetric=metric;h.context.renderHistoryPage();
    if(metric==='macros') {
      assert.equal((h.chart.innerHTML.match(/class="hl-x"/g)||[]).length,7);
      assert.match(h.chart.innerHTML,/min-width:0px/);
    } else {
      assert.equal((h.chart.innerHTML.match(/class="history-bar-day"/g)||[]).length,7);
      assert.match(h.chart.innerHTML,/min-width:0px/);
      for(let i=8;i<=14;i++) assert.match(h.chart.innerHTML,new RegExp('<span>'+i+'</span>'));
    }
    assert.doesNotMatch(h.chart.innerHTML,/scroll for all dates|Swipe or scroll/);
  }
  h.log.days.push(day('2026-10-15'));h.context._histMetric='prot';h.context.renderHistoryPage();
  assert.equal((h.chart.innerHTML.match(/class="history-bar-day"/g)||[]).length,8);
  assert.match(h.chart.innerHTML,/min-width:320px/);
  assert.match(h.page.innerHTML,/see earlier dates/);
});
