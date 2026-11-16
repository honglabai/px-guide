(() => {
  const KEY = 'px-guide-favorites-v1', CART_KEY = 'px-guide-cart-v1', SHOP_KEY = 'px-guide-shopping-v1';
  const removedProducts = new Set(["catalog-36418","catalog-36420","catalog-37836","catalog-37838","catalog-32604","catalog-32606","catalog-32338","catalog-32340","catalog-32342","catalog-30326","catalog-32344","catalog-32346","catalog-30338","catalog-32350","catalog-32348","catalog-30348","catalog-32352","catalog-30354","catalog-6784","catalog-6782","catalog-6786","catalog-6790","catalog-6810"]);
  const normalizeSlug = slug => slug.startsWith('pxpick-') ? slug.slice(7) : slug;
  const $ = selector => document.querySelector(selector);
  const money = n => `${Math.round(n).toLocaleString('ko-KR')}원`;
  const quantity = n => Math.max(1, Math.min(99, Number.isFinite(Number(n)) ? Math.round(Number(n)) : 1));
  const parse = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  function readSaved() {
    const value = parse(KEY, []);
    return Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string').map(normalizeSlug).filter(slug=>!removedProducts.has(slug)))] : [];
  }
  function readRows(key) {
    const value = parse(key, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([slug])=>slug!=='__proto__'&&slug!=='constructor'&&!removedProducts.has(normalizeSlug(slug))).map(([slug, row]) => [normalizeSlug(slug), { qty: quantity(row?.qty), checked: row?.checked === true }])) : {};
  }
  let saved = readSaved(), cart = readRows(CART_KEY), shopping = readRows(SHOP_KEY), catalog = null;
  const selected = new Set();
  const favoriteList = $('#favorite-list'), shoppingList = $('#shopping-list');
  const notify = text => { const el = $('#favorite-message') || $('#shopping-message'); if (el) el.textContent = text; };
  const interestKey = 'px-guide-interest-day-v1';
  let interestPending = new Set();
  function recordInterest(slug, kind) {
    slug=window.pxResolveProductSlug?.(slug)||slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !['favorite','shopping'].includes(kind)) return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const event = `${slug}:${kind}`;
    let savedEvents;
    try { const value = JSON.parse(localStorage.getItem(interestKey) || 'null'); savedEvents = value?.day === day && Array.isArray(value.events) ? value.events : []; } catch (_) { savedEvents = []; }
    const pendingKey = `${day}:${event}`;
    if (savedEvents.includes(event) || interestPending.has(pendingKey)) return;
    interestPending.add(pendingKey);
    Promise.resolve(fetch('/api/interest', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({slug,kind}) }))
      .then(response => { if (!response.ok) return; try { const latest=JSON.parse(localStorage.getItem(interestKey) || 'null');const events=latest?.day===day && Array.isArray(latest.events) ? latest.events : [];localStorage.setItem(interestKey, JSON.stringify({day,events:[...new Set([...events,event])]})); } catch (_) {} })
      .catch(()=>{}).finally(()=>interestPending.delete(pendingKey));
  }
  function change(update) {
    const before = { saved: [...saved], cart: structuredClone(cart), shopping: structuredClone(shopping) };
    let old;
    try {
      old = [KEY, CART_KEY, SHOP_KEY].map(key => localStorage.getItem(key));
      update();
      localStorage.setItem(KEY, JSON.stringify(saved));
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      localStorage.setItem(SHOP_KEY, JSON.stringify(shopping));
    } catch (_) {
      saved = before.saved; cart = before.cart; shopping = before.shopping;
      if (old) { try { [KEY, CART_KEY, SHOP_KEY].forEach((key, i) => old[i] === null ? localStorage.removeItem(key) : localStorage.setItem(key, old[i])); } catch (_) {} }
      notify('목록을 저장할 수 없습니다. 브라우저 저장 공간 설정을 확인하세요.');
      if (!favoriteList && !shoppingList) alert('찜을 저장할 수 없습니다. 브라우저 저장 공간 설정을 확인하세요.');
      updateButtons(); render(); return false;
    }
    updateButtons(); render(); return true;
  }
  function updateButtons() {
    const set = new Set([...saved,...saved.map(s=>window.pxResolveProductSlug?.(s)||s)]);
    document.querySelectorAll('[data-favorite]').forEach(button => {
      const on = set.has(button.dataset.favorite);
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', `${button.dataset.favoriteName} ${on ? '찜 해제' : '찜하기'}`);
      const icon = button.querySelector('span[aria-hidden]'); if (icon) icon.textContent = on ? '♥' : '♡';
      const label = button.querySelector('[data-favorite-label]'); if (label) label.textContent = on ? '찜 해제' : '찜하기';
    });
    const shoppingSet=new Set(Object.keys(shopping).map(s=>window.pxResolveProductSlug?.(s)||s));
    document.querySelectorAll('[data-shopping-add]').forEach(button=>{
      const on=shoppingSet.has(window.pxResolveProductSlug?.(button.dataset.shoppingAdd)||button.dataset.shoppingAdd);
      button.setAttribute('aria-pressed',String(on));
      button.setAttribute('aria-label',`${button.dataset.shoppingName} ${on?'장바구니에서 빼기':'장바구니 담기'}`);
    });
    document.querySelectorAll('[data-favorite-count]').forEach(el => el.textContent = saved.length);
    document.querySelectorAll('[data-shopping-count]').forEach(el => el.textContent = Object.keys(shopping).length);
  }
  const rows = mode => (mode === 'shopping' ? Object.keys(shopping) : saved).map(slug => catalog.get(slug)).filter(Boolean);
  const rowState = (slug, mode) => (mode === 'shopping' ? shopping[slug] : cart[slug]) || { qty: 1, checked: false };
  const px = product => Number.isFinite(product.shoppingPrice) ? product.shoppingPrice : product.pxPrice;
  const currentOnline = p => {
    const current=window.pxCurrentPrices?.get(p.canonicalSlug||p.slug)?.comparisonUnitPrice;
    return Number.isFinite(current)&&current>0?current:Number.isFinite(p.officialPrice)&&p.officialPrice>0?p.officialPrice:null;
  };
  const comparable = p => Number.isFinite(px(p)) && currentOnline(p) > 0;
  const shoppingComparison = p => comparable(p) ? { price: currentOnline(p) } : null;
  function filtered(mode) {
    const query = $(`#${mode}-search`).value.trim().toLocaleLowerCase('ko-KR');
    const shown = rows(mode).filter(p => (p.name + ' ' + p.category).toLocaleLowerCase('ko-KR').includes(query));
    const sort = $(`#${mode}-sort`).value;
    if (sort === 'name') shown.sort((a,b)=>a.name.localeCompare(b.name,'ko-KR'));
    if (['price','price-low','price-high','discount-high','discount-low'].includes(sort)) {
      const discount = sort.startsWith('discount-');
      const value = p => discount ? (comparable(p) ? (currentOnline(p)-px(p))/currentOnline(p) : null) : (Number.isFinite(px(p)) ? px(p) : null);
      const direction = sort === 'price-high' || sort === 'discount-high' ? -1 : 1;
      shown.sort((a,b)=>{const av=value(a),bv=value(b);return av===null ? (bv===null?0:1) : bv===null ? -1 : direction*(av-bv);});
    }
    return shown;
  }
  function selectionControls() {
    if (!favoriteList || !catalog) return;
    const shown = filtered('favorite');
    const check = $('#favorite-select-all');
    check.checked = shown.length > 0 && shown.every(p=>selected.has(p.slug));
    check.indeterminate = shown.some(p=>selected.has(p.slug)) && !check.checked;
    check.disabled = !shown.length;
    $('#favorite-move-selected').disabled = selected.size === 0;
    $('#favorite-move-selected').textContent = selected.size ? `선택 ${selected.size}종 장바구니로` : '선택 상품 장바구니로';
    $('#favorite-move-all').disabled = saved.length === 0;
  }
  function updateTotals() {
    if (!catalog) return;
    if (favoriteList) {
      const products = rows('favorite');
      const total = products.reduce((sum,p)=>sum+(Number.isFinite(px(p)) ? px(p)*rowState(p.slug,'favorite').qty : 0),0);
      $('[data-favorite-summary]').textContent = `찜한 상품 ${products.length}종`;
      $('[data-favorite-total]').textContent = `예상 구매 금액 ${money(total)}`;
    }
    if (shoppingList) {
      const products = rows('shopping'), selectedProducts = products.filter(p=>shopping[p.slug].checked);
      const total = items => items.reduce((sum,p)=>sum+(Number.isFinite(px(p))?px(p)*shopping[p.slug].qty:0),0);
      const difference = products.reduce((sum,p)=>{
        const comparison=shoppingComparison(p);
        return sum+(comparison && Number.isFinite(px(p)) ? (comparison.price-px(p))*shopping[p.slug].qty : 0);
      },0);
      $('[data-shopping-selected]').textContent = money(total(selectedProducts));
      $('[data-shopping-total]').textContent = money(total(products));
      $('[data-shopping-saving]').textContent = money(difference);
      $('[data-shopping-remaining]').textContent = money(total(products.filter(p=>!shopping[p.slug].checked)));
      $('[data-shopping-progress]').textContent = `구매완료 ${products.filter(p=>shopping[p.slug].checked).length} / ${products.length}종 · ${products.reduce((sum,p)=>sum+shopping[p.slug].qty,0)}개`;
      $('#shopping-clear-completed').disabled = !products.some(p=>shopping[p.slug].checked);
      $('#shopping-clear').disabled = !products.length;
      if($('#shopping-share'))$('#shopping-share').disabled=!products.length;
    }
  }
  function node(tag, className, text) { const el=document.createElement(tag); if(className)el.className=className; if(text!==undefined)el.textContent=text;return el; }
  function action(label, key, slug) { const button=node('button','favorite-remove',label);button.type='button';button.dataset[key]=slug;return button; }
  function renderRows(mode) {
    const list = mode==='shopping'?shoppingList:favoriteList;
    if (!list || !catalog) return;
    const products = rows(mode), shown = filtered(mode);
    list.replaceChildren();
    const fragment=document.createDocumentFragment();
    for (const product of shown) {
      const slug=product.slug, current=rowState(slug,mode);
      const row=node('article',mode==='shopping'?'favorite-row receipt-row':'favorite-row'); row.dataset.slug=slug;
      if(mode==='shopping'&&current.checked)row.classList.add('is-checked');
      const check=node('input');check.type='checkbox';
      check.checked=mode==='shopping'?current.checked:selected.has(slug);
      check.dataset[mode==='shopping'?'shoppingCheck':'favoriteSelect']=slug;
      check.setAttribute('aria-label',`${product.name} ${mode==='shopping'?'구매 완료':'이동 선택'}`);
      const link=node(mode==='shopping'?'button':'a','favorite-row-link');
      if(mode==='shopping'){link.type='button';link.dataset.shoppingToggle=slug;link.setAttribute('aria-pressed',String(current.checked));link.setAttribute('aria-label',`${product.name} 구매완료 ${current.checked?'해제':'체크'}`);}
      else link.href=product.href||`/products/${encodeURIComponent(slug)}/`;
      const image=node('img');image.src=product.imageThumbUrl||product.imageUrl||'/images/home/image-pending.svg';image.alt='';image.loading='lazy';image.decoding='async';image.width=product.imageThumbWidth||64;image.height=product.imageThumbHeight||64;image.onerror=()=>{image.onerror=null;image.src='/images/home/image-pending.svg';};
      const info=node('span','favorite-row-info');info.title=product.name;info.append(node('strong',null,product.name));if(mode==='favorite')info.append(node('small',null,product.category));
      const price=node('span','favorite-row-price');
      price.append(node('strong',null,Number.isFinite(px(product))?money(px(product)*current.qty):'PX가 확인 중'));
      if(mode==='shopping') {
        price.classList.add('receipt-px');
        price.setAttribute('aria-label',`${product.priceBasis||'PX가'} ${Number.isFinite(px(product))?money(px(product)*current.qty):'확인 중'}`);
        price.title=`${product.priceBasis||'PX가'} · ${current.qty}개 합계`;
        const online=currentOnline(product);
        const reference=node('small','receipt-reference',online>0?money(online*current.qty):'—');
        reference.setAttribute('aria-label',`쿠팡가 ${reference.textContent}`);
        reference.title=`쿠팡가 · ${current.qty}개 합계`;
        const gap=comparable(product)?(online-px(product))*current.qty:null;
        const difference=gap===null?'':gap>0?`${money(gap)} 절약`:gap<0?`${money(-gap)} 추가 지출`:'가격 동일';
        link.append(image,info,reference,price,node('small','receipt-difference',difference));
      } else {
        price.append(node('small',null,product.priceBasis||'PX가'));
        link.append(image,info,price);
      }
      const label=node('div','favorite-quantity',mode==='favorite'?'수량 ':''), qty=node('input');qty.type='number';qty.min='1';qty.max='99';qty.inputMode='numeric';qty.value=current.qty;qty.dataset[mode==='shopping'?'shoppingQty':'favoriteQty']=slug;qty.setAttribute('aria-label',`${product.name} 수량`);
      {
        const stepper=node('span','quantity-stepper');
        const stepButton=(text,step)=>{const button=node('button','quantity-step-button',text);button.type='button';button.dataset[mode==='shopping'?'shoppingQtySlug':'favoriteQtySlug']=slug;button.dataset[mode==='shopping'?'shoppingQtyStep':'favoriteQtyStep']=String(step);button.setAttribute('aria-label',`${product.name} 수량 ${step<0?'감소':'증가'}`);button.disabled=step<0?current.qty<=1:current.qty>=99;return button;};
        stepper.append(stepButton('−',-1),qty,stepButton('+',1));label.append(stepper);
      }
      const actions=node('div','row-actions');
      if(mode==='favorite')actions.append(action('장바구니로','moveOne',slug),action('찜 해제','favorite',slug));
      else actions.append(action('삭제','shoppingRemove',slug));
      const remove=actions.querySelector('[data-favorite]');if(remove)remove.dataset.favoriteName=product.name;
      row.append(check,link,label,actions);
      fragment.append(row);
    }
    list.append(fragment);
    $(`#${mode}-empty`).hidden=products.length>0;
    $(`#${mode}-no-results`).hidden=products.length===0||shown.length>0;
    if(mode==='favorite') {
      $('#favorite-clear').hidden=products.length===0;
      selectionControls();
    }
  }
  function render() { renderRows('favorite');renderRows('shopping');updateTotals(); }
  function move(slugs) {
    const items=[...new Set(slugs)].filter(slug=>saved.includes(slug)&&catalog?.has(slug));
    if(!items.length)return;
    const additions=items.filter(slug=>!Object.hasOwn(shopping,slug));
    if(change(()=>{ for(const slug of items){if(!Object.hasOwn(shopping,slug))shopping[slug]={qty:rowState(slug,'favorite').qty,checked:false};delete cart[slug];} saved=saved.filter(slug=>!items.includes(slug)); })) {
      additions.forEach(slug=>recordInterest(slug,'shopping'));
      items.forEach(slug=>selected.delete(slug));selectionControls();notify(`${items.length}종을 장바구니로 옮겼습니다.`);
    }
  }
  updateButtons();
  document.addEventListener('px-catalog-rendered',updateButtons);
  document.addEventListener('px-prices-loaded',render);
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.shoppingAdd){
      const slug=window.pxResolveProductSlug?.(button.dataset.shoppingAdd)||button.dataset.shoppingAdd;
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||['constructor','prototype'].includes(slug))return;
      const existing=Object.keys(shopping).filter(s=>(window.pxResolveProductSlug?.(s)||s)===slug),adding=!existing.length;
      if(change(()=>{if(adding)shopping[slug]={qty:1,checked:false};else for(const key of existing)delete shopping[key];})){
        if(adding)recordInterest(slug,'shopping');
        notify(adding?'장바구니에 담았습니다.':'장바구니에서 뺐습니다.');
      }
      return;
    }
    if(button.dataset.shoppingToggle){
      const slug=button.dataset.shoppingToggle;if(!catalog?.has(slug)||!Object.hasOwn(shopping,slug))return;
      change(()=>{shopping[slug].checked=!shopping[slug].checked;});
      document.querySelector(`[data-shopping-toggle="${CSS.escape(slug)}"]`)?.focus({preventScroll:true});return;
    }
    if(button.dataset.favoriteQtyStep || button.dataset.shoppingQtyStep) {
      const mode=button.dataset.shoppingQtyStep?'shopping':'favorite';
      const slug=button.dataset[mode+'QtySlug'],step=Number(button.dataset[mode+'QtyStep']);
      if(button.disabled||!catalog?.has(slug)||![1,-1].includes(step)||(mode==='shopping'?!Object.hasOwn(shopping,slug):!saved.includes(slug)))return;
      change(()=>{const target=mode==='shopping'?shopping:cart;target[slug]={...rowState(slug,mode),qty:quantity(rowState(slug,mode).qty+step)};});
      document.querySelector(`[data-${mode}-qty-slug="${CSS.escape(slug)}"][data-${mode}-qty-step="${step}"]`)?.focus({preventScroll:true});
      return;
    }
    if(button.dataset.moveOne)return move([button.dataset.moveOne]);
    if(button.dataset.shoppingRemove) return change(()=>{delete shopping[button.dataset.shoppingRemove];});
    if(!button.dataset.favorite)return;
    const slug=button.dataset.favorite;
    const adding=!saved.includes(slug);
    if(change(()=>{saved=saved.includes(slug)?saved.filter(x=>x!==slug):[...saved,slug];if(!saved.includes(slug))delete cart[slug];})) { selected.delete(slug); if (adding) recordInterest(slug,'favorite'); }
    selectionControls();
  });
  let listLoadVersion=0;
  async function hydrateLists(){const version=++listLoadVersion;if(window.pxCatalogData&&catalog){const rows=await window.pxCatalogData.list([...saved,...Object.keys(shopping)]);if(version!==listLoadVersion)return false;for(const p of rows)catalog.set(p.slug,p);}return version===listLoadVersion;}
  window.addEventListener('storage',async event=>{if(event.key!==null&&![KEY,CART_KEY,SHOP_KEY].includes(event.key))return;saved=readSaved();cart=readRows(CART_KEY);shopping=readRows(SHOP_KEY);selected.clear();updateButtons();try{if(await hydrateLists()){render();window.pxLoadPrices?.([...new Set([...saved,...Object.keys(shopping)])]);}}catch{notify('상품 목록을 불러오지 못했습니다. 새로고침하세요.');}});
  for(const mode of ['favorite','shopping']) {
    const list=mode==='favorite'?favoriteList:shoppingList;if(!list)continue;
    $(`#${mode}-search`).addEventListener('input',render);
    $(`#${mode}-sort`).addEventListener('change',render);
    list.addEventListener('change',event=>{
      const input=event.target;
      if(input.dataset.favoriteSelect){if(input.checked)selected.add(input.dataset.favoriteSelect);else selected.delete(input.dataset.favoriteSelect);selectionControls();return;}
      if(input.dataset.shoppingCheck)return change(()=>{shopping[input.dataset.shoppingCheck].checked=input.checked;});
      const slug=input.dataset.favoriteQty||input.dataset.shoppingQty;if(!slug)return;
      change(()=>{const target=input.dataset.shoppingQty?shopping:cart;target[slug]={...rowState(slug,mode),qty:quantity(input.value)};});
    });
  }
  if(favoriteList) {
    $('#favorite-select-all').addEventListener('change',event=>{filtered('favorite').forEach(p=>event.target.checked?selected.add(p.slug):selected.delete(p.slug));renderRows('favorite');});
    $('#favorite-move-selected').addEventListener('click',()=>move([...selected]));
    $('#favorite-move-all').addEventListener('click',()=>move([...saved]));
    $('#favorite-clear').addEventListener('click',()=>{if(confirm('찜 목록을 모두 비울까요?')){if(change(()=>{saved=[];cart={};}))selected.clear();selectionControls();}});
    $('#favorite-import-button').addEventListener('click',()=>{
      const box=$('#favorite-import'),items=JSON.parse(box.dataset.items);
      const additions=items.filter(([slug])=>!saved.includes(slug)).map(([slug])=>slug);
      if(change(()=>{for(const [slug,qty]of items){if(!saved.includes(slug))saved.push(slug);cart[slug]={qty,checked:false};}})){additions.forEach(slug=>recordInterest(slug,'favorite'));box.hidden=true;history.replaceState(history.state,'','/favorites/');notify(`${items.length}종을 가져왔습니다.`);}
    });
    $('#favorite-import-dismiss').addEventListener('click',()=>{$('#favorite-import').hidden=true;history.replaceState(history.state,'','/favorites/');});
  }
  if(shoppingList) {
    $('#shopping-clear-completed').addEventListener('click',()=>{if(confirm('구매 완료한 상품을 목록에서 지울까요?'))change(()=>{shopping=Object.fromEntries(Object.entries(shopping).filter(([,row])=>!row.checked));});});
    $('#shopping-clear').addEventListener('click',()=>{if(confirm('장바구니를 모두 비울까요?'))change(()=>{shopping={};});});
  }
  if(favoriteList||shoppingList) {
    (window.pxCatalogData?window.pxCatalogData.list([...saved,...Object.keys(shopping)]):fetch('/favorites-data.json').then(response=>{if(!response.ok)throw Error('catalog unavailable');return response.json();})).then(async products=>{
      catalog=new Map(products.map(p=>[p.slug,p]));await hydrateLists();render();window.pxLoadPrices?.([...new Set([...saved,...Object.keys(shopping)])]);
      if(shoppingList&&$('#shopping-share')){
        const {setupShoppingShare}=await import('/shopping-share.js');
        const {mergeSharedItems}=await import('/shopping-share-model.js');
        setupShoppingShare({getItems:()=>filtered('shopping').map(p=>({slug:p.canonicalSlug||p.slug,name:p.name,qty:shopping[p.slug].qty,pxPrice:px(p)})),importItems:(items,products)=>{for(const p of products)catalog.set(p.slug,p);const ok=change(()=>{shopping=mergeSharedItems(shopping,items,s=>window.pxResolveProductSlug?.(s)||s);});if(ok)window.pxLoadPrices?.(Object.keys(shopping));return ok;}});
        $('#shopping-share').disabled=!rows('shopping').length;
      }

      const code=new URLSearchParams(location.search).get('list');if(!code||!favoriteList)return;
      try{
        if(code.length>12000)throw Error('large');
        const decoded=JSON.parse(atob(code.replaceAll('-','+').replaceAll('_','/')));
        if(!Array.isArray(decoded)||decoded.length>60)throw Error('invalid');
        const items=[...new Map(decoded.filter(item=>Array.isArray(item)&&item.length===2&&catalog.has(item[0])&&Number.isInteger(item[1])&&item[1]>=1&&item[1]<=99).map(([slug,qty])=>[slug,qty])).entries()];
        if(!items.length)throw Error('empty');const box=$('#favorite-import');box.dataset.items=JSON.stringify(items);box.hidden=false;box.querySelector('p').textContent=`공유된 ${items.length}종을 찜 목록에 추가할까요? 같은 상품은 공유 수량으로 바뀝니다.`;
      }catch(_){notify('공유 링크를 읽을 수 없습니다. 링크를 확인하세요.');}
    }).catch(()=>{const el=$('#favorite-empty')||$('#shopping-empty');el.hidden=false;el.querySelector('p').textContent='상품 목록을 불러오지 못했습니다. 새로고침하세요.';});
  }
})();
