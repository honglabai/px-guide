import json
import re
import urllib.parse
import sqlite3

# Connect to sqlite for product catalog mapping
conn = sqlite3.connect('/Users/kobujang/Desktop/cording/px-guide/data/site-snapshot.sqlite')
c = conn.cursor()
c.execute('SELECT id, slug, name FROM catalog_products')
products = {row[0]: {'id': row[0], 'slug': row[1], 'name': row[2]} for row in c.fetchall()}

with open('/Users/kobujang/Desktop/cording/px-guide/data/new_coupang_survey_clean.json') as f:
    survey_data = json.load(f)[1:]

coupang_current_rows = []
catalog_price_updates = []
status_counts = {}

def parse_coupang_url(url):
    prod_id = None
    item_id = None
    vendor_item_id = None
    if not url:
        return prod_id, item_id, vendor_item_id
    m = re.search(r'/products/(\d+)', url)
    if m:
        prod_id = m.group(1)
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    if 'itemId' in qs:
        item_id = qs['itemId'][0]
    if 'vendorItemId' in qs:
        vendor_item_id = qs['vendorItemId'][0]
    return prod_id, item_id, vendor_item_id

for r in survey_data:
    pid = int(r[0])
    name_raw = r[1]
    px_price = int(r[2])
    coupang_val_str = r[3].strip()
    coupang_url = r[4].strip() if len(r) > 4 else ''
    
    prod = products.get(pid)
    if not prod:
        continue
    
    try:
        price_num = float(coupang_val_str.replace(',', ''))
        unit_price = round(price_num)
        if unit_price <= 0:
            continue
            
        c_prod_id, c_item_id, c_vendor_id = parse_coupang_url(coupang_url)
        
        row = {
            'product_slug': prod['slug'],
            'product_id': c_prod_id,
            'item_id': c_item_id,
            'vendor_item_id': c_vendor_id,
            'normalized_name': prod['name'],
            'normalized_spec': '',
            'normalized_quantity': '1개',
            'displayed_price': unit_price,
            'shipping_fee': 0,
            'seller': '쿠팡',
            'price_condition': '일반가',
            'source_url': coupang_url if coupang_url else f'https://www.coupang.com/vp/products/{prod["slug"]}',
            'match_score': 100,
            'checked_at': '2026-11-17',
            'last_history_id': pid,
            'comparison_quantity': 1,
            'comparison_basis': 'sameBundle',
            'catalog_product_key': pid
        }
        coupang_current_rows.append(row)
        catalog_price_updates.append((unit_price, pid))
    except ValueError:
        status_counts[coupang_val_str] = status_counts.get(coupang_val_str, 0) + 1

print(f'Prepared {len(coupang_current_rows)} coupang_price_current records')
print(f'Prepared {len(catalog_price_updates)} catalog_prices updates')

with open('/Users/kobujang/Desktop/cording/px-guide/data/prepared_coupang_current.json', 'w', encoding='utf-8') as f:
    json.dump(coupang_current_rows, f, ensure_ascii=False, indent=2)

