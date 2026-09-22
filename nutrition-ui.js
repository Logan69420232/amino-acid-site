function nutritionDashboard(day) {
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const datasets = new Set(day.map(e=>foodByName(e.name)?.nutritionSource?.dataset).filter(Boolean));
  const total = key => Nutrition.total(day,foodByName,key);
  const macros = [['kcal','Calories','kcal'],['protein','Protein','g']];
  if(datasets.has('USDA') || !datasets.has('CoFID')) macros.push(['carb','Carbs · USDA total','g']);
  if(datasets.has('CoFID')) macros.push(['carb_uk','Carbs · UK available','g']);
  macros.push(['fat','Fat','g'],['fibre','Fibre','g']);
  function display(t, unit) {
    if(t.value===null)return t.trace ? 'Trace'+(t.missing?' + unknown':'') : 'Unknown';
    return Nutrition.format(t.value)+' '+unit+(t.trace?' + trace':'');
  }
  function meter(dv) {
    if(dv.percent===null)return '';
    return `<span class="nutrition-meter${dv.partial?' is-partial':''}" aria-hidden="true"><span style="width:${Math.min(100,Math.max(0,dv.percent)).toFixed(2)}%"></span></span>`;
  }
  const lipidDepth={mono_fat:1,poly_fat:1,omega_3:2,omega_6:2,ala:3,dha:3,epa:3,dpa:3,aa_fat:3,la:3,saturated_fat:1,trans_fat:1};
  function row(d) {
    const t=total(d.key), dv=Nutrition.dailyValue(d.key,t);
    return `<details class="nutrition-row" data-nutrient="${d.key}"><summary><span class="nutrition-label" style="--nutrient-depth:${lipidDepth[d.key]||0}">${esc(d.label)}${meter(dv)}</span><span class="nutrition-amount">${display(t,d.unit)}${(t.missing||t.derived)&&t.value!==null?'<small>Partial amount</small>':''}<span class="nutrition-dv" data-dv="${d.key}">${esc(dv.label)}${dv.percent!==null&&dv.partial?'<small>Partial reference %</small>':''}</span></span></summary>
      <p>${dv.reference?'100% DV = '+Nutrition.format(dv.reference)+' '+esc(d.unit)+'. ':''}${esc(dv.reason)}${['sodium','saturated_fat','cholesterol'].includes(d.key)?' This is a limit reference, not a goal to fill.':''}</p>
      ${t.derived?`<p>${t.derived} entr${t.derived===1?'y uses':'ies use'} a partial component sum because no omega total was reported: ${d.key==='omega_3'?'ALA + DHA + EPA + DPA':'LA + arachidonic acid'}, where known. Other or unidentified fatty acids may be missing. A reported total takes priority and is never added to its components.</p>`:''}
      <p>Measured or reported amounts available for ${t.known} of ${day.length} logged entries.${t.trace?' '+t.trace+' report a trace amount, not included in the numeric total.':''}${t.missing?' Missing data for: '+t.missingFoods.map(esc).join('; ')+'.':''}</p></details>`;
  }
  const sources=day.map(e=>foodByName(e.name)).filter((f,i,a)=>a.findIndex(x=>x.key===f.key)===i);
  return `<section class="nutrition-dashboard" aria-labelledby="nutritionTitle">
    <h2 class="v2-sec" id="nutritionTitle">Your nutrition · day total</h2>
    <p class="v2-note">Amounts from the foods and portions you logged. <b>Partial</b> means some foods have no value recorded; <b>Unknown</b> is not zero. These totals are not personalised targets or a deficiency assessment.</p>
    <p class="v2-note nutrition-dv-note"><b>%DV · US FDA Daily Values</b> (adults and ages 4+). A general label reference, not your personal requirement or the UK NRV. 100% is not a safety ceiling, and higher is not always better. Partial percentages use only available amounts. <a href="${Nutrition.dailyValueSource}" target="_blank" rel="noopener">Reference values</a> · tap a nutrient for details.</p>
    <div class="nutrition-macros">${macros.map(([key,label,unit])=>{
      const t=total(key),dv=Nutrition.dailyValue(key,t);return `<div class="v2-stat"><div class="k">${label}</div><div class="v" data-macro="${key}">${display(t,unit)}</div>${dv.reference?`<span class="nutrition-dv">${esc(dv.label)}${dv.percent!==null&&dv.partial?' · partial':''}</span>${meter(dv)}`:''}${t.missing?`<small>${t.known||t.trace?'Partial · ':''}${t.missing} entr${t.missing===1?'y':'ies'} missing data</small>`:''}</div>`;
    }).join('')}</div>
    <div class="nutrition-panels">${['Vitamins','Minerals','Lipids','More nutrition'].map(group=>`<details class="nutrition-panel${group==='Lipids'?' nutrition-lipids':''}" ${group!=='More nutrition'?'open':''}>
      <summary>${group==='More nutrition'?'Carbohydrates, sugars & fibre':group}</summary>
      ${group==='Lipids'?'<p class="nutrition-panel-note">Daily amounts · indented rows are parts of the totals above, not extra fat to add. Omega totals may be partial; tap a row for coverage.</p>':''}
      ${Nutrition.definitions.filter(d=>d.group===group&&(!d.basis||datasets.has(d.basis))).map(row).join('')}
    </details>`).join('')}</div>
    <details class="nutrition-sources"><summary>Food sources and measurement notes</summary>
      <p>All values are scaled from 100 g of edible food. USDA carbohydrate by difference and CoFID available carbohydrate (monosaccharide equivalents) are shown separately, as are sugars and the different vitamin A, D and E definitions. A trace amount is preserved as trace, never treated as a measured zero. Vitamin K here is K1; folate is total folate, not dietary folate equivalents.</p>
      <p>DV bars fill to 100%; the percentage text keeps values above 100%. Striped bars indicate partial coverage. No bar is shown without a numeric DV. Fatty-acid subtypes use specifically identified forms; undifferentiated 18:2, 18:3 and 20:4 are not relabelled as LA, ALA or arachidonic acid. Phytosterols use the reported total only.</p>
      <ul>${sources.map(f=>{const s=f.nutritionSource;return `<li><b>${esc(f.name)}</b>: ${s?`<a href="${s.dataset==='USDA'?'https://fdc.nal.usda.gov/food-details/'+encodeURIComponent(s.id)+'/nutrients':'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid'}" target="_blank" rel="noopener">${s.dataset==='USDA'?'USDA SR Legacy':'UK CoFID 2021'} · ${esc(s.id)}</a> — ${esc(s.name)}`:'No micronutrient record matched; existing protein and macro estimates only.'}</li>`;}).join('')}</ul>
      <p>USDA data are public domain. UK data: contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener">Open Government Licence v3.0</a>, © Crown copyright 2021. Alcoholic drinks measured per 100 ml in CoFID are excluded from this gram-based diary.</p>
    </details>
  </section>`;
}
