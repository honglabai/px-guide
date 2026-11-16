const list = document.querySelector('#price-review-list');
const status = document.querySelector('#price-review-status');
const previous = document.querySelector('#price-review-prev');
const next = document.querySelector('#price-review-next');
const page = document.querySelector('#price-review-page');
let offset = 0;
const limit = 100;
const money = value => Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : '없음';
const labels = {
  PENDING:'수집 대기', RUNNING:'확인 중', RETRY:'재시도 대기', REVIEW:'수동 검토',
  REVERIFY:'재확인', BLOCKED:'차단', DONE:'완료', ACCEPT:'승인 완료', REJECT:'거절 완료'
};
const field = (label, value) => {
  const wrapper=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');
  term.textContent=label;detail.textContent=value == null || value === '' ? '정보 없음' : String(value);
  wrapper.append(term,detail);return wrapper;
};
const sourceField = value => {
  const wrapper=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');
  term.textContent='출처';
  const source=document.createElement('a');
  try { const url=new URL(value);if(url.protocol==='https:' && (url.hostname==='coupang.com'||url.hostname.endsWith('.coupang.com'))) source.href=url.href; } catch (_) {}
  source.target='_blank';source.rel='noopener noreferrer';source.textContent=value || '출처 없음';
  detail.append(source);wrapper.append(term,detail);return wrapper;
};
const section = title => {
  const group=document.createElement('section'),heading=document.createElement('h2');
  group.className='price-review-group';heading.textContent=title;group.append(heading);list.append(group);return group;
};
const card = (group, item, previous, label) => {
  const article=document.createElement('article'),title=document.createElement('h3'),fields=document.createElement('dl');
  article.className='price-review-card';title.textContent=`${item.product_slug} · ${label}${item.id ? ` · #${item.id}` : ''}`;
  const q=item.comparison_quantity;
  fields.append(field('상품',item.observed_title),field('선택 옵션',item.observed_option),field('확인 수량',item.observed_quantity),sourceField(item.source_url),field('판매자',item.seller),field('배송비',money(item.shipping_fee)),field('매칭 점수',item.match_score),field('기존 묶음 총액',money(previous?.displayedPrice)),field('기존 판매 단위',previous?.normalizedQuantity),field('기존 환산 분모',previous?.comparisonQuantity),field('기존 비교 기준',previous?.comparisonBasisKey),field('새 묶음 표시가',money(item.observed_price)),field('PX 판매 단위 수',q),field('관찰 비교 기준',item.comparison_basis),field('판매 단위당 환산가',Number.isSafeInteger(q)&&q>0&&Number.isSafeInteger(item.observed_price)?money(Math.round(item.observed_price/q)):null),field('이유',item.reason),field('관찰 시각',item.observed_at));
  article.append(title,fields);group.append(article);return article;
};
async function load(requestedOffset=0) {
  const response=await fetch(`/api/admin/prices?pendingOffset=${requestedOffset}`,{credentials:'same-origin',cache:'no-store'});
  if(!response.ok) throw new Error('검토 목록을 불러오지 못했습니다.');
  const data=await response.json();
  if(requestedOffset && data.pendingTotal<=requestedOffset) return load(Math.max(0,Math.ceil(data.pendingTotal/limit)*limit-limit));
  offset=data.pendingOffset;
  const current=new Map(data.current.map(row=>[row.slug,row]));
  list.replaceChildren();
  status.textContent=data.pendingTotal ? `총 ${data.pendingTotal}건 검토 대기` : '검토 대기 중인 가격이 없습니다.';
  page.textContent=data.pendingTotal ? `${offset+1}–${Math.min(offset+limit,data.pendingTotal)} / ${data.pendingTotal}` : '0 / 0';
  previous.disabled=offset===0;next.disabled=offset+limit>=data.pendingTotal;

  const queueGroup=section('수집 및 확인 상태');
  for(const item of data.queue) {
    const article=document.createElement('article'),title=document.createElement('h3'),details=document.createElement('dl');
    article.className='price-review-card';title.textContent=`${item.product_slug} · ${labels[item.status] || item.status}`;
    details.append(field('우선순위',item.priority),field('시도 횟수',item.attempts),field('최근 확인',item.last_checked_at),field('오류',item.last_error));
    article.append(title,details);queueGroup.append(article);
  }
  if(!data.queue.length) { const empty=document.createElement('p');empty.textContent='표시할 수집 상태가 없습니다.';queueGroup.append(empty); }

  const pendingGroup=section('가격 검토 대기');
  for(const item of data.pending) {
    const article=card(pendingGroup,item,current.get(item.product_slug),labels[item.status] || item.status);
    const actions=document.createElement('div');actions.className='price-review-actions';
    for(const [action,label] of [['ACCEPT','승인'],['REJECT','거절']]) {
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.addEventListener('click',async()=>{
        if(!confirm(`${item.product_slug} 가격을 ${label}할까요?`)) return;
        actions.querySelectorAll('button').forEach(element=>element.disabled=true);
        try {
          const response=await fetch('/api/admin/prices/review',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({historyId:item.id,action})});
          if(!response.ok) throw new Error('결정을 저장하지 못했습니다. 새로고침 후 확인하세요.');
          await load(offset);
        } catch(error) { status.textContent=error.message;actions.querySelectorAll('button').forEach(element=>element.disabled=false); }
      });
      actions.append(button);
    }
    article.append(actions);
  }
  if(!data.pending.length) { const empty=document.createElement('p');empty.textContent='이 페이지에 검토 대기 가격이 없습니다.';pendingGroup.append(empty); }

  const resultGroup=section('최근 처리 결과');
  const results=data.history.filter(item=>item.entry_kind==='REVIEW_DECISION' || (item.entry_kind==='OBSERVATION' && ['ACCEPT','REJECT','BLOCKED'].includes(item.status)));
  for(const item of results) card(resultGroup,item,current.get(item.product_slug),labels[item.status] || item.status);
  if(!results.length) { const empty=document.createElement('p');empty.textContent='최근 처리 결과가 없습니다.';resultGroup.append(empty); }
}
previous.addEventListener('click',()=>load(Math.max(0,offset-limit)).catch(error=>{status.textContent=error.message;}));
next.addEventListener('click',()=>load(offset+limit).catch(error=>{status.textContent=error.message;}));
load().catch(error=>{status.textContent=error.message;});
