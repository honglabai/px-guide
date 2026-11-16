// Always request current prices and visitor counts from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PX 가이드</title><body style="font-family:system-ui;padding:24px"><h1>인터넷 연결을 확인해 주세요</h1><p>최신 PX 상품과 가격을 확인하려면 인터넷 연결이 필요합니다.</p><button onclick="location.reload()">다시 시도</button></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )));
});
