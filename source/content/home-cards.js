// Start from the first character, move to the last, pause, then return.
(()=>{
  const titles=[...document.querySelectorAll('.home-item-title')];
  const measure=title=>{
    const text=title.querySelector('.home-title-text');
    const distance=Math.max(0,text.scrollWidth-title.clientWidth);
    title.classList.toggle('is-overflowing',distance>1);
    title.style.setProperty('--title-distance',distance+'px');
    title.style.setProperty('--title-duration',Math.max(8,distance/30+5)+'s');
  };
  const observer=new ResizeObserver(entries=>entries.forEach(entry=>measure(entry.target)));
  titles.forEach(title=>{measure(title);observer.observe(title)});
  if(document.fonts)document.fonts.ready.then(()=>titles.forEach(measure));
  const visible=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('offscreen',!entry.isIntersecting)));
  document.querySelectorAll('.home-item').forEach(card=>visible.observe(card));
})();
