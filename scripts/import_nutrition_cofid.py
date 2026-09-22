"""Read the official CoFID 2021 workbook. Requires openpyxl; no workbook is modified.
Usage: python scripts/import_nutrition_cofid.py path/to/CoFID.xlsx
"""
import hashlib, json, math, sys
from pathlib import Path
import openpyxl

SOURCE_URL = 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid'
workbook_path = Path(sys.argv[1])
workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
mapping = {
    'PROT': 'protein', 'FAT': 'fat', 'CHO': 'carb_uk', 'KCALS': 'kcal',
    'AOACFIB': 'fibre', 'TOTSUG': 'sugars_uk', 'SATFOD': 'saturated_fat',
    'MONOFOD': 'mono_fat', 'POLYFOD': 'poly_fat', 'CHOL': 'cholesterol',
    'TOTn3PFOD':'omega_3','TOTn6PFOD':'omega_6','FODTRANS':'trans_fat',
    'FOD18:3cn3':'ala','FOD22:6cn3':'dha','FOD20:5cn3':'epa','FOD22:5cn3':'dpa',
    'FOD20:4cn6':'aa_fat','FOD18:2cn6':'la','Total PHYTO':'phytosterols',
    'NA':'sodium','K':'potassium','CA':'calcium','MG':'magnesium','P':'phosphorus',
    'FE':'iron','CU':'copper','ZN':'zinc','CL':'chloride','MN':'manganese','SE':'selenium','I':'iodine',
    'RETEQU':'vitamin_a_re','VITD':'vitamin_d_uk','VITE':'vitamin_e_uk','VITK1':'vitamin_k',
    'THIA':'thiamin','RIBO':'riboflavin','NIAC':'niacin','VITB6':'vitamin_b6',
    'VITB12':'vitamin_b12','FOLT':'folate','PANTO':'pantothenic_acid','BIOT':'biotin','VITC':'vitamin_c'
}
units = dict.fromkeys(['PROT','FAT','CHO','AOACFIB','TOTSUG','SATFOD','MONOFOD','POLYFOD'], 'g')
units.update(dict.fromkeys(['CHOL','NA','K','CA','MG','P','FE','CU','ZN','CL','MN','VITE','THIA','RIBO','NIAC','VITB6','PANTO','VITC'], 'mg'))
units.update(dict.fromkeys(['SE','I','RETEQU','VITD','VITK1','VITB12','FOLT','BIOT'], 'µg'))
units['KCALS'] = 'kcal'
units.update(dict.fromkeys(['TOTn3PFOD','TOTn6PFOD','FODTRANS','FOD18:3cn3','FOD22:6cn3','FOD20:5cn3','FOD22:5cn3','FOD20:4cn6','FOD18:2cn6'], 'g'))
units['Total PHYTO'] = 'mg'
records = {}
for sheet_name in ['1.3 Proximates', '1.4 Inorganics', '1.5 Vitamins', '1.12 (PUFA per 100gFood)', '1.13 Phytosterols']:
    rows = iter(workbook[sheet_name].values)
    labels, codes, descriptions = next(rows), next(rows), next(rows)
    for column, code in enumerate(codes):
        if code in mapping and not str(labels[column]).replace('μ', 'µ').endswith('('+units[code]+')'):
            raise ValueError('Unexpected CoFID unit: '+str(code)+' / '+str(labels[column]))
    for row in rows:
        code = row[0]
        if not isinstance(code, str) or not row[1]:
            continue
        # 13-669 is reused for aubergine and watercress in the official workbook.
        # Join by code AND name; preserve the original code in the citation.
        identity = code + '-' + hashlib.sha256(row[1].encode('utf-8')).hexdigest()[:8]
        record = records.setdefault(identity, {'code': code, 'name': row[1], 'group': row[3], 'nutrients': {}})
        if record['name'] != row[1]:
            raise ValueError('CoFID sheet identity mismatch: '+code)
        for column, key in enumerate(codes):
            if key not in mapping:
                continue
            raw = row[column]
            if isinstance(raw, str) and raw.strip().lower() == 'tr':
                record['nutrients'][mapping[key]] = 'trace'
            elif raw is not None and str(raw).strip():
                try:
                    value = float(raw)
                except (ValueError, TypeError):
                    continue  # N and blanks mean unavailable, never zero.
                if math.isfinite(value) and value >= 0:
                    record['nutrients'][mapping[key]] = value

# CoFID alcoholic beverages are per 100 ml, unlike our gram-based diary.
# Keep them out until volume/density-aware portions are supported. Group Q is
# checked against the user guide.
excluded = []
for code, record in list(records.items()):
    n = record['nutrients']
    if str(record['group']).startswith('Q') or not isinstance(n.get('protein'), (int, float)) or not isinstance(n.get('kcal'), (int, float)):
        excluded.append(code)
        del records[code]

output = {'source':'UK CoFID 2021', 'url':SOURCE_URL,
          'sha256':hashlib.sha256(workbook_path.read_bytes()).hexdigest(),
          'excluded':excluded, 'records':records}
Path(__file__).resolve().parent.parent.joinpath('data/nutrition_cofid.json').write_text(
    json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Imported {len(records)} CoFID foods; excluded {len(excluded)} volume-based or incomplete macro records')
