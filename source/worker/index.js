import {handleFeedback} from './feedback.js';
import {handleShoppingShare} from './shopping-share.js';
import {handleCatalog} from '../catalog/http.mjs';
import productAliases from '../catalog/product-aliases.json' with {type:'json'};
import { handlePriceHttp, isOwner } from '../price/http.mjs';
import { handleMcp } from '../price/mcp.mjs';
export const koreaDay = (date = new Date()) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const feedback=await handleFeedback(request,env);if(feedback)return feedback;
    const shared=await handleShoppingShare(request,env);if(shared)return shared;
    const oldProduct=url.pathname.match(/^\/(?:products\/|monthly\/\d{4}-\d{2}\/items\/)([a-z0-9-]+)(?:\/index\.html|\/)?$/)?.[1];
    if(oldProduct&&Object.hasOwn(productAliases,oldProduct))return Response.redirect(new URL(`/products/${productAliases[oldProduct]}/${url.search}`,url),301);
    const catalogResponse=await handleCatalog(request,env);if(catalogResponse)return catalogResponse;
    if (url.pathname === '/admin/coupang-prices/' || url.pathname === '/admin/coupang-prices' || url.pathname === '/admin/coupang-prices/index.html') {
      if (!isOwner(request, env)) return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
      const response = await env.ASSETS.fetch(new Request(new URL('/admin/coupang-prices/index.html', url), request));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.pathname === '/mcp') return handleMcp(request, env);
    const priceResponse = await handlePriceHttp(request, env);
    if (priceResponse) return priceResponse;
    const formerProduct = url.pathname.match(/^\/products\/pxpick-(seoul-milk-2300|samdasu-green-500x20|shin-ramyun-120|otogi-rice-210|sparkle-water-500x20|maxim-mocha-gold-1200)\/?$/);
    if (formerProduct) return Response.redirect(new URL(`/products/${formerProduct[1]}/`, url), 301);
    if (url.pathname !== '/api/visitors/today') {
      const response = await env.ASSETS.fetch(request);
      if (((/^\/catalog\/index-[a-f0-9]{24}\.json$/.test(url.pathname) || url.pathname.startsWith('/images/products-optimized/')) || /^\/(images\/home|icons)\/[^/]+-optimized-v1-\d+\.(avif|webp)$/.test(url.pathname)) && response.ok) {
        const cached = new Response(response.body, response);
        cached.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return cached;
      }
      return response;
    }
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (!['GET', 'POST'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
    if (request.method === 'POST' && (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && ![url.origin, 'https://px-monthly-guide-2026.zeromorow.chatgpt.site'].includes(request.headers.get('origin'))))) return new Response(null, { status: 403, headers });
    try {
      const day = koreaDay();
      if (request.method === 'POST') {
        const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)px_visitor=([a-f0-9-]{36})(?:;|$)/)?.[1];
        const visitor = cookie || crypto.randomUUID();
        await env.DB.prepare('INSERT OR IGNORE INTO daily_visits (day, visitor) VALUES (?, ?)').bind(day, visitor).run();
        if (!cookie) headers['Set-Cookie'] = `px_visitor=${visitor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(1, Math.ceil((Date.parse(day + 'T15:00:00Z') - Date.now()) / 1000))}`;
      }
      const result = await env.DB.prepare('SELECT COUNT(*) AS total, COUNT(CASE WHEN day = ? THEN 1 END) AS today FROM daily_visits').bind(day).first();
      return Response.json({ day, count: Number(result?.today || 0), total: Number(result?.total || 0) }, { headers });
    } catch (error) {
      console.error('Daily visitor count unavailable', error);
      return Response.json({ error: '집계 확인 중' }, { status: 503, headers });
    }
  },
};
