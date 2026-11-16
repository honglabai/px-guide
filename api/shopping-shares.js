import { supabase } from './_supabase.js';
import crypto from 'node:crypto';

const KST = 9 * 3600000;
const DAY = 86400000;

export const shareExpiresAt = (createdAt) => Math.floor((createdAt + KST) / DAY) * DAY - KST + 2 * DAY - 60000;

export function shareFileName(id, createdAt) {
  const stamp = new Date(createdAt + KST).toISOString().replace(/[-:]/g, '').replace('T', '_').replace('Z', '').replace('.', '_');
  return `PX_구매목록_${stamp}_${id}.json`;
}

export function validateSharedItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 2500) throw Error('invalid');
  const seen = new Set();
  return items.map((row) => {
    if (
      !row ||
      typeof row.slug !== 'string' ||
      row.slug.length > 120 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ||
      ['constructor', 'prototype'].includes(row.slug) ||
      seen.has(row.slug) ||
      !Number.isInteger(row.qty) ||
      row.qty < 1 ||
      row.qty > 99
    ) {
      throw Error('invalid');
    }
    seen.add(row.slug);
    return { slug: row.slug, qty: row.qty };
  });
}

const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow'
};

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }

  const id = req.query.id ? String(req.query.id) : '';

  try {
    if (req.query.maintenance === '1') {
      const now = Date.now();
      const { data: delData, error: delErr } = await supabase
        .from('shopping_shares')
        .delete()
        .lte('expires_at', now);
      return res.status(200).json({ ok: true, checkedAt: new Date(now).toISOString() });
    }

    if (req.method === 'GET') {
      if (!id || !/^[a-f0-9]{64}$/.test(id)) {
        return res.status(404).json({ error: '목록을 찾을 수 없습니다.' });
      }

      const { data: row, error } = await supabase
        .from('shopping_shares')
        .select('items, created_at, expires_at')
        .eq('id', id)
        .gt('expires_at', Date.now())
        .maybeSingle();

      if (error) throw error;
      if (!row) return res.status(404).json({ error: '공유 목록이 없거나 유효기간이 지났습니다.' });

      const expiresAt = Math.min(Number(row.expires_at), shareExpiresAt(Number(row.created_at)));
      if (expiresAt <= Date.now()) {
        await supabase.from('shopping_shares').delete().eq('id', id);
        return res.status(404).json({ error: '공유 목록의 유효기간이 지나 삭제되었습니다.' });
      }

      const fileName = shareFileName(id, Number(row.created_at));
      const data = {
        id,
        fileName,
        items: validateSharedItems(JSON.parse(row.items)),
        createdAt: Number(row.created_at),
        expiresAt
      };

      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      }

      return res.status(200).json(data);
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
    }

    let items;
    try {
      items = validateSharedItems(req.body?.items);
    } catch {
      return res.status(400).json({ error: '상품 목록을 확인하세요.' });
    }

    const now = Date.now();
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    const creator = crypto.createHash('sha256').update(`${ip}:${Math.floor(now / 86400000)}`).digest('hex');
    const newId = crypto.randomBytes(32).toString('hex');
    const expires = shareExpiresAt(now);

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_shopping_share', {
      p_id: newId,
      p_items: JSON.stringify(items),
      p_creator: creator,
      p_now: now,
      p_expires_at: expires
    });

    if (rpcErr) throw rpcErr;
    if (rpcRes?.error) {
      return res.status(rpcRes.status || 429).json({ error: rpcRes.error });
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || '';
    const origin = `${protocol}://${host}`;

    return res.status(201).json({
      id: newId,
      fileName: shareFileName(newId, now),
      url: `${origin}/shopping/?share=${newId}`,
      expiresAt: expires
    });
  } catch (err) {
    console.error('Shopping share error:', err);
    return res.status(503).json({ error: '구매목록을 불러오거나 저장하지 못했습니다. 잠시 후 다시 시도하세요.' });
  }
}
