import products from '../../data/products-current.json' with { type: 'json' };
import manifest from '../../public/catalog/manifest.json' with { type: 'json' };

const catalogMap = new Map(products.map((p) => [p.slug, p]));

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

  const ids = String(idsParam)
    .split(',')
    .filter((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))
    .slice(0, 100);

  if (!ids.length) {
    return res.status(200).json({
      version: req.query.v || manifest.version,
      products: []
    });
  }

  const matched = ids.map((id) => catalogMap.get(id)).filter(Boolean);

  return res.status(200).json({
    version: req.query.v || manifest.version,
    products: matched
  });
}
