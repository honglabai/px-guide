import json

with open('/Users/kobujang/Desktop/cording/px-guide/data/prepared_coupang_current.json') as f:
    rows = json.load(f)

def escape_sql(val):
    if val is None:
        return 'NULL'
    if isinstance(val, (int, float)):
        return str(val)
    return "'" + str(val).replace("'", "''") + "'"

value_tuples = []
for r in rows:
    vt = f"({escape_sql(r['product_slug'])}, {escape_sql(r['product_id'])}, {escape_sql(r['item_id'])}, {escape_sql(r['vendor_item_id'])}, {escape_sql(r['normalized_name'])}, {escape_sql(r['normalized_spec'])}, {escape_sql(r['normalized_quantity'])}, {r['displayed_price']}, {r['shipping_fee']}, {escape_sql(r['seller'])}, {escape_sql(r['price_condition'])}, {escape_sql(r['source_url'])}, {r['match_score']}, {escape_sql(r['checked_at'])}, {r['last_history_id']}, {r['comparison_quantity']}, {escape_sql(r['comparison_basis'])}, {r['catalog_product_key']})"
    value_tuples.append(vt)

batch_size = 300
batches = []
for i in range(0, len(value_tuples), batch_size):
    chunk = value_tuples[i:i+batch_size]
    sql = f"""INSERT INTO coupang_price_current (
    product_slug, product_id, item_id, vendor_item_id, normalized_name, 
    normalized_spec, normalized_quantity, displayed_price, shipping_fee, 
    seller, price_condition, source_url, match_score, checked_at, 
    last_history_id, comparison_quantity, comparison_basis, catalog_product_key
) VALUES
{','.join(chunk)}
ON CONFLICT (product_slug) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    item_id = EXCLUDED.item_id,
    vendor_item_id = EXCLUDED.vendor_item_id,
    normalized_name = EXCLUDED.normalized_name,
    displayed_price = EXCLUDED.displayed_price,
    shipping_fee = EXCLUDED.shipping_fee,
    seller = EXCLUDED.seller,
    source_url = EXCLUDED.source_url,
    checked_at = EXCLUDED.checked_at,
    comparison_quantity = EXCLUDED.comparison_quantity,
    comparison_basis = EXCLUDED.comparison_basis,
    catalog_product_key = EXCLUDED.catalog_product_key;"""
    with open(f'/tmp/coupang_batch_{i//batch_size}.sql', 'w') as out:
        out.write(sql)
    batches.append(len(chunk))

print(f'Created {len(batches)} batches: {batches}')
