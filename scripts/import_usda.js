// One-shot importer: USDA SR Legacy CSVs -> data/usda_bulk.json
// Usage: node scripts/import_usda.js <path-to-sr-legacy-csv-dir>
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const srDir = process.argv[2];
if (!srDir) { console.error("Usage: node scripts/import_usda.js <sr-legacy-csv-dir>"); process.exit(1); }

// Minimal CSV line parser (handles quoted fields with commas)
function parseCSVLine(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}
function readCSV(file) {
  const lines = fs.readFileSync(path.join(srDir, file), "utf8").split(/\r?\n/).filter(l => l.length);
  const header = parseCSVLine(lines[0]);
  return lines.slice(1).map(l => {
    const cells = parseCSVLine(l);
    const row = {};
    header.forEach((h, i) => row[h] = cells[i]);
    return row;
  });
}

// nutrient name -> our AA keys
const NUTRIENT_KEY = {
  "Protein": "protein",
  "Tryptophan": "tryptophan", "Threonine": "threonine", "Isoleucine": "isoleucine",
  "Leucine": "leucine", "Lysine": "lysine", "Methionine": "methionine", "Cystine": "cysteine",
  "Phenylalanine": "phenylalanine", "Tyrosine": "tyrosine", "Valine": "valine",
  "Arginine": "arginine", "Histidine": "histidine", "Alanine": "alanine",
  "Aspartic acid": "aspartic_acid", "Glutamic acid": "glutamic_acid",
  "Glycine": "glycine", "Proline": "proline", "Serine": "serine"
};
const AA_KEYS = Object.values(NUTRIENT_KEY).filter(k => k !== "protein");

const nutrients = readCSV("nutrient.csv");
const nutrientIdToKey = {};
for (const n of nutrients) if (NUTRIENT_KEY[n.name] !== undefined) nutrientIdToKey[n.id] = NUTRIENT_KEY[n.name];

const catRows = readCSV("food_category.csv");
const catById = {}; catRows.forEach(c => catById[c.id] = c.description);

// USDA group -> atlas category
function mapCategory(group, name) {
  const n = name.toLowerCase();
  if (/egg/.test(n) && /Dairy and Egg/.test(group)) return "egg";
  const M = {
    "Dairy and Egg Products": "dairy",
    "Beef Products": "meat", "Pork Products": "meat", "Lamb, Veal, and Game Products": "meat",
    "Poultry Products": "meat", "Sausages and Luncheon Meats": "meat",
    "Finfish and Shellfish Products": "seafood",
    "Legumes and Legume Products": /soy|tofu|tempeh|miso|natto/.test(n) ? "soy" : "legume",
    "Cereal Grains and Pasta": "grain", "Baked Products": "grain", "Breakfast Cereals": "grain",
    "Nut and Seed Products": "nuts_seeds"
  };
  return M[group] || "other";
}
function inferState(name) {
  const n = name.toLowerCase();
  if (/\braw\b/.test(n)) return "raw";
  if (/cooked|roasted|braised|grilled|boiled|baked|fried|broiled|simmered|steamed|stewed/.test(n)) return "cooked";
  if (/\bdry\b|\bdried\b|dehydrated/.test(n)) return "dry";
  if (/canned/.test(n)) return "canned";
  if (/powder/.test(n)) return "powder";
  return "as sold";
}

const foods = readCSV("food.csv");
const foodById = {};
for (const f of foods) foodById[f.fdc_id] = f;

// Stream food_nutrient.csv (large) and accumulate
const acc = {}; // fdc_id -> {protein, aa:{}}
const rl = readline.createInterface({ input: fs.createReadStream(path.join(srDir, "food_nutrient.csv")) });
let first = true, header;
rl.on("line", line => {
  if (first) { header = parseCSVLine(line); first = false; return; }
  const c = parseCSVLine(line);
  const key = nutrientIdToKey[c[2]];
  if (!key) return;
  const fdc = c[1];
  (acc[fdc] = acc[fdc] || { aa: {} });
  if (key === "protein") acc[fdc].protein = +c[3];
  else acc[fdc].aa[key] = +c[3];
});
rl.on("close", () => {
  const skipGroups = new Set(["Baby Foods"]);
  // curated entries already carry these records
  const curatedFdc = new Set(["171077", "174055", "174036", "168230", "174307", "171098", "171287", "172183", "173414", "172182", "170845", "170848"]);
  const out = [];
  let noProfile = 0, incomplete = 0, lowProt = 0, badSum = 0;
  for (const [fdc, rec] of Object.entries(acc)) {
    const meta = foodById[fdc];
    if (!meta || curatedFdc.has(fdc)) continue;
    const group = catById[meta.food_category_id] || "";
    if (skipGroups.has(group)) continue;
    const have = AA_KEYS.filter(k => rec.aa[k] !== undefined && !isNaN(rec.aa[k]));
    if (have.length === 0) { noProfile++; continue; }
    if (have.length < 18) { incomplete++; continue; }
    if (!rec.protein || rec.protein < 1) { lowProt++; continue; }
    const sum = AA_KEYS.reduce((s, k) => s + rec.aa[k], 0);
    const ratio = sum / rec.protein;
    if (ratio < 0.75 || ratio > 1.25) { badSum++; continue; }
    out.push({
      name: meta.description,
      category: mapCategory(group, meta.description),
      state: inferState(meta.description),
      protein_g_per_100g: rec.protein,
      aa: Object.fromEntries(AA_KEYS.map(k => [k, rec.aa[k]])),
      source: `USDA SR Legacy, FDC ID ${fdc} (${group})`,
      tier: "bulk"
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(__dirname, "..", "data", "usda_bulk.json"), JSON.stringify(out));
  console.log(`kept ${out.length} foods | skipped: ${noProfile} without AA data, ${incomplete} incomplete profiles, ${lowProt} <1g protein, ${badSum} failed AA-sum sanity check`);
  const byCat = {};
  out.forEach(f => byCat[f.category] = (byCat[f.category] || 0) + 1);
  console.log(byCat);
});
