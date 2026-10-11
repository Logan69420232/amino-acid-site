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
  return `<div class="daily-overview"><div class="daily-overview-head"><span>YOUR DAY, AT A GLANCE</span><span data-save-state data-state="${uiSaveState.kind}" role="status">${uiEsc(uiSaveState.text)}</span></div><div class="daily-overview-grid"><div class="daily-protein"><span>Protein</span><strong>${totals.prot.toFixed(0)} <small>/ ${target.toFixed(0)} g</small></strong><div class="daily-track"><span style="width:${Math.min(100,totals.prot/target*100)}%"></span></div><span class="daily-remaining">${left?left.toFixed(0)+' g to your daily goal':'Daily protein goal reached ✓'}</span></div><div class="daily-other"><div><span>Calories</span><strong>${Math.round(totals.kcal).toLocaleString()} <small>kcal</small></strong></div><div><span>Carbs</span><strong>${Math.round(totals.carb)} <small>g</small></strong></div><div><span>Fat</span><strong>${Math.round(totals.fat)} <small>g</small></strong></div></div></div><div class="daily-overview-foot"><span>${totals.miss?'Some foods have incomplete calorie data.':'Totals from your logged food.'}</span><button type="button" class="linkish" data-edit-targets>Edit targets</button></div></div>`;
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
function uiSuggestions(candidates,gaps,protGap,hasAA=true) {
 if(!candidates.length)return `<div class="next-step"><h2>${protGap>0?'Keep building your day':gaps.length||!hasAA?'Explore your amino acid details':'Your protein goal is covered'}</h2><p>${protGap>0?'Add your next meal whenever you’re ready.':'Your logged protein reaches today’s goal. Open the details below to check amino acid coverage.'}</p></div>`;
 const card=(c,i)=>`<article class="next-step-food"><div><span class="next-step-tag">${i?'ANOTHER OPTION':'AN OPTION FOR YOUR NEXT MEAL'}</span><h3>${uiEsc(uiFoodName(c.f.name))}</h3><p><b>${c.serve} g</b> adds <b>${c.protAdd.toFixed(0)} g protein</b>${c.f.kcal!=null?' · '+Math.round(c.f.kcal*c.serve/100)+' kcal':''}</p><details><summary>Why this food?</summary><p>${c.closes.length?'This portion covers '+c.closes.length+' of your remaining essential amino acid targets.':'A source of protein to help you work towards your daily goal.'} Based on the food entries available.</p></details></div><div class="next-step-controls"><label>Add to<select data-suggestion-meal="${i}" aria-label="Meal for ${uiEsc(c.f.name)}">${MEALS.filter(([k])=>k!=='other').map(([k,l])=>`<option value="${k}"${k==='lunch'?' selected':''}>${l}</option>`).join('')}</select></label><button class="go-cmp sugg-add" type="button" data-i="${i}">Add ${c.serve} g</button><button class="linkish" type="button" data-skip-food="${i}">Not for me</button></div></article>`;
 return `<section class="next-step"><div class="next-step-heading"><div><h2>A little help with your next meal</h2><p>${protGap>0?Math.round(protGap)+' g protein remaining today.':'Your protein goal is covered.'} ${gaps.length?'Explore an option to improve your amino acid coverage.':''}</p></div></div>${card(candidates[0],0)}${candidates.length>1?`<details class="other-suggestions"><summary>See other options</summary>${candidates.slice(1).map((c,i)=>card(c,i+1)).join('')}</details>`:''}</section>`;
}
function uiAccountTabs(account) {
 const blocks=[...account.querySelectorAll(':scope > .pick-block')];
 const nav=document.createElement('div');nav.className='account-section-tabs';nav.setAttribute('role','group');nav.setAttribute('aria-label','Account sections');
 nav.innerHTML='<button type="button" aria-pressed="true">Nutrition targets</button><button type="button" aria-pressed="false">Account & security</button>';
 account.querySelector('.sheet-top').after(nav);
 const apply=index=>{blocks.forEach((b,i)=>b.hidden=index===0?i!==0:i===0);nav.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));};
 nav.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>apply(i));apply(0);
}
