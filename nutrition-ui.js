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
  function row(d) {
    const t=total(d.key);
    return `<details class="nutrition-row" data-nutrient="${d.key}"><summary><span>${esc(d.label)}</span><span class="nutrition-amount">${display(t,d.unit)}${t.missing&&t.value!==null?'<small>Partial</small>':''}</span></summary>
      <p>Measured or reported amounts available for ${t.known} of ${day.length} logged entries.${t.trace?' '+t.trace+' report a trace amount, not included in the numeric total.':''}${t.missing?' Missing data for: '+t.missingFoods.map(esc).join('; ')+'.':''}</p></details>`;
  }
  const sources=day.map(e=>foodByName(e.name)).filter((f,i,a)=>a.findIndex(x=>x.key===f.key)===i);
  return `<section class="nutrition-dashboard" aria-labelledby="nutritionTitle">
    <h2 class="v2-sec" id="nutritionTitle">Your nutrition · day total</h2>
    <p class="v2-note">Amounts from the foods and portions you logged. <b>Partial</b> means some foods have no value recorded; <b>Unknown</b> is not zero. These totals are not personalised targets or a deficiency assessment.</p>
    <div class="nutrition-macros">${macros.map(([key,label,unit])=>{
      const t=total(key);return `<div class="v2-stat"><div class="k">${label}</div><div class="v" data-macro="${key}">${display(t,unit)}</div>${t.missing?`<small>${t.known||t.trace?'Partial · ':''}${t.missing} entr${t.missing===1?'y':'ies'} missing data</small>`:''}</div>`;
    }).join('')}</div>
    <div class="nutrition-panels">${['Vitamins','Minerals','More nutrition'].map(group=>`<details class="nutrition-panel" ${group!=='More nutrition'?'open':''}>
      <summary>${group==='More nutrition'?'Carbohydrates, sugars & fats':group}</summary>
      ${Nutrition.definitions.filter(d=>d.group===group&&(!d.basis||datasets.has(d.basis))).map(row).join('')}
    </details>`).join('')}</div>
    <details class="nutrition-sources"><summary>Food sources and measurement notes</summary>
      <p>All values are scaled from 100 g of edible food. USDA carbohydrate by difference and CoFID available carbohydrate (monosaccharide equivalents) are shown separately, as are sugars and the different vitamin A, D and E definitions. A trace amount is preserved as trace, never treated as a measured zero. Vitamin K here is K1; folate is total folate, not dietary folate equivalents.</p>
      <ul>${sources.map(f=>{const s=f.nutritionSource;return `<li><b>${esc(f.name)}</b>: ${s?`<a href="${s.dataset==='USDA'?'https://fdc.nal.usda.gov/food-details/'+encodeURIComponent(s.id)+'/nutrients':'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid'}" target="_blank" rel="noopener">${s.dataset==='USDA'?'USDA SR Legacy':'UK CoFID 2021'} · ${esc(s.id)}</a> — ${esc(s.name)}`:'No micronutrient record matched; existing protein and macro estimates only.'}</li>`;}).join('')}</ul>
      <p>USDA data are public domain. UK data: contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener">Open Government Licence v3.0</a>, © Crown copyright 2021. Alcoholic drinks measured per 100 ml in CoFID are excluded from this gram-based diary.</p>
    </details>
  </section>`;
}
