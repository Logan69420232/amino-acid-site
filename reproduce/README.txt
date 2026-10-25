AMINODATA REPRODUCIBLE EXPORTS — schema aminodata-calculation/v1

1. Download a Calculation snapshot (JSON) from Progress or Worked examples.
2. Download reproduce.py, then run:
     python3 reproduce.py aminodata-diary.json > recalculated.json
   The filename may include a date or example name. Substitute your downloaded name.
   Python uses only its standard library. It recalculates nutrients, amino acid
   targets/percentages/composition and EPA+DHA, checks them against saved results,
   and exits with an error if they disagree (tolerance 1e-10).
3. Alternatively install R's jsonlite package once, then:
     Rscript reproduce.R aminodata-diary.json > recalculated.json
   The R script recalculates the same values; it does not verify the saved results.
   The R version has not been runtime-tested in this preview environment.

JSON is the reproducible source. CSV is a long table, one row per food/nutrient,
for spreadsheet analysis. Numeric exports retain JS floating-point precision;
minor binary floating-point differences are normal. UI values are rounded.

INPUTS AND UNITS
per100 means per 100 of the portion unit: grams for food, the recorded dose unit
for supplements. A quantity of 3 capsules is NOT 3 grams. Label ingredient amounts
are also retained, with the labelled serving quantity in portion metadata.
Food IDs use existing catalogue keys, not display array indices. Scan IDs are local
product identities. Curated food keys are name-based; a renamed source record may
receive a new key. Always use ID + dataset version, not ID alone, for analysis.
Sources identify original citations and additional nutrient records separately.
Matched nutrient data may coexist with preserved original protein/macro values.

MISSINGNESS
null/blank means unavailable, not zero. A numeric zero means reported zero.
Trace has no assigned numeric amount. Derived_partial omega totals sum available
components, which may omit other species. Aggregates retain known, unknown, trace
and derived counts. Zero portions are retained as inputs but excluded from totals.
RAE/RE and other incompatible analytical forms remain separate.

REFERENCES AND VERSIONS
The JSON embeds reference values, daily targets and calculation assumptions.
Data versions hash bundled JSON source files. Calculation versions hash calculation
and enrichment code; reference versions hash the embedded reference object.
They are not deployment timestamps and do not imply external scientific review.
Saved historical body weight/protein targets are used when available; otherwise
current profile targets are identified as fallbacks. EPA+DHA uses the current goal
because it is not historically stamped. Historical food composition is the current
resolved catalogue/scan snapshot, not a reconstruction of a past catalogue release.

The Python/R examples reproduce amounts and comparison percentages, not the food
recommendation ranking or source data processing. They require no API or network.
These are educational calculations, not DIAAS, PDCAAS or clinical diagnoses.
Exports can contain personal diary data and scanned product names. Share deliberately.
