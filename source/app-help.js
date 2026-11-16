(() => {
 const HIDDEN='px-help-hidden-v1',SHOWN='px-help-shown-v1';
 const get=(store,key)=>{try{return store.getItem(key)==='1';}catch{return false;}};
 const put=(store,key)=>{try{store.setItem(key,'1');}catch{}};
 const dialog=document.createElement('dialog');dialog.className='app-help-dialog';dialog.id='app-help';dialog.setAttribute('aria-labelledby','app-help-title');
 dialog.innerHTML='<div class="title-tab-line"><h2 class="title-tab" id="app-help-title">PX 가이드 사용법</h2></div><dl><div><dt>홈</dt><dd>주요 안내와 추천 상품을 확인하세요.</dd></div><div><dt>전체 상품</dt><dd>상품명 검색·분류·정렬로 찾고 PX가와 쿠팡가를 비교하세요.</dd></div><div><dt>이달의 할인</dt><dd>이달의 할인 상품과 월별 기록을 확인하세요.</dd></div><div><dt>가까운 PX</dt><dd>가까운 매장을 찾고 거리·영업시간·지도를 확인하세요.</dd></div><div><dt>문의</dt><dd>문제 신고·개선 건의·질문을 남기세요.</dd></div><div><dt>찜 ♥</dt><dd>왼쪽 하트로 저장하고 찜 목록에서 장바구니로 옮기세요.</dd></div><div><dt>장바구니</dt><dd>오른쪽 카트로 담고 − / +로 수량을 조절하세요. 상품을 누르면 구매 완료로 체크되며 합계·절약 금액이 자동 계산됩니다.</dd></div><div><dt>목록 전달</dt><dd>링크·이미지·텍스트로 공유하세요. 링크는 다음 날 23:59(한국 시간)에 만료됩니다.</dd></div></dl><div class="app-help-controls"><label><input type="checkbox" id="app-help-hide"> 다음에 다시 보지 않기</label><button type="button" id="app-help-close">닫기</button></div>';
 document.body.append(dialog);
 const show=()=>{if(!get(localStorage,HIDDEN)&&!dialog.open&&!document.querySelector('dialog[open]')){dialog.querySelector('#app-help-hide').checked=false;dialog.showModal();put(sessionStorage,SHOWN);}};
 dialog.querySelector('#app-help-close').addEventListener('click',()=>{if(dialog.querySelector('#app-help-hide').checked)put(localStorage,HIDDEN);dialog.close();});
 // Closing or Escape alone never saves the opt-out. Internal page changes do not repeat the notice.
 if(!get(sessionStorage,SHOWN))show();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')show();});
 window.addEventListener('pageshow',event=>{if(event.persisted)show();});
})();
