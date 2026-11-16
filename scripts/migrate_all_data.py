import urllib.request
import json
import sqlite3
import time
import sys

db_path = '/Users/kobujang/Downloads/PX_Guide_Migration_20261113/data/site-snapshot.sqlite'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

supabase_url = 'https://plshwfggvcergfbofrbt.supabase.co/rest/v1'
api_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsc2h3ZmdndmNlcmdmYm9mcmJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mjk1ODksImV4cCI6MjExMDQwNTU4OX0.b51KB6wufcqshTsZFRPwbfYKKocwzUEP0lxu5N4QThk'

tables = [
    ('catalog_brands', ['id', 'name'], 500),
    ('catalog_categories', ['id', 'parent_id', 'level', 'code', 'name'], 500),
    ('catalog_products', ['id', 'slug', 'name', 'brand_id', 'category_id', 'tax_type', 'sort_order', 'visible'], 500),
    ('catalog_sequences', ['category_id', 'last_sequence'], 500),
    ('catalog_codes', ['code', 'product_id', 'category_id', 'is_current'], 500),
    ('catalog_aliases', ['namespace', 'identifier', 'product_id'], 1000),
    ('catalog_assets', ['product_id', 'kind', 'payload'], 300),
    ('catalog_records', ['product_id', 'kind', 'payload'], 300),
    ('catalog_prices', ['product_id', 'kind', 'amount'], 1000),
    ('catalog_discounts', ['month', 'product_id', 'regular_price', 'sale_price'], 500),
    ('catalog_texts', ['id', 'value'], 1000),
    ('catalog_documents', ['name', 'payload'], 10),
    ('catalog_state', ['key', 'value'], 10),
    ('feedback_posts', ['id', 'category', 'title', 'body', 'nickname', 'created_at', 'updated_at', 'deleted_at', 'edit_hash', 'creator'], 10)
]

def post_batch(table, rows):
    url = f'{supabase_url}/{table}'
    data = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'apikey': api_key,
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=ignore-duplicates,return=minimal'
        },
        method='POST'
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status in (200, 201):
                    return True
        except urllib.error.HTTPError as e:
            err = e.read().decode('utf-8', errors='replace')
            print(f'  [Error {e.code}] on {table}: {err[:200]}')
            if attempt == 2:
                raise
            time.sleep(1)
        except Exception as e:
            print(f'  [Exception] on {table}: {e}')
            if attempt == 2:
                raise
            time.sleep(1)
    return False

total_start = time.time()
print('Starting data migration to Supabase...')

for table, cols, chunk_size in tables:
    order_by = ' ORDER BY level, id' if table == 'catalog_categories' else ''
    cols_str = ', '.join(cols)
    cursor.execute(f'SELECT {cols_str} FROM {table}{order_by}')
    raw_rows = cursor.fetchall()
    total = len(raw_rows)
    print(f'Migrating {table} ({total} rows)...')
    
    migrated = 0
    for i in range(0, total, chunk_size):
        chunk = [dict(r) for r in raw_rows[i:i+chunk_size]]
        post_batch(table, chunk)
        migrated += len(chunk)
        print(f'  -> {migrated}/{total} rows')

print(f'All tables migrated successfully in {time.time() - total_start:.2f} seconds!')
