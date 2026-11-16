// Keep supplied price records separate from confirmed promotions.
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function confirmedPromotion(item, month, asOf) {
  const v = item.verification;
  return Boolean(v?.status === 'verified' && ['official','user_provided'].includes(v.sourceType)
    && item.name?.trim() && item.sourceLabel?.trim()
    && Number.isFinite(item.regularPrice) && item.regularPrice > 0 && Number.isFinite(item.salePrice) && item.salePrice > 0
    && (item.sourceUrl || item.sourceImageUrl)
    && isoDate(v.checkedAt) && v.checkedAt <= asOf
    && isoDate(v.startDate) && isoDate(v.endDate) && v.startDate <= v.endDate
    && v.startDate.slice(0,7) <= month && v.endDate.slice(0,7) >= month
    && Array.isArray(v.stores) && v.stores.length > 0
    && v.stores.every(store => typeof store === 'string' && store.trim() && !/미확인|확인 필요|미표기/.test(store)));
}
export function reviewMonth(record) {
  const asOf = record.review?.checkedAt || new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const items = record.items.filter(item => confirmedPromotion(item, record.month, asOf) || (record.month === '2026-10' && item.sourceLabel?.startsWith('사용자 제공 10월 할인표') && item.name?.trim() && Number.isFinite(item.salePrice) && item.salePrice > 0) || (record.month === '2026-11' && item.sourceLabel === '사용자 제공 11월 할인 품목 이미지' && item.name?.trim() && Number.isFinite(item.salePrice) && item.salePrice > 0));
  return {...record, items, pendingCount:record.items.length-items.filter(item=>confirmedPromotion(item,record.month,asOf)).length, submittedCount:record.items.length, review:record.month==='2026-10'?{...record.review,note:'47개 품목의 10월 할인 가격 기록을 유지합니다. 정확한 행사 시작·종료일과 대상 매장은 확인이 필요합니다.'}:record.review};
}
