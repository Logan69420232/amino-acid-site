/* Inlined by build.js into the existing page scope. */
function getIntakeProfile() {
  try { return IntakeTargets.normalise(JSON.parse(store.getItem('aa_intake') || '{}')); }
  catch { return IntakeTargets.normalise(); }
}
function intakeFields(prefix) {
  const p = getIntakeProfile();
  return `<section class="intake-setup" aria-labelledby="${prefix}IntakeTitle">
    <h3 id="${prefix}IntakeTitle">Match your targets to your day</h3>
    <p class="pb-sub">Think about your usual week, including work, walking and exercise.</p>
    <label class="intake-label" for="${prefix}Activity">How physically active is a typical day?</label>
    <select id="${prefix}Activity" aria-describedby="${prefix}ActivityHelp"><option value="">Choose your activity level</option>${IntakeTargets.activities.map(a => `<option value="${a.id}"${p.activity === a.id ? ' selected' : ''}>${a.label}</option>`).join('')}</select>
    <p class="intake-help" id="${prefix}ActivityHelp"></p>
    <label class="intake-label" for="${prefix}Scope">How would you like to set your targets?</label>
    <select id="${prefix}Scope"><option value="adult"${p.scope === 'adult' ? ' selected' : ''}>Use general adult estimates (19+)</option><option value="manual"${p.scope === 'manual' ? ' selected' : ''}>Use my own targets</option></select>
    <p class="intake-help">For pregnancy, breastfeeding, under-19s or individual medical needs, use targets agreed with your clinician or dietitian.</p>
    <details class="intake-details"${p.age || p.height || p.sex || p.customCalories ? ' open' : ''}>
      <summary>Add a calorie estimate (optional)</summary>
      <p class="intake-help">An estimate for maintaining your weight. Age, height and the equation category improve it; activity alone is not enough.</p>
      <div class="intake-grid">
        <label>Age (years)<input id="${prefix}Age" type="number" min="1" max="120" step="1" value="${p.age}" inputmode="numeric"></label>
        <label>Height (cm)<input id="${prefix}Height" type="number" min="100" max="250" step="0.1" value="${p.height}" inputmode="decimal"></label>
        <label>Sex used by the calorie equation<select id="${prefix}Sex"><option value="">Prefer not to say / skip</option><option value="female"${p.sex === 'female' ? ' selected' : ''}>Female equation</option><option value="male"${p.sex === 'male' ? ' selected' : ''}>Male equation</option></select></label>
      </div>
      <div class="intake-grid">
        <label>Calorie target<select id="${prefix}CalorieMode"><option value="auto"${p.calorieMode === 'auto' ? ' selected' : ''}>Use estimate</option><option value="manual"${p.calorieMode === 'manual' ? ' selected' : ''}>Set my own</option></select></label>
        <label id="${prefix}CaloriesWrap">My target (kcal/day)<input id="${prefix}Calories" type="number" min="500" max="10000" step="1" value="${p.customCalories}" inputmode="numeric"></label>
      </div>
    </details>
    <div class="intake-preview" id="${prefix}IntakePreview" role="status" aria-live="polite"></div>
    <p class="intake-help">Starting estimates, not exact requirements. You can change them in your account as your routine changes. <a href="#" id="${prefix}IntakeSources">How we estimate these</a></p>
    <div class="intake-help" id="${prefix}Sources" hidden>Calories use the <a href="https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html" target="_blank" rel="noopener">2023 DRI adult equations</a>, rounded to 50 kcal. Protein starting points are 0.8, 1.2, 1.6 and 1.8 g/kg for the four activity levels. This mapping is our practical default, informed by the adult RDA and <a href="https://southeast.acsm.org/wp-content/uploads/2025/01/rodriguez_seacsm-2024-slidedeck_pdf.pdf" target="_blank" rel="noopener">sports-nutrition guidance</a>; training type, age and personal needs also matter.</div>
  </section>`;
}
function wireIntakeFields(prefix) {
  const el = key => sheet.querySelector('#' + prefix + key);
  const read = () => ({activity:el('Activity').value, age:el('Age').value, height:el('Height').value, sex:el('Sex').value, scope:el('Scope').value, calorieMode:el('CalorieMode').value, customCalories:el('Calories').value});
  const kg = () => +el('W').value / (el('U').value === 'lb' ? LB_PER_KG : 1);
  function update() {
    const p = read(), suggestion = IntakeTargets.estimate(kg(), p);
    const activity = IntakeTargets.activities.find(a => a.id === p.activity);
    el('ActivityHelp').textContent = activity ? activity.detail : 'Choose the closest match. You can update this later.';
    el('CaloriesWrap').hidden = p.calorieMode !== 'manual';
    const own = +el('T').value;
    el('T').placeholder = suggestion.protein == null ? 'auto' : String(suggestion.protein);
    const protein = own > 0 ? `<b>${Math.round(own)} g protein/day</b> · your own target`
      : suggestion.protein != null ? `<b>${suggestion.protein} g protein/day</b> · ${suggestion.proteinFactor} g per kg`
      : p.scope === 'manual' || (p.age && +p.age < 19) ? 'Enter your own protein target above.' : 'Choose an activity level to see a protein suggestion.';
    const calories = IntakeTargets.calorieTarget(kg(), p);
    el('IntakePreview').innerHTML = `<p>${protein}</p><p>${calories ? `<b>${calories.toLocaleString()} kcal/day</b> · ${p.calorieMode === 'manual' ? 'your own target' : 'estimated maintenance'}` : 'Calories: add the optional details, or set your own target.'}</p>`;
  }
  const fields = ['Activity','Age','Height','Sex','Scope','CalorieMode','Calories','W','T'];
  fields.forEach(key => el(key).addEventListener('input', update));
  let lastUnit = el('U').value;
  el('U').addEventListener('change', () => {
    const raw = +el('W').value;
    if (raw > 0 && lastUnit !== el('U').value) el('W').value = Math.round((el('U').value === 'lb' ? raw * LB_PER_KG : raw / LB_PER_KG) * 10) / 10;
    lastUnit = el('U').value;
    el('W').min = lastUnit === 'lb' ? '66' : '30'; el('W').max = lastUnit === 'lb' ? '440' : '200';
    update();
  });
  el('IntakeSources').addEventListener('click', e => { e.preventDefault(); el('Sources').hidden = !el('Sources').hidden; });
  update();
  return () => {
    const p = read();
    const inputs = ['W','T','Age','Height'].concat(p.calorieMode === 'manual' ? ['Calories'] : []);
    for (const key of inputs) {
      const input = el(key);
      if ((key === 'W' && !input.value) || !input.checkValidity()) { input.reportValidity(); input.focus(); return false; }
    }
    if ((p.scope === 'manual' || (p.age && +p.age < 19)) && !(+el('T').value > 0)) {
      el('IntakePreview').textContent = 'Enter a protein target agreed for your needs, or choose general adult estimates if those apply to you.';
      el('T').focus(); return false;
    }
    if (p.scope === 'adult' && !(p.age && +p.age < 19) && !p.activity && !el('T').value) {
      el('IntakePreview').textContent = 'Choose your activity level, enter your own protein target, or skip for now.'; el('Activity').focus(); return false;
    }
    if (p.calorieMode === 'manual' && !el('Calories').value) { el('Calories').focus(); el('IntakePreview').textContent = 'Enter your calorie target, or switch to Use estimate.'; return false; }
    store.setItem('aa_intake', JSON.stringify(IntakeTargets.normalise(p)));
    store.setItem('aa_intake_completed', '1');
    return true;
  };
}
