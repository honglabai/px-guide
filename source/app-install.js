(() => {
  const button = document.querySelector('[data-install-button]');
  const label = document.querySelector('[data-install-label]');
  const guide = document.querySelector('#install-guide');
  const instructions = document.querySelector('[data-install-instructions]');
  if (!button || !label || !guide || !instructions) return;
  let installPrompt = null;
  let installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const targetHost = 'pxguide.honglabai.com';
  const appUrl = 'https://' + targetHost + '/';
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const isTargetHost = location.hostname === targetHost;

  const shareApp = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'PX 가이드', url: appUrl });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(appUrl);
      window.alert('앱 링크를 복사했습니다. 원하는 곳에 붙여넣어 전달해 주세요.');
    } catch {
      window.prompt('앱 링크를 복사해 전달해 주세요.', appUrl);
    }
  };

  const showGuide = message => {
    instructions.textContent = message;
    if (!guide.open) { if(window.pxNavigation)window.pxNavigation.openDialog(guide);else guide.showModal(); }
  };

  const update = () => {
    label.textContent = installed ? '앱 공유' : '홈 추가';
    button.setAttribute('aria-label', installed ? 'PX 가이드 앱 공유' : 'PX 가이드를 홈 화면에 추가');
    if (installed) {
      button.removeAttribute('aria-haspopup');
      button.removeAttribute('aria-controls');
    } else {
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'install-guide');
    }
  };

  const triggerInstall = async () => {
    if (installed) {
      await shareApp();
      return;
    }
    if (!isLocal && !isTargetHost) {
      const next = new URL(location.pathname + location.search + location.hash, 'https://' + targetHost);
      next.searchParams.set('install', '1');
      location.href = next.href;
      return;
    }
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      button.disabled = true;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        showGuide('브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택해 주세요.');
      } finally {
        button.disabled = false;
        update();
      }
      return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    showGuide(ios
      ? '공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택하고 “추가”를 눌러 주세요. 항목이 보이지 않으면 Safari에서 이 사이트를 열어 주세요.'
      : '브라우저 메뉴(⋮ 또는 ☰)에서 “앱 설치” 또는 “홈 화면에 추가”를 선택해 주세요. 항목이 보이지 않으면 Chrome이나 삼성 인터넷에서 이 사이트를 열어 주세요.');
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    update();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    update();
  });

  button.addEventListener('click', triggerInstall);

  guide.addEventListener('click', event => {
    const box = guide.getBoundingClientRect();
    if (event.target === guide && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) guide.close();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  update();

  const params = new URLSearchParams(location.search);
  if (params.get('install') === '1') {
    params.delete('install');
    const cleanUrl = location.pathname + (params.size ? '?' + params.toString() : '') + location.hash;
    history.replaceState(history.state, '', cleanUrl);
    if (installPrompt) {
      triggerInstall();
    } else {
      let promptHandled = false;
      const onPrompt = () => {
        if (!promptHandled) {
          promptHandled = true;
          triggerInstall();
        }
      };
      window.addEventListener('beforeinstallprompt', onPrompt, { once: true });
      setTimeout(() => {
        if (!promptHandled && !installed) {
          triggerInstall();
        }
      }, 600);
    }
  }
})();
