/* Shared definitions and portion arithmetic. Values are per 100 g edible food.
   Different analytical definitions stay separate rather than being silently summed. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Nutrition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const definitions = [
    ['fibre','Fibre','g','More nutrition',1079,'G'],
    ['sugars','Total sugars (USDA)','g','More nutrition',2000,'G','USDA'],
    ['sugars_uk','Total sugars (CoFID equivalents)','g','More nutrition',null,null,'CoFID'],
    ['carb','Carbohydrate (USDA total)','g','More nutrition',null,null,'USDA'],
    ['carb_uk','Carbohydrate (CoFID available)','g','More nutrition',null,null,'CoFID'],
    ['saturated_fat','Saturated fat','g','More nutrition',1258,'G'],
    ['mono_fat','Monounsaturated fat','g','More nutrition',1292,'G'],
    ['poly_fat','Polyunsaturated fat','g','More nutrition',1293,'G'],
    ['cholesterol','Cholesterol','mg','More nutrition',1253,'MG'],
    ['vitamin_a_rae','Vitamin A (RAE)','µg','Vitamins',1106,'UG','USDA'],
    ['vitamin_a_re','Vitamin A (RE)','µg','Vitamins',null,null,'CoFID'],
    ['vitamin_c','Vitamin C','mg','Vitamins',1162,'MG'],
    ['vitamin_d','Vitamin D (D2 + D3)','µg','Vitamins',1114,'UG','USDA'],
    ['vitamin_d_uk','Vitamin D (CoFID total)','µg','Vitamins',null,null,'CoFID'],
    ['vitamin_e','Vitamin E (alpha-tocopherol)','mg','Vitamins',1109,'MG','USDA'],
    ['vitamin_e_uk','Vitamin E (CoFID total)','mg','Vitamins',null,null,'CoFID'],
    ['vitamin_k','Vitamin K1','µg','Vitamins',1185,'UG'],
    ['thiamin','B1 · Thiamin','mg','Vitamins',1165,'MG'],
    ['riboflavin','B2 · Riboflavin','mg','Vitamins',1166,'MG'],
    ['niacin','B3 · Niacin','mg','Vitamins',1167,'MG'],
    ['pantothenic_acid','B5 · Pantothenic acid','mg','Vitamins',1170,'MG'],
    ['vitamin_b6','Vitamin B6','mg','Vitamins',1175,'MG'],
    ['biotin','B7 · Biotin','µg','Vitamins',1176,'UG'],
    ['folate','Folate (total)','µg','Vitamins',1177,'UG'],
    ['vitamin_b12','Vitamin B12','µg','Vitamins',1178,'UG'],
    ['choline','Choline','mg','Vitamins',1180,'MG'],
    ['calcium','Calcium','mg','Minerals',1087,'MG'],
    ['iron','Iron','mg','Minerals',1089,'MG'],
    ['magnesium','Magnesium','mg','Minerals',1090,'MG'],
    ['phosphorus','Phosphorus','mg','Minerals',1091,'MG'],
    ['potassium','Potassium','mg','Minerals',1092,'MG'],
    ['sodium','Sodium','mg','Minerals',1093,'MG'],
    ['zinc','Zinc','mg','Minerals',1095,'MG'],
    ['copper','Copper','mg','Minerals',1098,'MG'],
    ['manganese','Manganese','mg','Minerals',1101,'MG'],
    ['selenium','Selenium','µg','Minerals',1103,'UG'],
    ['iodine','Iodine','µg','Minerals',1100,'UG'],
    ['chloride','Chloride','mg','Minerals',null,null,'CoFID']
  ].map(([key,label,unit,group,usdaId,usdaUnit,basis])=>({key,label,unit,group,usdaId,usdaUnit,basis}));
  function amount(value) {
    if (typeof value === 'string' && /^(tr|trace)$/.test(value.trim().toLowerCase())) return 'trace';
    if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function total(entries, lookup, key) {
    let sum = 0, known = 0, missing = 0, trace = 0;
    const missingFoods = [];
    for (const e of entries) {
      if (!Number.isFinite(+e.g) || +e.g <= 0) continue;
      const f = lookup(e.name);
      const raw = f && f.nutrients ? f.nutrients[key] : null;
      const value = raw === 'trace' ? 'trace' : amount(raw);
      if (value === 'trace') { trace++; continue; }
      if (value === null) { missing++; missingFoods.push(e.name); continue; }
      sum += value * (+e.g / 100); known++;
    }
    return { value: known ? sum : null, known, missing, trace, missingFoods };
  }
  function format(value) {
    if (value == null) return 'Unknown';
    if (value > 0 && value < 0.01) return '<0.01';
    return value.toLocaleString('en-GB', {maximumFractionDigits: value < 10 ? 2 : 1});
  }
  function hasAminoAcids(f) {
    return !!(f && f.aaAvailable !== false && f.aa && Object.keys(f.aa).length === 18);
  }
  return {definitions, amount, total, format, hasAminoAcids};
});
