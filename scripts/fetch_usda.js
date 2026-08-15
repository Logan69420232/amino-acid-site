// Downloads and extracts the USDA SR Legacy CSV dataset (used by the Vercel build).
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip";
const outDir = path.join(__dirname, "..", "usda_csv");

(async () => {
  if (fs.existsSync(path.join(outDir, "FoodData_Central_sr_legacy_food_csv_2018-04", "food.csv"))) {
    console.log("USDA CSVs already present, skipping download");
    return;
  }
  console.log("Downloading SR Legacy dataset…");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`USDA download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zipPath = path.join(__dirname, "..", "sr_legacy.zip");
  fs.writeFileSync(zipPath, buf);
  console.log(`Downloaded ${(buf.length / 1e6).toFixed(1)} MB, extracting…`);
  new AdmZip(zipPath).extractAllTo(outDir, true);
  fs.unlinkSync(zipPath);
  console.log("Extracted to", outDir);
})();
