// The public board is retired. Do not read or modify historical data.
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(410).json({ error: '공개 문의 게시판이 종료되었습니다.', contact: '/contact/' });
}
