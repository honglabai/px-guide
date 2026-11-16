(() => {
  const counter = document.querySelector('[data-visitor-count]');
  const total = document.querySelector('[data-visitor-total]');
  if (!counter || !total) return;
  let pending = false;
  let day = '';
  const koreaDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  async function update() {
    if (pending || document.visibilityState === 'hidden') return;
    pending = true;
    try {
      const today = koreaDay();
      const response = await fetch('/api/visitors/today', { method: day === today ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (![data.count, data.total].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('invalid');
      day = data.day;
      counter.textContent = data.count.toLocaleString('ko-KR');
      total.textContent = data.total.toLocaleString('ko-KR');
    } catch {
      if (!day) { counter.textContent = '—'; total.textContent = '—'; }
    } finally { pending = false; }
  }
  update();
  setInterval(update, 60000);
  document.addEventListener('visibilitychange', update);
})();
