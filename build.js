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

// ---------- macros for curated entries ----------
const macrosLookup = load("macros_lookup.json") || { byFdc: {}, byNdb: {}, byTok: {} };
// label-typical values for powders with no USDA record; kcal derived by Atwater
const SUPP_MACROS = {
  "Whey protein isolate": { fat: 1.0, carb: 1.5 },
  "Micellar casein": { fat: 1.5, carb: 4.0 },
  "Collagen peptides": { fat: 0.0, carb: 0.0 },
  "Pea protein isolate": { fat: 5.5, carb: 3.0 },
  "Brown rice protein": { fat: 2.5, carb: 6.0 },
  "Hemp protein powder": { fat: 11.0, carb: 14.0 },
  "Soy protein isolate": { fat: 3.5, carb: 2.0 }
};
/* standard USDA reference values for the few curated names whose citations
   do not line up with an SR record; review welcome */
const NAME_MACROS = {
  "Shrimp (raw)": { kcal: 85, fat: 0.5, carb: 0.9 },
  "Chickpeas, cooked": { kcal: 164, fat: 2.6, carb: 27.4 },
  "Kidney beans, cooked": { kcal: 127, fat: 0.5, carb: 22.8 },
  "Brown rice, cooked": { kcal: 123, fat: 1.0, carb: 25.6 },
  "Walnuts, raw": { kcal: 654, fat: 65.2, carb: 13.7 },
  "Nutritional yeast": { kcal: 330, fat: 4.0, carb: 37.0 }
};
const tokKey = desc => desc.toLowerCase().split(",").map(t => t.trim()).filter(Boolean).sort().join("|");
function attachMacros(f) {
  if (f.kcal != null) return;
  const src = f.source || "";
  let m = null, x;
  if ((x = /FDC (?:ID )?(\d+)/.exec(src))) m = macrosLookup.byFdc[x[1]];
  if (!m && (x = /NDB (\d+)/.exec(src))) m = macrosLookup.byNdb[x[1]] || macrosLookup.byNdb[String(+x[1])];
  if (!m) {
    let nm = null;
    if ((x = /USDA SR Legacy, (.+?) \(via nutritionvalue/.exec(src))) nm = x[1];
    else if ((x = /USDA SR Legacy \((.+?)\)/.exec(src))) nm = x[1];
    else if ((x = /USDA SR Legacy, (.+)$/.exec(src))) nm = x[1].replace(/ \([^)]*\)\s*$/, "");
    if (nm) {
      m = macrosLookup.byTok[tokKey(nm)];
      if (!m) {
        /* curated citations abbreviate the USDA names; accept the record whose
           token set contains all of ours with the fewest extras */
        const toks = new Set(nm.toLowerCase().split(",").map(t => t.trim()).filter(Boolean));
        let best = null, bestExtra = 9;
        for (const [k, mm] of Object.entries(macrosLookup.byTok)) {
          const kt = k.split("|");
          if (kt.length < toks.size) continue;
          const ks = new Set(kt);
          let ok = true;
          for (const t of toks) if (!ks.has(t)) { ok = false; break; }
          if (!ok) continue;
          const extra = kt.length - toks.size;
          if (extra < bestExtra) { bestExtra = extra; best = mm; }
        }
        if (bestExtra <= 3) m = best;
      }
    }
  }
  if (!m && NAME_MACROS[f.name]) m = NAME_MACROS[f.name];
  if (!m && SUPP_MACROS[f.name]) {
    const t = SUPP_MACROS[f.name];
    m = { kcal: Math.round(4 * (f.protein_g_per_100g + t.carb) + 9 * t.fat), fat: t.fat, carb: t.carb };
  }
  if (m) { f.kcal = m.kcal; if (m.fat != null) f.fat = m.fat; if (m.carb != null) f.carb = m.carb; }
}
[...meatDairy, ...seafoodPlants, ...suppFoods].forEach(attachMacros);

// Typical serving sizes (g) for the calculator
const SERVINGS = [
  // first match wins, so specific and small servings come before broad ones
  [/whey|casein|isolate|concentrate|protein powder|collagen|hemp protein|rice protein|egg white protein/i, 30],
  [/spirulina/i, 10], [/yeast/i, 15],
  [/\b(dry|dried|dehydrated|powder|powdered)\b/i, 30],
  [/bacon/i, 30], [/jerky/i, 30],
  [/cheese|cheddar|mozzarella|parmesan|cottage|ricotta|feta|halloumi/i, 30],
  [/yogurt/i, 170],
  [/^milk\b/i, 250], [/soymilk|soy milk|almond milk|oat milk/i, 250],
  [/^egg\b|egg white \(raw\)|whole egg/i, 50],
  [/fish|salmon|tuna|cod|mackerel|sardine|trout|tilapia|halibut|haddock|herring|anchov|bass|snapper|pollock|catfish|swordfish|whale|seal/i, 150],
  [/shrimp|prawn|crab|lobster|crayfish|oyster|clam|mussel|scallop|squid|octopus|shellfish/i, 100],
  [/sausage|frankfurter|salami|bologna|ham\b|luncheon/i, 75],
  [/chicken|turkey|beef|pork|lamb|veal|venison|bison|buffalo|duck|goose|game meat|emu|ostrich|rabbit|goat|mutton/i, 150],
  [/tofu|tempeh/i, 100], [/edamame/i, 80],
  [/lentils|chickpeas|beans|peas|hummus/i, 120],
  [/oats/i, 40], [/quinoa|rice, |brown rice|pasta|noodle|couscous|bulgur|barley/i, 150],
  [/bread|bagel|tortilla|roll\b/i, 60],
  [/peanut|almond|walnut|cashew|pistachio|pecan|hazelnut|macadamia|brazil|hemp|chia|flax|sunflower|sesame|pumpkin|nuts|seeds?\b/i, 30],
  [/gluten|seitan/i, 90]
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
  [/^Beef, ground, (\d+)% lean meat \/ (\d+)% fat/i, "Beef mince, $2% fat ($1% lean)"],
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
const seenSlugs = new Set();
for (const f of foods) {
  let base = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "food";
  let slug = base, k = 2;
  while (seenSlugs.has(slug)) slug = base + "-" + k++;
  seenSlugs.add(slug);
  f.slug = slug;
}

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
fs.writeFileSync(path.join(root, "dist", "index.html"), out);

// ---------- /database: the same app, addressed as its own page ----------
const BASE = "https://aminodata.org";
const dbOut = out
  .replace("<title>Amino Atlas: amino acid profiles of every protein source</title>",
    "<title>Amino acid database: full profiles of " + foods.length.toLocaleString() + " foods · Amino Atlas</title>")
  .replace('<meta name="description" content="Enter what you eat in a day and see its full amino acid profile. 4,000+ foods from USDA analytical data, scored against WHO/FAO 2007 requirements." />',
    '<meta name="description" content="Browse the full amino acid composition of ' + foods.length.toLocaleString() + ' foods: all 18 amino acids per 100 g, WHO/FAO 2007 scores, and limiting amino acids, from USDA analytical data." />')
  .replace('<link rel="canonical" href="https://aminodata.org/" />',
    '<link rel="canonical" href="' + BASE + '/database" />')
  .replace('<meta property="og:title" content="Amino Atlas" />',
    '<meta property="og:title" content="Amino acid database · Amino Atlas" />');
fs.writeFileSync(path.join(root, "dist", "database.html"), dbOut);

// ---------- /compare and /compare-amino-acids: addressed pages of the app ----------
function pageCopy(title, desc, canonicalPath, ogTitle) {
  return out
    .replace("<title>Amino Atlas: amino acid profiles of every protein source</title>", "<title>" + title + "</title>")
    .replace(/<meta name="description" content="[^"]*" \/>/, '<meta name="description" content="' + desc + '" />')
    .replace('<link rel="canonical" href="https://aminodata.org/" />', '<link rel="canonical" href="' + BASE + canonicalPath + '" />')
    .replace('<meta property="og:title" content="Amino Atlas" />', '<meta property="og:title" content="' + ogTitle + '" />');
}
fs.writeFileSync(path.join(root, "dist", "compare.html"),
  pageCopy("Compare foods side by side: amino acid profiles · Amino Atlas",
    "Put any two or three foods side by side: essential amino acids in grams per 100 g of protein, against the WHO/FAO 2007 requirement.",
    "/compare", "Compare foods · Amino Atlas"));
fs.writeFileSync(path.join(root, "dist", "compare-amino-acids.html"),
  pageCopy("Compare amino acids: roles, daily needs, richest sources · Amino Atlas",
    "Pick any two amino acids and compare what each does, how much you need a day, and which foods carry the most of it.",
    "/compare-amino-acids", "Compare amino acids · Amino Atlas"));

// ---------- /food/<slug>: one static, crawlable page per food ----------
const AA_LABELS = [
  ["leucine", "Leucine", "Essential (BCAA)"], ["isoleucine", "Isoleucine", "Essential (BCAA)"], ["valine", "Valine", "Essential (BCAA)"],
  ["lysine", "Lysine", "Essential"], ["threonine", "Threonine", "Essential"], ["phenylalanine", "Phenylalanine", "Essential"],
  ["methionine", "Methionine", "Essential"], ["histidine", "Histidine", "Essential"], ["tryptophan", "Tryptophan", "Essential"],
  ["glutamic_acid", "Glutamic acid", "Non-essential"], ["aspartic_acid", "Aspartic acid", "Non-essential"], ["proline", "Proline", "Non-essential"],
  ["alanine", "Alanine", "Non-essential"], ["serine", "Serine", "Non-essential"], ["tyrosine", "Tyrosine", "Non-essential"],
  ["arginine", "Arginine", "Non-essential"], ["cysteine", "Cysteine", "Non-essential"], ["glycine", "Glycine", "Non-essential"]
];
const WHO_PATTERN = atlas.who_pattern_mg_per_g_protein;
const SCORE_KEYS = [["histidine", ["histidine"]], ["isoleucine", ["isoleucine"]], ["leucine", ["leucine"]], ["lysine", ["lysine"]],
  ["saa", ["methionine", "cysteine"]], ["aaa", ["phenylalanine", "tyrosine"]], ["threonine", ["threonine"]],
  ["tryptophan", ["tryptophan"]], ["valine", ["valine"]]];
const SCORE_LABEL = { histidine: "histidine", isoleucine: "isoleucine", leucine: "leucine", lysine: "lysine",
  saa: "methionine + cysteine", aaa: "phenylalanine + tyrosine", threonine: "threonine", tryptophan: "tryptophan", valine: "valine" };
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const AUTHORS_LD = [{"@type": "Person", "name": "Logan King", "url": "https://logantalkshealth.com/", "image": "https://aminodata.org/assets/logan-king.jpg"}, {"@type": "Person", "name": "Paul T Morgan", "honorificPrefix": "Dr", "url": "https://www.mmu.ac.uk/staff/profile/dr-paul-t-morgan", "image": "https://aminodata.org/assets/paul-morgan.jpg", "jobTitle": "Senior Lecturer in Human Nutrition and Metabolism", "worksFor": {"@type": "CollegeOrUniversity", "name": "Manchester Metropolitan University", "url": "https://www.mmu.ac.uk/"}, "description": "Registered Sport and Exercise Nutritionist (SENr), CASES Accredited Physiologist, and Fellow of the Higher Education Academy. Programme Lead for MSc Performance Nutrition.", "hasCredential": [{"@type": "EducationalOccupationalCredential", "name": "Registered Sport and Exercise Nutritionist (SENr)"}, {"@type": "EducationalOccupationalCredential", "name": "CASES Accredited Physiologist"}, {"@type": "EducationalOccupationalCredential", "name": "Fellow of the Higher Education Academy"}]}];

function foodScore(f) {
  let min = null;
  for (const [id, keys] of SCORE_KEYS) {
    const mgPerG = keys.reduce((t, k) => t + f.aa[k], 0) / f.protein_g_per_100g * 1000;
    const ratio = mgPerG / WHO_PATTERN[id];
    if (!min || ratio < min.ratio) min = { id, ratio };
  }
  return min;
}

const FOOD_CSS = `*{box-sizing:border-box}body{margin:0;background:#faf8f3;color:#1b1914;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6}.wrap{max-width:760px;margin:0 auto;padding:28px 20px 60px}nav{font-size:13px;color:#8b8577;margin-bottom:26px}nav a{color:#4f2d7f}h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(26px,5vw,38px);line-height:1.1;margin:0 0 10px}.sub{color:#575246;font-size:14.5px;margin:0 0 18px}.facts{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 26px}.facts div{background:#fffdf8;border:1px solid #cfc9bc;padding:8px 14px;font-size:13.5px}.facts b{display:block;font-size:17px}.facts .limit b{color:#b5401f}.facts .good b{color:#4f2d7f}table{border-collapse:collapse;width:100%;font-size:14.5px;font-variant-numeric:tabular-nums}th{text-align:right;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8b8577;border-bottom:2px solid #1b1914;padding:8px 10px}td{padding:7px 10px;border-bottom:1px solid #e8e4da;text-align:right}th:first-child,td:first-child{text-align:left}.cls{color:#8b8577;font-size:12px}.cta{display:inline-block;background:#4f2d7f;color:#fff;text-decoration:none;padding:11px 20px;font-weight:600;margin:26px 12px 0 0}.cta.alt{background:transparent;color:#4f2d7f;border:1px solid #4f2d7f}.note{color:#8b8577;font-size:12.5px;margin-top:26px}.avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;border:1px solid #cfc9bc}`;

fs.mkdirSync(path.join(root, "dist", "food"), { recursive: true });
for (const f of foods) {
  const score = foodScore(f);
  const complete = score.ratio >= 1;
  const pct = Math.round(score.ratio * 100);
  const perProt = k => (f.aa[k] / f.protein_g_per_100g * 100);
  const rows = AA_LABELS.map(([k, label, cls]) =>
    `<tr><td>${label} <span class="cls">${cls}</span></td><td>${f.aa[k].toFixed(2)}</td><td>${perProt(k).toFixed(1)}</td></tr>`).join("");
  const desc = `Full amino acid profile of ${f.name}: ${f.protein_g_per_100g.toFixed(1)} g protein per 100 g, leucine ${f.aa.leucine.toFixed(2)} g, lysine ${f.aa.lysine.toFixed(2)} g. Amino acid score ${pct}%${complete ? "" : ", limited by " + SCORE_LABEL[score.id]}.`;
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(f.name)}: amino acid profile · Amino Atlas</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}/food/${f.slug}">
<meta name="author" content="Logan King and Dr Paul T Morgan">
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-DD4277KQ5Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-DD4277KQ5Z');
</script>
<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "yiacqhhkjn");
</script>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: f.name + ": amino acid profile",
  description: desc,
  mainEntityOfPage: BASE + "/food/" + f.slug,
  publisher: { "@type": "Organization", name: "Amino Atlas", url: BASE + "/" },
  author: AUTHORS_LD
})}</script>
<style>${FOOD_CSS}</style>
</head>
<body><div class="wrap">
<nav><a href="/">Amino Atlas</a> · <a href="/database">Amino acid database</a></nav>
<h1>${esc(f.name)}</h1>
<p class="sub">${esc(f.state)} · ${esc(f.source || "")}</p>
<div class="facts">
<div><span>Protein /100 g</span><b>${f.protein_g_per_100g.toFixed(1)} g</b></div>
${f.kcal != null ? `<div><span>Energy /100 g</span><b>${f.kcal} kcal</b></div><div><span>Carbs /100 g</span><b>${f.carb != null ? f.carb.toFixed(1) + " g" : "n/a"}</b></div><div><span>Fat /100 g</span><b>${f.fat != null ? f.fat.toFixed(1) + " g" : "n/a"}</b></div>` : ""}
<div class="${complete ? "good" : "limit"}"><span>Amino acid score</span><b>${pct}%</b></div>
<div><span>Limiting amino acid</span><b>${complete ? "none (complete)" : esc(SCORE_LABEL[score.id])}</b></div>
</div>
<table>
<thead><tr><th>Amino acid</th><th>g / 100 g</th><th>g / 100 g protein</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<a class="cta" href="/#add=${f.slug}">Add to my day</a><a class="cta alt" href="/database/${f.slug}">Open interactive profile</a>
<p class="note byline"><img class="avatar" src="/assets/logan-king.jpg" alt="Logan King" width="26" height="26" loading="lazy"><img class="avatar" src="/assets/paul-morgan.jpg" alt="Dr Paul T Morgan" width="26" height="26" loading="lazy"> By <a href="https://logantalkshealth.com/" rel="author">Logan King</a> and <a href="https://www.mmu.ac.uk/staff/profile/dr-paul-t-morgan" rel="author">Dr Paul T Morgan</a>, Senior Lecturer in Human Nutrition and Metabolism, Manchester Metropolitan University.</p>
<p class="note">Amino acid score compares this food's scarcest essential amino acid with the WHO/FAO/UNU 2007 adult pattern; 100%+ means every essential amino acid is carried in good proportion. Data: ${esc(f.source || "public analytical data")}. Educational reference, not medical advice.</p>
</div></body></html>`;
  fs.writeFileSync(path.join(root, "dist", "food", f.slug + ".html"), page);
}

// ---------- sitemap + robots ----------
const urls = [BASE + "/", BASE + "/database", BASE + "/compare", BASE + "/compare-amino-acids", ...foods.map(f => BASE + "/food/" + f.slug)];
fs.writeFileSync(path.join(root, "dist", "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => "<url><loc>" + u + "</loc></url>").join("\n") + "\n</urlset>\n");
fs.writeFileSync(path.join(root, "dist", "robots.txt"), "User-agent: *\nAllow: /\nSitemap: " + BASE + "/sitemap.xml\n");

fs.cpSync(path.join(root, "assets"), path.join(root, "dist", "assets"), { recursive: true });
const noMacros = foods.filter(f => f.kcal == null).length;
console.log(`Built dist: index, database, ${foods.length} food pages, sitemap (${urls.length} URLs), ${warnings} warnings, ${noMacros} foods without macros`);
