import { supabase } from './_supabase.js';

const koreaDay = (date = new Date()) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, kind } = req.body || {};
  if (!slug || !['favorite', 'shopping'].includes(kind)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const day = koreaDay();
    await supabase.rpc('upsert_product_interest', {
      p_day: day,
      p_slug: slug,
      p_kind: kind
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Interest recording error:', err);
    return res.status(200).json({ ok: false });
  }
}
