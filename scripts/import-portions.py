"""Extract household measures from the same USDA SR Legacy release as nutrition.
Usage: python3 scripts/import-portions.py path/to/FoodData_Central_sr_legacy_food_csv_2018-04.zip
"""
import csv, hashlib, io, json, pathlib, re, sys, zipfile
archive=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(archive)
rows=csv.DictReader(io.TextIOWrapper(z.open(next(n for n in z.namelist() if n.endswith('/food_portion.csv')))))
records={}
for r in rows:
 try: amount=float(r['amount']); grams=float(r['gram_weight'])
 except ValueError: continue
 label=r['modifier'].strip()
 if not label or amount<=0 or grams<=0 or len(label)>100 or re.match(r'^(?:oz|ounce|g|gram|lb|pound|100 g)\b',label,re.I): continue
 label=re.sub(r'\btbsp\b','tablespoon',label,flags=re.I); label=re.sub(r'\btsp\b','teaspoon',label,flags=re.I)
 records.setdefault(r['fdc_id'],[]).append(['portion:'+r['id'],round(grams/amount,4),label])
for items in records.values():
 tbsp=next((x for x in items if x[2]=='tablespoon'),None)
 if tbsp and not any(x[2]=='teaspoon' for x in items):items.append([tbsp[0]+'-tsp',round(tbsp[1]/3,4),'teaspoon'])
out={'source':'USDA SR Legacy April 2018 food_portion.csv','url':'https://fdc.nal.usda.gov/download-datasets/','sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'records':records}
p=pathlib.Path(__file__).resolve().parents[1]/'data/portions_usda.json';p.write_text(json.dumps(out,separators=(',',':')))
print(len(records),'foods with household measures')
