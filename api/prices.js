import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slugsParam = req.query.slugs;
  if (!slugsParam) {
    return res.status(200).json({ prices: [] });
  }

  const slugs = String(slugsParam).split(',').filter((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)).slice(0, 100);
  if (!slugs.length) {
    return res.status(200).json({ prices: [] });
  }

  try {
    const { data: rows, error } = await supabase
      .from('coupang_price_current')
      .select('slug:product_slug, displayedPrice:displayed_price, comparisonQuantity:comparison_quantity, shippingFee:shipping_fee, sourceUrl:source_url, checkedAt:checked_at')
      .in('product_slug', slugs);

    if (error) throw error;

    const prices = (rows || []).map((row) => ({
      ...row,
      comparisonUnitPrice: row.displayedPrice && row.comparisonQuantity ? (row.displayedPrice / row.comparisonQuantity) : null
    }));

    return res.status(200).json({ prices });
  } catch (err) {
    console.error('Prices fetch error:', err);
    return res.status(200).json({ prices: [] });
  }
}
