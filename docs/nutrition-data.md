# Nutrition data

The diary uses USDA first and UK CoFID as a separate catalogue. Its dashboard shows portion-adjusted amounts of vitamins, minerals and macros, not micronutrient intake recommendations or diagnoses. Existing amino-acid food names, keys and macro estimates are retained so saved diaries continue to resolve.

## Sources and refresh

- [USDA FoodData Central SR Legacy, April 2018](https://fdc.nal.usda.gov/download-datasets/), public domain. The same release supplies the existing amino-acid profiles. Run `npm run refresh-data` to download and regenerate both datasets. `scripts/import_nutrition_usda.js` reads nutrient IDs and validates units; `data/nutrition_usda.json` records the SHA-256 of the source nutrient CSV.
- [UK CoFID 2021](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid), Crown copyright, Open Government Licence v3.0. Download the linked official workbook, then run `python scripts/import_nutrition_cofid.py path/to/CoFID.xlsx` with openpyxl installed. This reads the workbook without modifying it and records its SHA-256 in `data/nutrition_cofid.json`.

Generated JSON is committed; deployment does not need network access, Python or openpyxl. Run `npm test` and `npm run build` after refreshing. No API key is required. Do not mix later releases without reviewing nutrient definitions and saved food identities.

The initial import contains 7,448 USDA records (excluding baby foods) and 2,778 CoFID records. It enriches 4,169 existing atlas profiles and adds 6,076 diary-search foods, for 10,259 searchable diary entries. The amino-acid database/compare pages retain their existing 4,183 profiles. The diary source selector can show all foods, USDA or UK CoFID.

## Matching and missing information

USDA enrichment uses explicit FDC/NDB identifiers, exact citation descriptions (comma token ordering ignored), or five documented reference matches in `lib/build-nutrition.js`. There is no fuzzy nutrient matching. Fourteen existing profiles remain without a matched micronutrient record, including supplement blends with no product-specific source. An existing ground-beef profile labelled 90% lean cites an 80% lean record; its existing values are preserved but it deliberately receives no new micronutrients.

CoFID uses code plus a stable hash of its original food name: the official workbook reuses code `13-669` for two different foods. The source code and food description remain visible in dashboard citations. CoFID alcoholic beverages (group Q) are measured per 100 ml and excluded from this gram-based diary. Other records lacking numeric protein or energy are also excluded; excluded identities are retained in the generated file.

All imports retain zero, omit blanks/unavailable values, and preserve CoFID `Tr` as `trace`. Portion totals multiply reported per-100-g values by grams / 100. Missing values never become zero; incomplete totals say Partial and can be expanded to show missing foods. Trace values are listed separately from numeric totals. Food references, gram portions and meal assignments use the existing account-scoped storage and sync flow; no new personal-data collection is introduced.

Nutrition-only foods do not receive an invented amino-acid profile. If a day includes one, nutrition totals still work, while the complete daily amino-acid assessment, recommendations and profile image are unavailable. Shared diary links still work, and history reports amino-acid balance as unavailable. This avoids interpreting unknown amino acids as deficiencies.

## Definitions kept separate

USDA total carbohydrate by difference differs from CoFID available carbohydrate expressed as monosaccharide equivalents. Sugars are also kept separate by dataset. Vitamin A RAE (USDA) and RE (CoFID), vitamin D D2+D3 (USDA) and CoFID total (including weighted 25-hydroxy forms where present), and vitamin E alpha-tocopherol (USDA) and CoFID total are not summed together. Separate rows show their amounts and missing coverage. Folate is total folate, not dietary folate equivalents; vitamin K is K1. Fatty-acid imports use grams per 100 g food, not grams per 100 g total fatty acids. Units are checked during both imports.

## Daily Value percentages

The dashboard compares compatible nutrient amounts with the [FDA's current label Daily Values](https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels), verified 22 September 2026. These are the general reference for adults and children aged 4+, not UK NRVs or personalised age/sex/activity targets. The existing personal protein target is unchanged. Percentages use unrounded amounts divided by the reference, multiplied by 100, then display as whole percentages (positive values below 1% display `<1%`). They are not capped at 100 or coloured as a success/failure score. Sodium, saturated fat and cholesterol have explicit limit-reference notes.

Missing/trace-only quantities show DV unavailable; known zeros show 0%. Known subtotals with missing or trace data are labelled partial. Vitamin K percentages are explicitly partial because only K1 is recorded. Total sugars, monounsaturated fat and polyunsaturated fat have no FDA DV. No percentage is invented for incompatible forms: total folate vs DFE, niacin vs NE, CoFID RE vs RAE, CoFID vitamin D/E totals, or available vs total carbohydrate. Expanding each row explains its denominator or why DV is unavailable. Macro cards show the compatible fat, fibre and USDA carbohydrate DVs; personal protein progress remains separate.

## Lipids and DV bars

The Lipids panel groups total fat, monounsaturated and polyunsaturated fats, omega-3 (ALA, DHA, EPA, DPA), omega-6 (AA and LA), saturated fat, trans fat, cholesterol and phytosterols. Indentation shows components; these are not additional amounts to sum into total fat. FDA DVs are shown for total fat, saturated fat and cholesterol; none are invented for other lipid rows.

USDA imports use specifically identified ALA (1404), DHA (1272), EPA (1278), DPA (1280), arachidonic acid (1406), linoleic acid (1316), total trans fatty acids (1257), and total phytosterols (1283). Undifferentiated 18:2/18:3/20:4 are not substituted for specific isomers. [USDA fatty-acid definitions](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/) distinguish these forms.

CoFID omega totals and trans fat come from Proximates `TOTn3PFOD`, `TOTn6PFOD`, `FODTRANS`. Individual fatty acids come exclusively from `1.12 (PUFA per 100gFood)` using specifically identified n-3/n-6 columns, never the per-100-g-fatty-acid sheet. Phytosterols use `Total PHYTO` from `1.13 Phytosterols`, without adding constituent sterols or mixed cholesterol/sterol columns. All units are checked by the importer.

Reported omega totals always take priority, including zeros and traces. If none is reported, the dashboard sums known ALA/DHA/EPA/DPA or LA/AA as an explicitly partial component subtotal. It does not assume other species are zero, add a total to its components, or replace missing individual measurements. Subtotals are calculated per food before portion scaling, so mixed-source days cannot double-count reported totals.

All compatible numeric DVs now have decorative bars alongside accessible percentage text. Visual fill is clamped to 0–100%; text remains uncapped. Stripes mark partial coverage. Unknown, trace-only, incompatible and no-DV rows have no misleading empty bar. Bars are neutral rather than success/failure indicators, including limit-reference nutrients.

## Verification

`scripts/test-nutrition.js` checks portion scaling, zero/unknown/trace handling, analytical separation, the CoFID duplicate-code case, source matching, preserved saved-food identities and unique new keys. Browser verification should cover search/filter/add/edit/reload, mixed-source totals, unavailable amino-acid presentation, shared links, account isolation and mobile overflow.
