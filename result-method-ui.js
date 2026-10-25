// Explanations use the same reference constants and food eligibility as the diary.
// They never change stored targets or food entries.
function resultMethodData(entries, weight, proteinTarget) {
  const foods = entries.map(entry => ({entry, food:foodByName(entry.name, entry)}));
  const included = foods.filter(({food}) => Nutrition.hasAminoAcids(food));
  const baselineProtein = weight * ATLAS.protein_rda_g_per_kg;
  const scale = proteinTarget / baselineProtein;
  const profileProtein = included.reduce((sum, {entry,food}) => sum + food.protein_g_per_100g * entry.g / 100, 0);
  const rows = SCORE_ROWS.map(([id,label,keys]) => {
    const got = included.reduce((sum,{entry,food}) => sum + keys.reduce((n,k)=>n+(food.aa[k]||0),0)*entry.g/100*1000,0);
    const baseline = WHO_KG[id] * weight;
    const target = baseline * scale;
    const composition = profileProtein > 0 ? got / profileProtein : null;
    return {id,label,got,baseline,target,percent:got/target*100,reference:WHO[id],composition,score:composition == null ? null : composition/WHO[id]*100};
  });
  return {foods,included,missing:foods.filter(({food})=>!Nutrition.hasAminoAcids(food)),baselineProtein,scale,profileProtein,rows};
}
function resultNumber(value, digits=1) {
  return value.toLocaleString('en-GB',{maximumFractionDigits:digits});
}
function uiResultMethod(entries, weight, proteinTarget, kind='daily', saved=false) {
  const data=resultMethodData(entries,weight,proteinTarget),composition=kind==='composition';
  const fmt=resultNumber;
  const coverage=`${data.included.length} of ${data.foods.length} logged food entries have an amino acid profile`;
  const example=data.rows.find(r=>r.id==='leucine')||data.rows[0];
  const rows=data.rows.map(r=>`<div class="result-calculation-row"><strong>${uiEsc(r.label)}</strong>${composition
    ? `<span>${r.composition==null?'Unavailable':fmt(r.composition)+' mg/g protein'}<small>Reference pattern: ${fmt(r.reference)} mg/g protein</small></span><b>${r.score==null?'Unavailable':fmt(r.score,0)+'%'}</b>`
    : `<span>${data.included.length?fmt(r.got)+' mg logged':'Amount unavailable'}<small>Adult reference: ${fmt(r.baseline)} mg · Scaled target: ${fmt(r.target)} mg</small></span><b>${data.included.length?fmt(r.percent,0)+'%':'Unavailable'}</b>`}</div>`).join('');
  return `<details class="result-method" data-diary-section="${composition?'composition-method':'amino-method'}"><summary>How is this calculated?</summary><div class="result-method-body">
    <p class="result-method-intro">${composition?'This describes the amino acid proportions in your logged protein. It does not measure how much of your daily target you have eaten.':'This compares the amino acids in your logged portions with your selected daily targets. It does not measure absorption or diagnose a deficiency.'}</p>
    ${composition ? `<div class="result-formula"><span>COMPOSITION SCORE</span><strong>Lowest amino acid ratio × 100</strong><p>For each essential amino acid: mg per gram of protein ÷ the WHO/FAO/UNU adult reference pattern (mg/g protein). The lowest ratio sets the score. 100% means the included protein meets that composition pattern.</p></div>`
    : `<div class="result-reference-grid"><div><span>ADULT REFERENCE</span><strong>${fmt(weight)} kg body weight</strong><p>WHO/FAO/UNU 2007 reference in mg/kg/day × body weight.</p></div><div><span>YOUR SCALED TARGET</span><strong>Adult reference × ${fmt(data.scale,2)}</strong><p>${fmt(proteinTarget)} g protein goal ÷ ${fmt(data.baselineProtein)} g protein baseline (${ATLAS.protein_rda_g_per_kg} g/kg).</p></div></div><p><b>This scaling is an Aminodata assumption.</b> It is not a separate published amino acid requirement for your protein goal. Changing your protein goal also changes these amino acid targets.${saved?' This day uses its saved body weight and protein goal.':''}</p><div class="result-formula"><span>DAILY INTAKE</span><strong>Logged amount ÷ scaled target × 100</strong><p>Each food contributes its amino acid amount per 100 g × the grams logged ÷ 100. We add those contributions before calculating the percentage.</p></div>`}
    ${data.included.length && (!composition || example.composition!=null) ? `<p class="result-worked"><b>Leucine in this ${entries.length===1?'portion':'day'}:</b> ${composition?`${fmt(example.got)} mg ÷ ${fmt(data.profileProtein)} g protein = ${fmt(example.composition)} mg/g. Compared with ${fmt(example.reference)} mg/g, that is ${fmt(example.score,0)}%.`:`${fmt(example.got)} mg logged ÷ ${fmt(example.target)} mg target × 100 = ${fmt(example.percent,0)}%.`}</p>`:''}
    <p class="result-coverage"><b>${coverage}.</b> ${data.missing.length?'These results cover only the entries with profiles. Missing amounts are unknown, not zero; a low recorded amount may reflect missing data.':'Amounts describe the recorded food composition; actual foods and portion estimates can vary.'}</p>
    <details class="result-method-more"><summary>See the amino acid breakdown</summary><div class="result-calculations">${rows}</div><p>Methionine + cysteine and phenylalanine + tyrosine are assessed as pairs. Non-essential amino acids are shown as amounts without a daily target. Displayed values are rounded; calculations use full precision.</p></details>
    <details class="result-method-more"><summary>Foods included in this calculation</summary><ul class="result-foods">${data.foods.map(({entry,food})=>{const source=food?.source||'No source listed',url=sourceURL(source);return `<li><strong>${uiEsc(entry.name)}</strong><span>${fmt(entry.g)} ${uiEsc(quantityUnit(food))} · ${Nutrition.hasAminoAcids(food)?'Included in amino acid totals':'Amino acid profile unavailable — excluded'}</span><small>${url?`<a href="${uiEsc(url)}" target="_blank" rel="noopener">${uiEsc(source)}</a>`:uiEsc(source)}</small></li>`;}).join('')}</ul></details>
    <p class="result-method-limit"><b>Not adjusted for digestibility.</b> This is not DIAAS or PDCAAS, and it does not establish a clinical deficiency. No measured confidence interval is available for these totals; there is no automatic 10% safety margin.</p>
    <a class="result-reference-link" href="https://iris.who.int/handle/10665/43411" target="_blank" rel="noopener">Reference: WHO/FAO/UNU, Protein and amino acid requirements in human nutrition (2007)</a>
  </div></details>`;
}
function uiProteinMethod(day, weight, target, saved=false) {
  return `<details class="result-method result-method-compact" data-diary-section="protein-method"><summary>How is protein progress calculated?</summary><div class="result-method-body"><p>We add each food’s recorded protein per 100 g × the grams logged ÷ 100, then compare that total with your <b>${resultNumber(target)} g daily protein goal</b>. Protein comes from the food’s protein value, not from adding its amino acid values.</p><p>${saved?'This day uses its saved':'Your current'} body weight is ${resultNumber(weight)} kg. The protein baseline used for amino acid target scaling is ${ATLAS.protein_rda_g_per_kg} g/kg (${resultNumber(weight*ATLAS.protein_rda_g_per_kg)} g/day). Your protein goal may be entered by you or suggested from your account settings.</p><p>Foods with unavailable protein contribute no numeric amount to the recorded total; they are unknown, not zero. Reaching your protein goal does not establish that every nutrient target is met.</p></div></details>`;
}
