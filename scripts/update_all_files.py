import json
import os
import re
import sqlite3

# Load prepared Coupang price updates
with open('/Users/kobujang/Desktop/cording/px-guide/data/prepared_coupang_current.json') as f:
    coupang_rows = json.load(f)

coupang_map = {r['product_slug']: r for r in coupang_rows}
print(f'Loaded {len(coupang_map)} coupang price records.')

# 1. Update SQLite DB (catalog_prices and coupang_price_current)
sqlite_path = '/Users/kobujang/Desktop/cording/px-guide/data/site-snapshot.sqlite'
if os.path.exists(sqlite_path):
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()
    # Insert or replace into coupang_price_current
    for r in coupang_rows:
        cur.execute('''
            INSERT OR REPLACE INTO coupang_price_current (
                product_slug, product_id, item_id, vendor_item_id, normalized_name,
                normalized_spec, normalized_quantity, displayed_price, shipping_fee,
                seller, price_condition, source_url, match_score, checked_at,
                last_history_id, comparison_quantity, comparison_basis, catalog_product_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            r['product_slug'], r['product_id'], r['item_id'], r['vendor_item_id'],
            r['normalized_name'], r['normalized_spec'], r['normalized_quantity'],
            r['displayed_price'], r['shipping_fee'], r['seller'], r['price_condition'],
            r['source_url'], r['match_score'], r['checked_at'], r['last_history_id'],
            r['comparison_quantity'], r['comparison_basis'], r['catalog_product_key']
        ))
        cur.execute('''
            UPDATE catalog_prices 
            SET amount = ? 
            WHERE product_id = ? AND kind = 'officialPrice'
        ''', (r['displayed_price'], r['catalog_product_key']))
    conn.commit()
    conn.close()
    print('Updated site-snapshot.sqlite!')

# 2. Update data/products-current.json
prod_path = '/Users/kobujang/Desktop/cording/px-guide/data/products-current.json'
if os.path.exists(prod_path):
    with open(prod_path, 'r', encoding='utf-8') as f:
        products = json.load(f)
    updated_prod_count = 0
    for p in products:
        c = coupang_map.get(p['slug'])
        if c:
            p['officialPrice'] = c['displayed_price']
            p['priceSeller'] = '쿠팡가'
            p['priceCheckedAt'] = c['checked_at']
            updated_prod_count += 1
    with open(prod_path, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    print(f'Updated {updated_prod_count} products in data/products-current.json')

# 3. Update public/favorites-data.json
fav_path = '/Users/kobujang/Desktop/cording/px-guide/public/favorites-data.json'
if os.path.exists(fav_path):
    with open(fav_path, 'r', encoding='utf-8') as f:
        favs = json.load(f)
    updated_fav_count = 0
    for p in favs:
        c = coupang_map.get(p['slug'])
        if c:
            p['officialPrice'] = c['displayed_price']
            p['priceSeller'] = '쿠팡가'
            p['priceCheckedAt'] = c['checked_at']
            updated_fav_count += 1
    with open(fav_path, 'w', encoding='utf-8') as f:
        json.dump(favs, f, ensure_ascii=False, indent=2)
    print(f'Updated {updated_fav_count} products in public/favorites-data.json')

# 4. Update public/catalog/index-*.json
catalog_dir = '/Users/kobujang/Desktop/cording/px-guide/public/catalog'
manifest_path = os.path.join(catalog_dir, 'manifest.json')
if os.path.exists(manifest_path):
    with open(manifest_path, 'r') as f:
        m = json.load(f)
    active_index_file = m['index'].lstrip('/')
    idx_path = os.path.join('/Users/kobujang/Desktop/cording/px-guide/public', active_index_file)
    if os.path.exists(idx_path):
        with open(idx_path, 'r', encoding='utf-8') as f:
            idx_data = json.load(f)
        up_idx = 0
        for p in idx_data.get('products', []):
            c = coupang_map.get(p.get('slug'))
            if c:
                p['officialPrice'] = c['displayed_price']
                up_idx += 1
        with open(idx_path, 'w', encoding='utf-8') as f:
            json.dump(idx_data, f, ensure_ascii=False)
        print(f'Updated {up_idx} products in {idx_path}')

# 5. Update static HTML pages in public/products/<slug>/index.html
html_updated = 0
for slug, c in coupang_map.items():
    html_file = f'/Users/kobujang/Desktop/cording/px-guide/public/products/{slug}/index.html'
    if not os.path.exists(html_file):
        continue
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find data-price-px
    px_match = re.search(r'data-price-px="(\d+)"', content)
    px_price = int(px_match.group(1)) if px_match else None
    
    new_price_won = f"{c['displayed_price']:,}원"
    
    # Replace data-price-value text: <strong data-price-value>...원</strong>
    content_new = re.sub(
        r'<strong data-price-value>[^<]+</strong>',
        f'<strong data-price-value>{new_price_won}</strong>',
        content
    )
    
    # Compute gap and label
    if px_price is not None and c['displayed_price'] > 0:
        gap = c['displayed_price'] - px_price
        pct = round(abs(gap) / c['displayed_price'] * 100)
        gap_won = f"{abs(gap):,}원"
        if gap > 0:
            label = f"{pct}% 저렴 · {gap_won} 차이"
        elif gap < 0:
            label = f"PX가 높음 · {gap_won} 차이"
        else:
            label = "가격 동일"
        
        # Replace data-price-result
        content_new = re.sub(
            r'<p class="price-result" data-price-result>[^<]*</p>',
            f'<p class="price-result" data-price-result>{label}</p>',
            content_new
        )
    
    if content_new != content:
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(content_new)
        html_updated += 1

print(f'Updated {html_updated} product HTML files in public/products/')
