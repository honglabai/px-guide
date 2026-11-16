const KST=9*3600000,DAY=86400000;
// Creation day + one day, at 23:59:00 in Asia/Seoul.
export const shareExpiresAt=createdAt=>Math.floor((createdAt+KST)/DAY)*DAY-KST+2*DAY-60000;
export function shareFileName(id,createdAt){
 const stamp=new Date(createdAt+KST).toISOString().replace(/[-:]/g,'').replace('T','_').replace('Z','').replace('.','_');
 return `PX_구매목록_${stamp}_${id}.json`;
}
// Apply the same next-day policy to older 30-day shares, outside schema migrations.
export async function cleanupShoppingShares(db,now=Date.now()){
 const expiry='(CAST((created_at + 32400000) / 86400000 AS INTEGER) * 86400000 + 140340000)';
 const results=await db.batch([
  db.prepare(`UPDATE shopping_shares SET expires_at = ${expiry} WHERE expires_at > ${expiry}`),
  db.prepare('DELETE FROM shopping_shares WHERE expires_at <= ?').bind(now),
 ]);
 const remaining=await db.prepare('SELECT COUNT(*) AS n FROM shopping_shares WHERE expires_at <= ?').bind(now).first();
 return {deleted:Number(results?.[1]?.meta?.changes||0),remainingExpired:Number(remaining?.n||0),checkedAt:new Date(now).toISOString()};
}
