import { supabase } from '../_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const idsParam = req.query.ids;
  if (!idsParam) {
    return res.status(400).json({ error: 'Missing ids parameter' });
  }

  const ids = String(idsParam).split(',').filter((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)).slice(0, 100);
  if (!ids.length) {
    return res.status(200).json({ products: [] });
  }

  try {
    const { data: products, error } = await supabase
      .from('catalog_products')
      .select('id, slug, name, brandId:brand_id, categoryId:category_id, taxType:tax_type, sortOrder:sort_order, visible')
      .in('slug', ids);

    if (error) throw error;

    return res.status(200).json({
      version: req.query.v || 'current',
      products: products || []
    });
  } catch (err) {
    console.error('Catalog products error:', err);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
}
