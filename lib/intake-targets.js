/* Adult starting estimates. Sources and limitations: docs/intake-targets.md. */
const IntakeTargets = (() => {
  const activities = [
    { id: 'inactive', label: 'Mostly everyday activity', detail: 'Usual daily tasks and some walking; little extra exercise.', protein: 0.8 },
    { id: 'low', label: 'A little extra activity', detail: 'Daily tasks plus roughly an hour of brisk walking, or similar activity.', protein: 1.2 },
    { id: 'active', label: 'Active most days', detail: 'A physically active routine with substantial walking, exercise or sport most days.', protein: 1.6 },
    { id: 'very', label: 'Very active', detail: 'Long periods of strenuous exercise or demanding physical work most days.', protein: 1.8 }
  ];
  // 2023 DRI estimated energy requirement: intercept + age*y + height*cm + weight*kg.
  const energy = {
    male: [[753.07, -10.83, 6.50, 14.10], [581.47, -10.83, 8.30, 14.94], [1004.82, -10.83, 6.52, 15.91], [-517.88, -10.83, 15.61, 19.11]],
    female: [[584.90, -7.01, 5.72, 11.71], [575.77, -7.01, 6.60, 12.14], [710.25, -7.01, 6.54, 12.34], [511.83, -7.01, 9.07, 12.56]]
  };
  const numberIn = (value, min, max) => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
  function normalise(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return {
      activity: activities.some(a => a.id === value.activity) ? value.activity : '',
      age: numberIn(value.age, 1, 120) ? Number(value.age) : '',
      height: numberIn(value.height, 100, 250) ? Number(value.height) : '',
      sex: ['female', 'male'].includes(value.sex) ? value.sex : '',
      scope: value.scope === 'manual' ? 'manual' : 'adult',
      calorieMode: value.calorieMode === 'manual' ? 'manual' : 'auto',
      customCalories: numberIn(value.customCalories, 500, 10000) ? Number(value.customCalories) : ''
    };
  }
  function estimate(weight, raw = {}) {
    const p = normalise(raw);
    const index = activities.findIndex(a => a.id === p.activity);
    const adult = p.scope === 'adult' && (p.age === '' || p.age >= 19);
    const validWeight = numberIn(weight, 30, 200);
    const protein = validWeight && adult && index >= 0 ? Math.round(Number(weight) * activities[index].protein) : null;
    let calories = null;
    if (validWeight && adult && index >= 0 && p.age >= 19 && p.height && p.sex) {
      const [base, age, height, kg] = energy[p.sex][index];
      calories = Math.round((base + age * p.age + height * p.height + kg * Number(weight)) / 50) * 50;
    }
    return { protein, calories, proteinFactor: protein == null ? null : activities[index].protein };
  }
  function calorieTarget(weight, raw) {
    const p = normalise(raw);
    return p.calorieMode === 'manual' ? (p.customCalories || null) : estimate(weight, p).calories;
  }
  return { activities, normalise, estimate, calorieTarget };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = IntakeTargets;
