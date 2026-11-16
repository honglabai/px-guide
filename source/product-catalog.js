import { productCard, productGroup, productSubcategory, comparisonPrice } from './product-ui.mjs';
(() => {
  const $=s=>document.querySelector(s), grid=$('.product-list');if(!grid)return;
  const tabs=[...document.querySelectorAll('.category-tabs [role=tab]')], search=$('.shop-search input'), sort=$('#product-sort'),summary=$('#product-results'),pagination=$('#product-pagination'),empty=$('.category-empty');
  const money=n=>Number.isFinite(n)?`${n.toLocaleString('ko-KR')}원`:'확인 중';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials=text=>[...text.replace(/\s+/g,'')].map(ch=>{const n=ch.charCodeAt(0)-44032;return n>=0&&n<11172?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:ch;}).join('');
  let active=tabs[0],page=1,products=null,hydrateToken=0;
  const subcategories=$('#product-subcategories');
  let subcategory=new URLSearchParams(location.search).get('subcategory')||'';
  const requestedCategory=new URLSearchParams(location.search).get('category');
  if(requestedCategory)active=tabs.find(t=>t.dataset.category===requestedCategory)||active;
  tabs.forEach(t=>{t.setAttribute('aria-selected',String(t===active));t.tabIndex=t===active?0:-1;});
  $('#product-panel').setAttribute('aria-labelledby',active.id);
  function syncUrl(push=true){
    const params=new URLSearchParams();if(active.dataset.category!=='전체')params.set('category',active.dataset.category);if(subcategory)params.set('subcategory',subcategory);if(group)params.set('group',group);if(search.value.trim())params.set('q',search.value.trim());if(sort.value!=='registered')params.set('sort',sort.value);if(page>1)params.set('page',page);
    const url=location.pathname+(params.size?'?'+params.toString():'');
    if(window.pxNavigation)window.pxNavigation.commitView(url,{replace:!push});
    else history[push&&history.pushState?'pushState':'replaceState']({...history.state},'',url);
  }
  function restoreView(){
    const params=new URLSearchParams(location.search);active=tabs.find(t=>t.dataset.category===params.get('category'))||tabs[0];subcategory=params.get('subcategory')||'';group=params.get('group')||'';search.value=params.get('q')||'';
    sort.value=['registered','price-low','price-high','discount','sales'].includes(params.get('sort'))?params.get('sort'):'registered';
    page=Math.max(1,Math.floor(Number(params.get('page')))||1);
    tabs.forEach(t=>{t.setAttribute('aria-selected',String(t===active));t.tabIndex=t===active?0:-1;});$('#product-panel').setAttribute('aria-labelledby',active.id);
  }
  function renderSubcategories(){
    const counts=new Map();const scoped=products.filter(p=>active.dataset.category==='전체'||active.dataset.category===p.category);
    for(const p of scoped)counts.set(p.subcategory,(counts.get(p.subcategory)||0)+1);
    if(subcategory&&!counts.has(subcategory))subcategory='';
    subcategories.replaceChildren();
    for(const [label,count]of [['전체',scoped.length],...[...counts].sort(([a],[b])=>a==='기타'?1:b==='기타'?-1:a.localeCompare(b,'ko-KR'))]){
      const option=document.createElement('option');option.value=label==='전체'?'':label;option.textContent=label+' '+count.toLocaleString('ko-KR');subcategories.append(option);
    }
    subcategories.value=subcategory;
  }
  let group=new URLSearchParams(location.search).get('group')||'';
  restoreView();
  search.setAttribute('aria-controls','product-panel');
  const current=p=>comparisonPrice({...p,currentPrice:typeof window!=='undefined'?window.pxCurrentPrices?.get(p.slug)?.comparisonUnitPrice:null});
  const eligible=p=>Number.isFinite(p.pxPrice)&&current(p)>0;
  const rate=p=>eligible(p)?(current(p)-p.pxPrice)/current(p)*100:null;
  const savings=p=>!eligible(p)?'쿠팡 확인가 없음':current(p)>p.pxPrice?`${Math.round(rate(p))}% 저렴 · ${money(current(p)-p.pxPrice)} 차이`:current(p)<p.pxPrice?`${money(p.pxPrice-current(p))} 높음`:'가격 동일';
  function render(){
    if(!products)return;
    renderSubcategories();
    const query=search.value.trim().normalize('NFC').toLocaleLowerCase('ko-KR');
    const matches=products.filter(p=>(active.dataset.category==='전체'||active.dataset.category===p.category)&&(!subcategory||p.subcategory===subcategory)&&(!group||productGroup(p)===group)&&(!query||p.search.includes(query)||(/^[ㄱ-ㅎ\s]+$/.test(query)&&initials(p.search).includes(initials(query)))));
    matches.sort((a,b)=>{if(sort.value==='registered')return a.order-b.order;if(sort.value.startsWith('price-'))return (a.pxPrice===null?1:b.pxPrice===null?-1:(sort.value==='price-low'?a.pxPrice-b.pxPrice:b.pxPrice-a.pxPrice))||a.order-b.order;const ar=rate(a),br=rate(b);return (ar===null?br===null?0:1:br===null?-1:br-ar)||a.order-b.order;});
    const pages=Math.ceil(matches.length/10);page=Math.max(1,Math.min(page,pages||1));
    const token=++hydrateToken,shown=matches.slice((page-1)*10,page*10);
    if(window.pxCatalogData&&shown.some(p=>!p._catalogFull)){window.pxCatalogData.products(shown.map(p=>p.slug)).then(rows=>{const loaded=new Map(rows.map(p=>[p.slug,p]));if(shown.some(p=>!loaded.has(p.slug)))throw Error('Incomplete catalog');for(const p of products){const full=loaded.get(p.slug);if(full)Object.assign(p,full,{_catalogFull:true});}if(token===hydrateToken)render();}).catch(()=>{if(token===hydrateToken)summary.textContent='전체 목록을 불러오지 못했습니다. 새로고침해 주세요.';});return;}
    grid.innerHTML=matches.slice((page-1)*10,page*10).map(p=>productCard({...p,currentPrice:current(p),currentStatus:typeof window!=='undefined'&&window.pxPriceStatus?.(p.slug)})).join('');
    grid.querySelectorAll('img').forEach(image=>image.onerror=()=>{image.onerror=null;image.removeAttribute('srcset');image.src='/images/home/image-pending.svg';});
    document.dispatchEvent(new Event('px-catalog-rendered'));
    if(!window.pxCatalogReady){window.pxCatalogReady=true;document.dispatchEvent(new Event('px-catalog-ready'));}
    if(typeof window!=='undefined')window.pxLoadPrices?.(matches.slice((page-1)*10,page*10).map(p=>p.slug));
    empty.hidden=matches.length>0;empty.textContent='조건에 맞는 상품이 없습니다. 다른 소분류를 선택하거나 검색어를 변경하세요.';
    summary.textContent=matches.length?`${active.dataset.category!=='전체'?active.dataset.category+' · ':''}${subcategory?subcategory+' · ':group?group+' · ':''}${matches.length.toLocaleString('ko-KR')}개 상품 중 ${(page-1)*10+1}–${Math.min(page*10,matches.length)}개 표시`:'검색 결과 0개';
    $('#product-sort-note').hidden=sort.value!=='sales';pagination.hidden=pages<=1;pagination.replaceChildren();
    if(pages>1){
      function button(label,target,disabled){const el=document.createElement('button');el.type='button';el.textContent=label;el.disabled=disabled;el.setAttribute('aria-label',label==='‹'?'이전 페이지':label==='›'?'다음 페이지':label+'페이지');if(target===page&&/^\d+$/.test(label))el.setAttribute('aria-current','page');el.onclick=()=>{page=target;syncUrl();render();$('.category-tabs').scrollIntoView({block:'start',behavior:'smooth'});};pagination.append(el);}
      button('‹',page-1,page===1);
      const visible=pages<=7?Array.from({length:pages},(_,i)=>i+1):[...new Set([1,pages,page-1,page,page+1,...(page<=3?[2,3,4]:page>=pages-2?[pages-3,pages-2,pages-1]:[])])].filter(i=>i>=1&&i<=pages).sort((a,b)=>a-b);
      visible.forEach((i,index)=>{if(index&&i-visible[index-1]>1){const dots=document.createElement('span');dots.textContent='…';pagination.append(dots);}button(String(i),i,false);});button('›',page+1,page===pages);
    }
  }
  function select(tab,focus){active=tab;group='';subcategory='';page=1;syncUrl();tabs.forEach(t=>{t.setAttribute('aria-selected',String(t===tab));t.tabIndex=t===tab?0:-1;});$('#product-panel').setAttribute('aria-labelledby',tab.id);render();if(focus)tab.focus();}
  tabs.forEach((tab,i)=>{tab.onclick=()=>select(tab);tab.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;select(tabs[next],true);}};});
  subcategories.onchange=()=>{subcategory=subcategories.value;group='';page=1;syncUrl();render();};
  let editingSearch=false;search.onfocus=()=>{editingSearch=false;};search.onchange=()=>{editingSearch=false;};
  search.oninput=()=>{page=1;syncUrl(!editingSearch);editingSearch=true;render();};sort.onchange=()=>{page=1;syncUrl();render();};
  window.addEventListener?.('popstate',()=>{restoreView();editingSearch=false;render();document.dispatchEvent(new Event('px-catalog-ready'));});
  document.addEventListener?.('px-prices-loaded',render);
  (window.pxCatalogData?window.pxCatalogData.catalog():fetch('/favorites-data.json').then(r=>{if(!r.ok)throw Error('catalog unavailable');return r.json();})).then(data=>{products=data.filter(p=>p.catalogVisible!==false).map((p,order)=>({...p,order,subcategory:productSubcategory(p),search:String(p.name||'').normalize('NFC').toLocaleLowerCase('ko-KR')}));render();if(typeof window!=='undefined')(window.pxLoadPriceIndex||window.pxLoadPrices)?.(products.map(p=>p.slug));}).catch(()=>{summary.textContent='전체 목록을 불러오지 못했습니다. 새로고침해 주세요.';});
})();
