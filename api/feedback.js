import { supabase } from './_supabase.js';
import crypto from 'node:crypto';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex'
};

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
const validId = (id) => /^[a-f0-9]{64}$/.test(id);

function feedbackInput(data) {
  if (!data || typeof data !== 'object') throw Error('내용을 확인하세요.');
  const text = (key, max, required = true) => {
    if (typeof data[key] !== 'string') throw Error('내용을 확인하세요.');
    const value = data[key].trim();
    if ((required && !value) || value.length > max) throw Error('입력한 글자 수를 확인하세요.');
    return value;
  };
  const category = text('category', 20),
    title = text('title', 100),
    body = text('body', 4000),
    nickname = text('nickname', 20, false) || '익명';
  if (!['problem', 'suggestion', 'question'].includes(category)) throw Error('문의 유형을 선택하세요.');
  return { category, title, body, nickname };
}

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }

  const id = req.query.id ? String(req.query.id) : '';

  if (id && !validId(id)) {
    return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  }

  try {
    if (req.method === 'GET') {
      if (id) {
        const { data: post, error } = await supabase
          .from('feedback_posts')
          .select('id, category, title, body, nickname, createdAt:created_at, updatedAt:updated_at')
          .eq('id', id)
          .is('deleted_at', null)
          .maybeSingle();

        if (error) throw error;
        if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        return res.status(200).json({ post });
      }

      const category = (req.query.category || '').toString();
      const cursor = (req.query.before || '').toString();

      if ((category && !['problem', 'suggestion', 'question'].includes(category)) || (cursor && !/^\d{13}_[a-f0-9]{64}$/.test(cursor))) {
        return res.status(400).json({ error: '검색 조건을 확인하세요.' });
      }

      let query = supabase
        .from('feedback_posts')
        .select('id, category, title, nickname, createdAt:created_at, updatedAt:updated_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(21);

      if (category) {
        query = query.eq('category', category);
      }

      if (cursor) {
        const [timeStr, key] = cursor.split('_');
        const time = Number(timeStr);
        query = query.or(`created_at.lt.${time},and(created_at.eq.${time},id.lt.${key})`);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      const posts = (rows || []).slice(0, 20);
      const last = posts.at(-1);
      const nextCursor = (rows || []).length > 20 && last ? `${last.createdAt}_${last.id}` : null;

      return res.status(200).json({ posts, nextCursor });
    }

    if (!['POST', 'PATCH', 'DELETE'].includes(req.method) || (req.method === 'POST' && id) || (req.method !== 'POST' && !id)) {
      return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
    }

    if (req.method === 'POST') {
      let data;
      try {
        data = feedbackInput(req.body);
      } catch {
        return res.status(400).json({ error: '유형·제목(100자)·내용(4,000자)·별명(20자)을 확인하세요.' });
      }

      const now = Date.now();
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
      const creator = hash(`${ip}:${Math.floor(now / 86400000)}`);
      const editToken = random();
      const key = random();
      const editHash = hash(editToken);

      const { data: rpcResult, error } = await supabase.rpc('submit_feedback_post', {
        p_id: key,
        p_category: data.category,
        p_title: data.title,
        p_body: data.body,
        p_nickname: data.nickname,
        p_edit_hash: editHash,
        p_creator: creator,
        p_now: now
      });

      if (error) throw error;
      if (rpcResult?.error) {
        return res.status(rpcResult.status || 429).json({ error: rpcResult.error });
      }

      return res.status(201).json({ id: key, editToken });
    }

    // PATCH or DELETE
    const authHeader = req.headers.authorization || '';
    const tokenMatch = authHeader.match(/^Bearer ([a-f0-9]{64})$/);
    if (!tokenMatch) {
      return res.status(403).json({ error: '작성한 브라우저에서만 수정·삭제할 수 있습니다.' });
    }

    const digest = hash(tokenMatch[1]);
    const { data: own, error: ownErr } = await supabase
      .from('feedback_posts')
      .select('id')
      .eq('id', id)
      .eq('edit_hash', digest)
      .is('deleted_at', null)
      .maybeSingle();

    if (ownErr) throw ownErr;
    if (!own) {
      return res.status(403).json({ error: '수정·삭제 권한이 없거나 삭제된 글입니다.' });
    }

    if (req.method === 'DELETE') {
      const { error: delErr } = await supabase
        .from('feedback_posts')
        .update({ deleted_at: Date.now() })
        .eq('id', id)
        .eq('edit_hash', digest);

      if (delErr) throw delErr;
      return res.status(200).json({ ok: true });
    } else {
      let data;
      try {
        data = feedbackInput(req.body);
      } catch {
        return res.status(400).json({ error: '입력 내용을 확인하세요.' });
      }

      const { error: updErr } = await supabase
        .from('feedback_posts')
        .update({
          category: data.category,
          title: data.title,
          body: data.body,
          nickname: data.nickname,
          updated_at: Date.now()
        })
        .eq('id', id)
        .eq('edit_hash', digest)
        .is('deleted_at', null);

      if (updErr) throw updErr;
      return res.status(200).json({ ok: true });
    }
  } catch (error) {
    console.error('Feedback board error:', error);
    return res.status(503).json({ error: '게시판을 불러오거나 저장하지 못했습니다. 잠시 후 다시 시도하세요.' });
  }
}
