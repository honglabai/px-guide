import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
export const dailyVisits = sqliteTable('daily_visits', {
  day: text('day').notNull(),
  visitor: text('visitor').notNull(),
}, (table) => [primaryKey({ columns: [table.day, table.visitor] })]);

export const coupangPriceCurrent = sqliteTable('coupang_price_current', {
  catalogProductKey: integer('catalog_product_key').references((): any => catalogProducts.id),
  productSlug: text('product_slug').primaryKey(),
  productId: text('product_id'),
  itemId: text('item_id'),
  vendorItemId: text('vendor_item_id'),
  normalizedName: text('normalized_name').notNull(),
  normalizedSpec: text('normalized_spec').notNull(),
  normalizedQuantity: text('normalized_quantity').notNull(),
  displayedPrice: integer('displayed_price').notNull(),
  comparisonQuantity: integer('comparison_quantity'),
  comparisonBasis: text('comparison_basis'),
  shippingFee: integer('shipping_fee'),
  seller: text('seller'),
  priceCondition: text('price_condition'),
  sourceUrl: text('source_url').notNull(),
  matchScore: integer('match_score').notNull(),
  checkedAt: text('checked_at').notNull(),
  lastHistoryId: integer('last_history_id').notNull(),
});

export const priceHistory = sqliteTable('price_history', {
  catalogProductKey: integer('catalog_product_key').references((): any => catalogProducts.id),
  id: integer('id').primaryKey({ autoIncrement: true }),
  productSlug: text('product_slug').notNull(),
  observationId: text('observation_id'),
  productId: text('product_id'),
  itemId: text('item_id'),
  vendorItemId: text('vendor_item_id'),
  entryKind: text('entry_kind').notNull(),
  originalHistoryId: integer('original_history_id'),
  attemptedAt: text('attempted_at').notNull(),
  observedAt: text('observed_at'),
  sourceUrl: text('source_url'),
  observedTitle: text('observed_title'),
  observedOption: text('observed_option'),
  observedSpec: text('observed_spec'),
  observedQuantity: text('observed_quantity'),
  observedPrice: integer('observed_price'),
  comparisonQuantity: integer('comparison_quantity'),
  comparisonBasis: text('comparison_basis'),
  searchCard: text('search_card'),
  shippingFee: integer('shipping_fee'),
  seller: text('seller'),
  priceCondition: text('price_condition'),
  matchScore: integer('match_score'),
  matchReasons: text('match_reasons'),
  hardMismatch: integer('hard_mismatch', { mode: 'boolean' }),
  changePercent: real('change_percent'),
  status: text('status').notNull(),
  reason: text('reason'),
  reviewer: text('reviewer'),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('price_history_product_time_idx').on(table.productSlug, table.attemptedAt),
  index('price_history_status_idx').on(table.status),
  uniqueIndex('price_history_observation_uidx').on(table.observationId),
]);

export const priceUpdateQueue = sqliteTable('price_update_queue', {
  catalogProductKey: integer('catalog_product_key').references((): any => catalogProducts.id),
  productSlug: text('product_slug').primaryKey(),
  status: text('status').notNull().default('PENDING'),
  priority: integer('priority').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptAt: text('last_attempt_at'),
  nextAttemptAt: text('next_attempt_at'),
  lockExpiresAt: text('lock_expires_at'),
  lastCheckedAt: text('last_checked_at'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('price_queue_ready_idx').on(table.status, table.nextAttemptAt, table.priority),
  index('price_queue_lock_idx').on(table.status, table.lockExpiresAt),
]);

export const productInterestDaily = sqliteTable('product_interest_daily', {
  catalogProductKey: integer('catalog_product_key').references((): any => catalogProducts.id),
  day: text('day').notNull(),
  productSlug: text('product_slug').notNull(),
  favoriteAdds: integer('favorite_adds').notNull().default(0),
  shoppingAdds: integer('shopping_adds').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.day, table.productSlug] }),
  index('product_interest_product_day_idx').on(table.productSlug, table.day),
]);

// Normalized product catalog. Existing Coupang vendor IDs retain their original meaning.
export const catalogCategories = sqliteTable('catalog_categories', {
 id: integer('id').primaryKey(), parentId: integer('parent_id').references((): any => catalogCategories.id), level: integer('level').notNull(), code: text('code').notNull().unique(), name: text('name').notNull(),
},t=>[check('catalog_category_shape',sql`length(${t.code})=${t.level}*2 AND ${t.code} NOT GLOB '*[^0-9]*' AND ${t.level} BETWEEN 1 AND 3`),check('catalog_category_parent',sql`(${t.level}=1 AND ${t.parentId} IS NULL) OR (${t.level}>1 AND ${t.parentId} IS NOT NULL)`)]);
export const catalogBrands = sqliteTable('catalog_brands', {id:integer('id').primaryKey(),name:text('name').notNull().unique()});
export const catalogProducts = sqliteTable('catalog_products', {
 id:integer('id').primaryKey(),slug:text('slug').notNull().unique(),name:text('name').notNull(),brandId:integer('brand_id').notNull().references(()=>catalogBrands.id),categoryId:integer('category_id').notNull().references(()=>catalogCategories.id),taxType:text('tax_type').notNull(),sortOrder:integer('sort_order').notNull(),visible:integer('visible').notNull(),
},t=>[index('catalog_product_category_idx').on(t.categoryId)]);
export const catalogCodes = sqliteTable('catalog_codes', {code:text('code').primaryKey(),productId:integer('product_id').notNull().references(()=>catalogProducts.id),categoryId:integer('category_id').notNull().references(()=>catalogCategories.id),isCurrent:integer('is_current').notNull()},t=>[uniqueIndex('catalog_one_current_code').on(t.productId).where(sql`${t.isCurrent} = 1`),check('catalog_code_shape',sql`length(${t.code})=12 AND ${t.code} NOT GLOB '*[^0-9]*' AND substr(${t.code},7,6)!='000000'`),check('catalog_code_active',sql`${t.isCurrent} IN (0,1)`)]);
export const catalogAliases = sqliteTable('catalog_aliases', {namespace:text('namespace').notNull(),identifier:text('identifier').notNull(),productId:integer('product_id').notNull().references(()=>catalogProducts.id)},t=>[primaryKey({columns:[t.namespace,t.identifier]}),index('catalog_alias_product_idx').on(t.productId)]);
export const catalogSequences = sqliteTable('catalog_sequences', {categoryId:integer('category_id').primaryKey().references(()=>catalogCategories.id),lastSequence:integer('last_sequence').notNull()});
export const catalogTexts = sqliteTable('catalog_texts', {id:integer('id').primaryKey(),value:text('value').notNull().unique()});
export const catalogRecords = sqliteTable('catalog_records', {productId:integer('product_id').notNull().references(()=>catalogProducts.id),kind:text('kind').notNull(),payload:text('payload').notNull()},t=>[primaryKey({columns:[t.productId,t.kind]})]);
export const catalogAssets = sqliteTable('catalog_assets', {productId:integer('product_id').notNull().references(()=>catalogProducts.id),kind:text('kind').notNull(),payload:text('payload').notNull()},t=>[primaryKey({columns:[t.productId,t.kind]})]);
export const catalogPrices = sqliteTable('catalog_prices', {productId:integer('product_id').notNull().references(()=>catalogProducts.id),kind:text('kind').notNull(),amount:real('amount').notNull()},t=>[primaryKey({columns:[t.productId,t.kind]})]);
export const catalogDocuments = sqliteTable('catalog_documents', {name:text('name').primaryKey(),payload:text('payload').notNull()});
export const catalogDiscounts = sqliteTable('catalog_discounts', {month:text('month').notNull(),productId:integer('product_id').notNull().references(()=>catalogProducts.id),regularPrice:real('regular_price'),salePrice:real('sale_price')},t=>[primaryKey({columns:[t.month,t.productId]})]);
export const catalogState = sqliteTable('catalog_state', {key:text('key').primaryKey(),value:text('value').notNull()});

// Reviewed merge recovery data. No runtime DDL or arbitrary SQL endpoint.
export const catalogMergeRuns = sqliteTable('catalog_merge_runs', {
 id:text('id').primaryKey(),fromVersion:text('from_version').notNull(),toVersion:text('to_version').notNull(),status:text('status').notNull(),guard:integer('guard').notNull(),createdAt:text('created_at').notNull(),appliedAt:text('applied_at'),
},t=>[check('catalog_merge_guard',sql`${t.guard}=1`),check('catalog_merge_status',sql`${t.status} IN ('prepared','applied')`)]);
export const catalogMergeArchive = sqliteTable('catalog_merge_archive', {
 batchId:text('batch_id').notNull().references(()=>catalogMergeRuns.id),tableName:text('table_name').notNull(),rowKey:text('row_key').notNull(),payload:text('payload').notNull(),
},t=>[primaryKey({columns:[t.batchId,t.tableName,t.rowKey]})]);

export const shoppingShares = sqliteTable('shopping_shares', {
 id:text('id').primaryKey(),items:text('items').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),creator:text('creator').notNull(),
},t=>[index('shopping_shares_creator_time_idx').on(t.creator,t.createdAt),index('shopping_shares_expiry_idx').on(t.expiresAt)]);

export const feedbackPosts = sqliteTable('feedback_posts', {
 id:text('id').primaryKey(),category:text('category').notNull(),title:text('title').notNull(),body:text('body').notNull(),nickname:text('nickname').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),deletedAt:integer('deleted_at'),editHash:text('edit_hash').notNull(),creator:text('creator').notNull(),
},t=>[index('feedback_posts_created_idx').on(t.createdAt,t.id),index('feedback_posts_creator_idx').on(t.creator,t.createdAt)]);
