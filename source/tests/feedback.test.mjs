import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/feedback.js';
import { handleFeedback } from '../worker/feedback.js';

for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']) {
  test(`retired feedback endpoint rejects ${method}`, async () => {
    const header = new Map();
    const body = handler({method}, { setHeader: (k,v) => header.set(k,v), status(code) { assert.equal(code,410); return this; }, json: value => value });
    assert.equal(header.get('Cache-Control'), 'no-store');
    assert.equal(body.contact, '/contact/');
    for (const path of ['/api/feedback?category=problem', '/api/feedback/old-post']) {
      const response = handleFeedback(new Request('https://example.test' + path, {method}));
      assert.equal(response.status, 410);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).contact, '/contact/');
    }
  });
}

test('does not intercept unrelated API routes', () => {
  assert.equal(handleFeedback(new Request('https://example.test/api/feedback-other')), null);
});
