// Diary usability helpers. Food calculations remain in the existing modules.
function uiEsc(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uiFoodName(name) {
  return name.replace(/, all grades/ig,'').replace(/, trimmed to [^,]+/ig,'').replace(/\s*\(USDA\)$/i,'');
}
let uiSaveState={text:'Saved on this device',kind:'local'};
function uiSetSaveState(text,kind='local') {
  uiSaveState={text,kind};document.querySelectorAll('[data-save-state]').forEach(e=>{e.textContent=text;e.dataset.state=kind;});
}
function uiSummary(day) {
  const totals=mealItemsIntake(day),target=getThriveG(getWeight()),left=Math.max(0,target-totals.prot);
  return `<div class="daily-overview"><div class="daily-overview-head"><span>YOUR DAY, AT A GLANCE</span><span data-save-state data-state="${uiSaveState.kind}" role="status">${uiEsc(uiSaveState.text)}</span></div><div class="daily-overview-grid"><div class="daily-protein"><span>Protein</span><strong>${macroDisplay(totals,"prot")} <small>/ ${target.toFixed(0)} g</small></strong><div class="daily-track"><span style="width:${Math.min(100,totals.prot/target*100)}%"></span></div><span class="daily-remaining">${left?left.toFixed(0)+' g to your daily goal':'Daily protein goal reached ✓'}</span></div><div class="daily-other"><div><span>Calories</span><strong>${macroDisplay(totals,"kcal")} <small>kcal</small></strong></div><div><span>Carbs</span><strong>${macroDisplay(totals,"carb")} <small>g</small></strong></div><div><span>Fat</span><strong>${macroDisplay(totals,"fat")} <small>g</small></strong></div></div></div><div class="daily-overview-foot"><span>${totals.miss?'Partial totals: some foods or supplements have unlisted macros.':'Totals from your logged food.'}</span><button type="button" class="linkish" data-edit-targets>Edit targets</button></div></div>`;
}
function uiAvoidedFoods() {
  try { const value=JSON.parse(store.getItem('aa_avoided_foods')||'[]'); return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]; }
  catch (_) { return []; }
}
let uiUndoState=null;
function uiResetAccountState() {
  uiUndoState=null;
  uiSetSaveState('Saved on this device','local');
  const toast=document.getElementById('diaryToast');if(toast)toast.hidden=true;
}
function uiToast(message,keepUndo=false) {
  if(!keepUndo)uiUndoState=null;
  let toast=document.getElementById('diaryToast');
  if(!toast){toast=document.createElement('div');toast.id='diaryToast';toast.className='diary-toast';toast.innerHTML='<span role="status"></span><button type="button" data-undo>Undo</button><button type="button" data-dismiss aria-label="Dismiss notification">×</button>';document.body.appendChild(toast);
    toast.querySelector('[data-dismiss]').onclick=()=>{toast.hidden=true;};
    toast.querySelector('[data-undo]').onclick=()=>{
      const undo=uiUndoState;if(!undo)return;
      const log=loadLog(),i=log.days.findIndex(d=>d.date===undo.before.date);
      if(store.owner!==undo.owner||i<0||JSON.stringify(log.days[i])!==undo.after){uiUndoState=null;uiToast('This day changed again. Undo is no longer available.');return;}
      log.days[i]=undo.before;saveLog(log);uiUndoState=null;window.__v2Render();uiToast('Change undone.');
    };
  }
  toast.hidden=false;toast.querySelector('[role="status"]').textContent=message;toast.querySelector('[data-undo]').hidden=!uiUndoState;
}
function uiMutateDay(action,message) {
 const before=JSON.parse(JSON.stringify(activeLogDay())),owner=store.owner;
 action();const after=activeLogDay();
 uiUndoState=JSON.stringify(before)===JSON.stringify(after)?null:{before,after:JSON.stringify(after),owner};
 uiToast(message,true);
}
function uiPreviousMeal(meal) {
 const date=activeLogDay().date;
 return loadLog().days.filter(d=>d.date<date&&d.entries.some(e=>e.meal===meal)).sort((a,b)=>b.date.localeCompare(a.date))[0];
}
function uiSuggestions(report) {
 const {candidates,gaps,unknown,proteinCovered,focus}=report;
 const fmt=(n)=>Nutrition.format(n);
 const pct=(n,target)=>Math.round(n/target*100);
 const controls=gaps.length?`<label class="recommendation-focus">Focus on <select data-recommendation-focus><option value="">Biggest recorded gaps</option>${gaps.map(g=>`<option value="${uiEsc(g.key)}"${g.key===focus?' selected':''}>${uiEsc(g.label)} · ${pct(g.got,g.target)}%${g.partial?' (partial data)':''}</option>`).join('')}</select></label>`:'';
 const introduction=proteinCovered?'Your protein goal is covered. Suggestions focus on other recorded gaps.':'Suggestions focus on the targets your logged food has not yet covered.';
 const notes=`<details class="recommendation-notes"><summary>About these suggestions</summary><p>Based on the foods you have logged and the same references shown in your nutrition details. A low recorded amount is not a diagnosis of deficiency. Missing amounts are never assumed to be zero; partial totals may underestimate what you ate.</p><p>Vitamin A uses RAE; CoFID RE values are kept separate. EPA and DHA count towards one combined daily goal. Limits such as sodium and saturated fat are not goals to fill. Suggestions use everyday food portions and do not account for allergies or medical needs.</p>${unknown.length?`<p>${unknown.length} targets cannot be assessed from the available data.</p>`:''}</details>`;
 if(!candidates.length)return `<section class="next-step"><h2>${gaps.length?'No suitable suggestion for this gap':'No extra food suggested'}</h2><p>${gaps.length?'The available foods do not provide a useful match for the selected targets and preferences. Try a different focus or review your food entries.':unknown.length?'The targets we can assess are covered. Some nutrient amounts are unavailable; check the details below.':'Your assessed targets are covered by the food logged so far.'}</p>${controls}${notes}</section>`;
 const card=(c,i)=>{
   const top=c.benefits.slice(0,3),primary=top[0];
   return `<article class="next-step-food"><div><span class="next-step-tag">HELPS WITH ${uiEsc(primary.label.toUpperCase())}</span><h3>${uiEsc(uiFoodName(c.f.name))}</h3><p class="recommendation-portion"><b>${c.serve} g</b> · ${Math.round(c.calories)} kcal</p>${primary.key==='epa_dha'?`<p class="recommendation-goal">Daily EPA + DHA goal: <b>${fmt(primary.target)} mg</b> · ${fmt(primary.gap)} mg remaining${primary.partial?' (partial data)':''}</p>`:''}<ul class="recommendation-benefits">${top.map(g=>`<li><div><b>${uiEsc(g.label)}</b><span>+${fmt(g.add)} ${uiEsc(g.unit)}${g.key==='vitamin_a_rae'?' RAE':''}</span></div><small>${g.partial?'Recorded amount, partial data: ':''}${pct(g.got,g.target)}% → ${pct(g.after,g.target)}% of ${g.kind==='protein'||g.kind==='amino'||['epa_dha','ala','la'].includes(g.key)?'target':'reference'}</small></li>`).join('')}</ul>${c.warnings.map(w=>`<p class="recommendation-caution">${uiEsc(w)}</p>`).join('')}<details><summary>Why this food?</summary><p>This portion contributes to ${top.map(g=>uiEsc(g.label)).join(', ')} while ${top.some(g=>g.partial)?'the recorded totals are below their references. Some amounts are missing, so these are possible gaps':'your logged totals are below their references'}. It is ranked for those contributions${proteinCovered?', not for adding more protein':''}.</p>${primary.key==='epa_dha'?`<p>EPA and DHA share a ${fmt(primary.target)} mg daily goal. ALA does not count towards it.</p>`:''}<p>Source: ${uiEsc(c.f.nutritionSource?.dataset||'food database')}. ${fmt(c.protAdd)} g protein in this portion.</p></details></div><div class="next-step-controls"><label>Add to<select data-suggestion-meal="${i}" aria-label="Meal for ${uiEsc(c.f.name)}">${MEALS.filter(([k])=>k!=='other').map(([k,l])=>`<option value="${k}"${k==='lunch'?' selected':''}>${l}</option>`).join('')}</select></label><button class="go-cmp sugg-add" type="button" data-i="${i}">Add ${c.serve} g</button><button class="linkish" type="button" data-skip-food="${i}">Not for me</button></div></article>`;
 };
 return `<section class="next-step"><div class="next-step-heading"><div><h2>Make your next meal count</h2><p>${introduction}</p></div></div>${controls}${card(candidates[0],0)}${candidates.length>1?`<details class="other-suggestions"><summary>See other options</summary>${candidates.slice(1).map((c,i)=>card(c,i+1)).join('')}</details>`:''}${notes}</section>`;
}

function uiAccountTabs(account) {
 const blocks=[...account.querySelectorAll(':scope > .pick-block')];
 const nav=document.createElement('div');nav.className='account-section-tabs';nav.setAttribute('role','group');nav.setAttribute('aria-label','Account sections');
 nav.innerHTML='<button type="button" aria-pressed="true">Nutrition targets</button><button type="button" aria-pressed="false">Account & security</button>';
 account.querySelector('.sheet-top').after(nav);
 const apply=index=>{blocks.forEach((b,i)=>b.hidden=index===0?i!==0:i===0);nav.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));};
 nav.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>apply(i));apply(0);
}
