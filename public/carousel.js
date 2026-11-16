(() => {
  const root = document.querySelector('[data-shuffle]');
  if (!root) return;
  const track = root.querySelector('.shuffle-track');
  const slides = [...track.children];
  const dots = document.createElement('div');
  dots.className = 'shuffle-dots'; dots.setAttribute('aria-label', '배너 선택');
  root.append(dots);
  let index = 0, timer, start = null, dragged = false, paused = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buttons = slides.map((slide, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('aria-label', `${i + 1}번째 배너 보기`);
    button.onclick = () => { show(i); schedule(); };
    dots.append(button); return button;
  });
  function show(next) {
    index = (next + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, i) => { slide.inert = i !== index; slide.setAttribute('aria-hidden', String(i !== index)); });
    buttons.forEach((button, i) => { button.setAttribute('aria-current', String(i === index)); });
  }
  function schedule() {
    clearTimeout(timer);
    if (!reduced && !paused && !document.hidden) timer = setTimeout(() => { show(index + 1); schedule(); }, 2000);
  }
  root.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; start = { x: e.clientX, y: e.clientY }; dragged = false; clearTimeout(timer); });
  root.addEventListener('pointermove', e => { if (start && Math.abs(e.clientX - start.x) > 10) dragged = true; });
  root.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { dragged = true; show(index + (dx < 0 ? 1 : -1)); }
    start = null; schedule();
  });
  root.addEventListener('pointercancel', () => { start = null; schedule(); });
  root.addEventListener('dragstart', e => e.preventDefault());
  root.addEventListener('click', e => { if (dragged) { e.preventDefault(); dragged = false; } }, true);
  root.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show(index + (e.key === 'ArrowRight' ? 1 : -1)); schedule(); } });
  root.addEventListener('focusin', () => { paused = true; clearTimeout(timer); });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { paused = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);
  show(0); schedule();
})();
