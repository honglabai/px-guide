// Keep the old endpoints closed without accessing the database.
export function handleFeedback(request) {
  const { pathname } = new URL(request.url);
  if (pathname !== '/api/feedback' && !pathname.startsWith('/api/feedback/')) return null;
  return Response.json({ error: '공개 문의 게시판이 종료되었습니다.', contact: '/contact/' }, {
    status: 410, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  });
}
