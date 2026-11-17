import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class MockElement {
  constructor() {
    this.textContent = '';
    this.attributes = {};
    this.open = false;
    this.listeners = {};
    this.disabled = false;
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
  dispatchEvent(event) {
    for (const fn of this.listeners[event.type] || []) fn(event);
  }
  click() {
    this.dispatchEvent({ type: 'click', preventDefault() {} });
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
  getBoundingClientRect() {
    return { left: 0, right: 100, top: 0, bottom: 100 };
  }
}

function fixture({
  hostname = 'pxguide.honglabai.com',
  pathname = '/',
  search = '',
  standalone = false,
  hasPrompt = false
} = {}) {
  const button = new MockElement();
  const label = new MockElement();
  const guide = new MockElement();
  const instructions = new MockElement();

  const windowListeners = {};
  let currentHref = `https://${hostname}${pathname}${search}`;
  let replacedHref = null;
  const sharedUrls = [];

  const location = {
    hostname,
    pathname,
    search,
    hash: '',
    get href() { return currentHref; },
    set href(val) { currentHref = val; }
  };

  const history = {
    state: {},
    replaceState(state, title, url) {
      replacedHref = url;
      location.pathname = url.split('?')[0];
      location.search = url.includes('?') ? '?' + url.split('?')[1] : '';
    }
  };

  const window = {
    matchMedia: () => ({ matches: standalone }),
    addEventListener: (ev, fn, opts) => {
      windowListeners[ev] = windowListeners[ev] || [];
      windowListeners[ev].push(fn);
    },
    dispatchEvent: (ev) => {
      for (const fn of windowListeners[ev.type] || []) fn(ev);
    },
    location,
    history,
    navigator: {
      userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0 Mobile',
      standalone,
      share: async (obj) => { sharedUrls.push(obj.url); },
      serviceWorker: { register: async () => {} }
    }
  };

  const document = {
    querySelector: (sel) => {
      if (sel === '[data-install-button]') return button;
      if (sel === '[data-install-label]') return label;
      if (sel === '#install-guide') return guide;
      if (sel === '[data-install-instructions]') return instructions;
      return null;
    }
  };

  const scriptCode = fs.readFileSync('app-install.js', 'utf8');
  vm.runInNewContext(scriptCode, {
    window,
    document,
    location,
    history,
    navigator: window.navigator,
    URLSearchParams,
    URL,
    setTimeout: (fn) => fn(),
    console
  });

  return {
    button,
    label,
    guide,
    instructions,
    location,
    get replacedHref() { return replacedHref; },
    sharedUrls,
    firePrompt: () => {
      let promptCalled = false;
      const event = {
        type: 'beforeinstallprompt',
        preventDefault() {},
        prompt: async () => { promptCalled = true; },
        userChoice: Promise.resolve({ outcome: 'accepted' })
      };
      window.dispatchEvent(event);
      return () => promptCalled;
    }
  };
}

test('button on external host redirects to pxguide.honglabai.com with install=1', () => {
  const f = fixture({ hostname: 'px-guide-six.vercel.app', pathname: '/products/' });
  assert.equal(f.label.textContent, '홈 추가');
  f.button.click();
  assert.equal(f.location.href, 'https://pxguide.honglabai.com/products/?install=1');
});

test('button on localhost does not redirect away', () => {
  const f = fixture({ hostname: 'localhost', pathname: '/products/' });
  f.button.click();
  assert.equal(f.location.href, 'https://localhost/products/');
  assert.equal(f.guide.open, true);
});

test('button on pxguide.honglabai.com with prompt calls prompt', async () => {
  const f = fixture({ hostname: 'pxguide.honglabai.com' });
  const checkPrompt = f.firePrompt();
  f.button.click();
  await new Promise(r => setImmediate(r));
  assert.equal(checkPrompt(), true);
  assert.equal(f.guide.open, false);
});

test('button on pxguide.honglabai.com without prompt shows install guide', () => {
  const f = fixture({ hostname: 'pxguide.honglabai.com' });
  f.button.click();
  assert.equal(f.guide.open, true);
  assert.match(f.instructions.textContent, /앱 설치/);
});

test('redirect landing with install=1 cleans URL and opens guide or prompt', async () => {
  const f = fixture({ hostname: 'pxguide.honglabai.com', search: '?install=1' });
  assert.equal(f.replacedHref, '/');
  assert.equal(f.guide.open, true);
});

test('installed standalone app shares pxguide.honglabai.com link', async () => {
  const f = fixture({ hostname: 'pxguide.honglabai.com', standalone: true });
  assert.equal(f.label.textContent, '앱 공유');
  f.button.click();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(f.sharedUrls, ['https://pxguide.honglabai.com/']);
});
