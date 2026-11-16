import { supabase } from '../_supabase.js';
import crypto from 'node:crypto';

const koreaDay = (date = new Date()) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const day = koreaDay();
  let visitor = null;
  let setCookieHeader = null;

  if (req.method === 'POST') {
    const cookieHeader = req.headers.cookie || '';
    const cookieMatch = cookieHeader.match(/(?:^|;\s*)px_visitor=([a-f0-9-]{36})(?:;|$)/);
    visitor = cookieMatch?.[1] || crypto.randomUUID();

    if (!cookieMatch) {
      const maxAge = Math.max(1, Math.ceil((Date.parse(day + 'T15:00:00Z') - Date.now()) / 1000));
      setCookieHeader = `px_visitor=${visitor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
    }
  }

  try {
    const { data, error } = await supabase.rpc('record_and_get_visits', {
      p_day: day,
      p_visitor: visitor
    });

    if (error) throw error;

    if (setCookieHeader) {
      res.setHeader('Set-Cookie', setCookieHeader);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Visitor counter error:', err);
    return res.status(503).json({ error: '집계 확인 중' });
  }
}
