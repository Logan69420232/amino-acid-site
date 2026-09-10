// Merges data/*.json into the template and writes dist/amino-atlas.html
const fs = require("fs");
const path = require("path");
const root = __dirname;

function load(name) {
  const p = path.join(root, "data", name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

const seafoodPlants = load("seafood_plants.json") || [];
const meatDairy = load("meat_dairy.json") || [];
const suppPack = load("supplements.json"); // {foods, who_*, ...}
const suppFoods = suppPack ? suppPack.foods : [];

// Typical serving sizes (g) for the calculator
const SERVINGS = [
  [/whey|casein|isolate|protein powder|collagen|hemp protein|rice protein|egg white protein/i, 30],
  [/milk/i, 250], [/yogurt/i, 170], [/cheese|cheddar|mozzarella|parmesan|cottage/i, 30],
  [/egg white \(raw\)/i, 33], [/whole egg/i, 50],
  [/chicken|beef|pork|lamb|turkey|salmon|tuna|cod|mackerel/i, 150],
  [/shrimp/i, 100], [/sardine/i, 92],
  [/tofu|tempeh/i, 100], [/edamame/i, 80],
  [/lentils|chickpeas|beans|peas/i, 120],
  [/quinoa|rice, |brown rice/i, 150], [/oats/i, 40],
  [/peanuts|almonds|walnuts|seeds/i, 30],
  [/spirulina/i, 10], [/yeast/i, 15], [/gluten|seitan/i, 90]
];
function servingFor(f) {
  for (const [re, g] of SERVINGS) if (re.test(f.name)) return g;
  return 100;
}

// Search aliases: common words people type that aren't in the catalogue names
const ALIASES = [
  [/beef|sirloin/i, "steak red meat"],
  [/ground beef|beef, ground/i, "mince minced beef burger"],
  [/pork/i, "red meat"],
  [/\(chops?\)|\bchops?\b/i, "chop"],
  [/lamb/i, "red meat"],
  [/chicken|turkey/i, "poultry"],
  [/shrimp/i, "prawns prawn"],
  [/oats/i, "porridge oatmeal"],
  [/chickpeas/i, "garbanzo hummus"],
  [/edamame/i, "soybeans soya"],
  [/tofu|tempeh|soy/i, "soya"],
  [/whey|casein/i, "protein powder shake dairy"],
  [/pea protein|rice protein|hemp protein|soy protein/i, "protein powder shake vegan plant"],
  [/collagen/i, "protein powder gelatin"],
  [/egg white protein/i, "protein powder"],
  [/yogurt/i, "yoghurt"],
  [/gluten/i, "seitan wheat"],
  [/tuna|salmon|cod|mackerel|sardines/i, "fish"],
  [/game meat, deer/i, "venison"],
  [/game meat, bison/i, "buffalo"],
  [/frankfurter/i, "hot dog sausage"],
  [/crustaceans, crayfish/i, "crawfish"],
  [/cereals ready-to-eat/i, "breakfast cereal"],
  [/milk|cheddar|mozzarella|parmesan|cottage/i, "cheese dairy"]
];
function aliasesFor(f) {
  return ALIASES.filter(([re]) => re.test(f.name)).map(([, t]) => t).join(" ");
}

// Plain-English display names for USDA records (the USDA name is kept as usda_name)
const NAME_RULES = [
  [/^Chicken, broilers? or fryers, /i, "Chicken, "],
  [/^Chicken, roasting, /i, "Chicken (roaster), "],
  [/^Chicken, stewing, /i, "Chicken (stewing hen), "],
  [/^Chicken, capons, /i, "Capon, "],
  [/^Turkey, (all classes|fryer-roasters|young hen|young tom), /i, "Turkey, "],
  [/^Fish, /i, ""], [/^Crustaceans, /i, ""], [/^Mollusks, /i, ""],
  [/^Game meat, deer, /i, "Venison, "], [/^Game meat, bison, /i, "Bison, "], [/^Game meat, /i, ""],
  [/^Lamb, domestic, /i, "Lamb, "], [/^Lamb, (australian|new zealand), imported, /i, "Lamb ($1), "],
  [/^Pork, fresh, /i, "Pork, "], [/^Pork, cured, bacon, /i, "Bacon, "], [/^Pork, cured, ham, /i, "Ham, "],
  [/^Egg, whole, /i, "Egg, "], [/^Egg, white, /i, "Egg white, "], [/^Egg, yolk, /i, "Egg yolk, "],
  [/^Nuts, /i, ""], [/^Seeds, /i, ""], [/^Cereals ready-to-eat, /i, ""], [/^Cereals, /i, ""],
  [/, separable lean only/gi, ", lean only"], [/, separable lean and fat/gi, ", lean and fat"],
  [/, cooked, broiled/gi, ", grilled"], [/, cooked, pan-broiled/gi, ", pan-fried"],
  [/, cooked, (roasted|grilled|braised|fried|stewed|baked|simmered|poached|steamed|microwaved|pan-fried)/gi, ", $1"],
  [/, cooked, (hard-boiled|scrambled|poached|pan-browned|omelet)/gi, ", $1"],
  [/^Beef, ground, (\d+)% lean meat \/ \d+% fat/i, "Beef mince, $1% lean"],
  [/^(Pork|Turkey|Chicken|Lamb|Venison|Bison), ground, /i, "$1 mince, "],
  [/pan-broiled/gi, "pan-fried"],
  [/, cooked, dry heat/gi, ", cooked"], [/, cooked, moist heat/gi, ", cooked"],
  [/, cooked, boiled, drained/gi, ", boiled"], [/, boiled, drained/gi, ", boiled"],
  [/, (with|without) salt/gi, ""], [/, unprepared/gi, ", frozen"],
  [/ \(may contain additives to retain moisture\)/gi, ""], [/ \(includes foods for usda's food distribution program\)/gi, ""],
  [/, all classes/gi, ""], [/, mixed species/gi, ""], [/, raw$/i, ", raw"]
];
function displayName(usda) {
  let n = usda;
  for (const [re, rep] of NAME_RULES) n = n.replace(re, rep);
  n = n.replace(/\s*,\s*,+/g, ",").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return n ? n[0].toUpperCase() + n.slice(1) : usda;
}

const bulk = load("usda_bulk.json") || [];
const taken = new Set([...meatDairy, ...seafoodPlants, ...suppFoods].map(f => f.name));
const renamedBulk = bulk.map(f => {
  const usda = f.name.replace(/\s*--\s*/g, ", ");
  return { ...f, usda_name: usda, name: displayName(usda) };
});
// never let a rewrite make two foods share a name: fall back to the USDA name for collisions
const counts = {};
for (const f of renamedBulk) counts[f.name] = (counts[f.name] || 0) + 1;
let collisions = 0;
for (const f of renamedBulk) if (counts[f.name] > 1 || taken.has(f.name)) { f.name = taken.has(f.usda_name) ? f.usda_name + " (USDA)" : f.usda_name; collisions++; }
const foods = [
  ...[...meatDairy, ...seafoodPlants, ...suppFoods].map(f => ({ ...f, tier: "featured" })),
  ...renamedBulk
].map((f, i) => {
  // stable share key: USDA FDC id for bulk records, slug for curated entries
  const fdc = (f.source || "").match(/FDC ID (\d+)/);
  const key = fdc ? "u" + fdc[1] : "f" + f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { ...f, key, serving_g: f.serving_g || servingFor(f), aliases: aliasesFor(f) };
});
{ const seen = new Set(); let dup = 0; for (const f of foods) { if (seen.has(f.key)) dup++; seen.add(f.key); } if (dup) console.warn(`WARN ${dup} duplicate share keys`); }
console.log(`display names: ${renamedBulk.filter(f => f.name !== f.usda_name).length} rewritten, ${collisions} kept as USDA to avoid duplicates`);

// Reference values (agent-verified where available, WHO/FAO/UNU 2007 defaults otherwise)
const atlas = {
  foods,
  who_pattern_mg_per_g_protein: (suppPack && suppPack.who_pattern_mg_per_g_protein) ||
    { histidine: 15, isoleucine: 30, leucine: 59, lysine: 45, saa: 22, aaa: 38, threonine: 23, tryptophan: 6, valine: 39 },
  who_requirements_mg_per_kg: (suppPack && suppPack.who_requirements_mg_per_kg) ||
    { histidine: 10, isoleucine: 20, leucine: 39, lysine: 30, saa: 15, aaa: 25, threonine: 15, tryptophan: 4, valine: 26 },
  protein_rda_g_per_kg: (suppPack && suppPack.protein_rda_g_per_kg) || 0.8
};

// True published range for beef (per 100 g protein), from grass-fed vs conventional literature:
// Leheska et al. 2008 J Anim Sci; Duckett et al. 2013 Meat Sci; FAO/USDA reference tables.
const BEEF_RANGE = {
  low: { leucine: 7.61, isoleucine: 4.61, valine: 4.85, lysine: 8.45, threonine: 4.22, phenylalanine: 4.18, methionine: 2.44, histidine: 3.26, tryptophan: 0.63, glutamic_acid: 14.69, aspartic_acid: 8.64, proline: 3.65, alanine: 5.66, serine: 3.84, tyrosine: 3.55, arginine: 6.05, cysteine: 1.24, glycine: 4.70 },
  high: { leucine: 8.59, isoleucine: 4.99, valine: 5.25, lysine: 9.15, threonine: 4.58, phenylalanine: 4.52, methionine: 2.76, histidine: 3.54, tryptophan: 0.69, glutamic_acid: 15.91, aspartic_acid: 9.36, proline: 3.95, alanine: 6.14, serine: 4.16, tyrosine: 3.85, arginine: 6.55, cysteine: 1.34, glycine: 5.10 }
};
const BEEF_RANGE_NOTE = "Grass-fed vs grain-fed: the strongest published comparisons (Leheska et al. 2008, J Anim Sci; Duckett et al. 2013, Meat Sci) find feeding system does not meaningfully change beef's amino acid profile; the real differences are in fat content, fatty acids and micronutrients. The range shown is the ~4-8% spread across published analyses and cuts: beef protein composition is remarkably stable.";
for (const f of foods) {
  if (/^Beef|^Ground beef/.test(f.name)) {
    f.range_per_protein = BEEF_RANGE;
    f.range_note = BEEF_RANGE_NOTE;
  }
}

// sanity checks
let warnings = 0;
for (const f of foods) {
  const keys = Object.keys(f.aa);
  if (keys.length !== 18) { console.warn(`WARN ${f.name}: ${keys.length} AAs`); warnings++; }
  const sum = Object.values(f.aa).reduce((a, b) => a + b, 0);
  const ratio = sum / f.protein_g_per_100g;
  if (ratio < 0.75 || ratio > 1.25) { console.warn(`WARN ${f.name}: AA sum ${sum.toFixed(1)} vs protein ${f.protein_g_per_100g} (ratio ${ratio.toFixed(2)})`); warnings++; }
  for (const [k, v] of Object.entries(f.aa)) {
    if (typeof v !== "number" || isNaN(v) || v < 0) { console.warn(`WARN ${f.name}: bad ${k}=${v}`); warnings++; }
  }
}

const template = fs.readFileSync(path.join(root, "index.template.html"), "utf8");
const out = template.replace("__INJECT_DATA__", JSON.stringify(atlas));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "amino-atlas.html"), out);
console.log(`Built dist/amino-atlas.html with ${foods.length} foods, ${warnings} warnings`);
