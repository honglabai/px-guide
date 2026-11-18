(() => {
 const HIDDEN='px-help-hidden-v1',SHOWN='px-help-shown-v1';
 const get=(store,key)=>{try{return store.getItem(key)==='1';}catch{return false;}};
 const put=(store,key)=>{try{store.setItem(key,'1');}catch{}};
 const dialog=document.createElement('dialog');dialog.className='app-help-dialog';dialog.id='app-help';dialog.setAttribute('aria-label','PX 가이드 사용법');
 dialog.innerHTML='<picture class="app-help-banner"><source media="(max-width: 640px)" type="image/webp" srcset="/images/home/app-help-mobile.webp" width="380" height="550"><source media="(max-width: 640px)" type="image/png" srcset="/images/home/app-help-mobile.png" width="380" height="550"><source type="image/webp" srcset="/images/home/app-help-desktop.webp" width="760" height="440"><img src="/images/home/app-help-desktop.png" alt="PX 가이드 사용법: 홈(주요안내·추천상품), 전체상품(검색·분류·정렬, PX가 vs 쿠팡가 비교), 이달의 할인, 가까운 PX(매장찾기, 거리·영업시간·지도), 문의, 찜(위시리스트), 장바구니(수량조절·구매체크·합계계산), 목록 전달(링크·이미지·텍스트 공유)" width="760" height="440" loading="eager" fetchpriority="high" decoding="async"></picture><div class="app-help-controls"><label><input type="checkbox" id="app-help-hide"> 다음에 다시 보지 않기</label><button type="button" id="app-help-close">닫기</button></div>';
 document.body.append(dialog);
 const show=()=>{if(!get(localStorage,HIDDEN)&&!dialog.open&&!document.querySelector('dialog[open]')){dialog.querySelector('#app-help-hide').checked=false;dialog.showModal();put(sessionStorage,SHOWN);}};
 dialog.querySelector('#app-help-close').addEventListener('click',()=>{if(dialog.querySelector('#app-help-hide').checked)put(localStorage,HIDDEN);dialog.close();});
 // Closing or Escape alone never saves the opt-out. Internal page changes do not repeat the notice.
 if(!get(sessionStorage,SHOWN))show();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')show();});
 window.addEventListener('pageshow',event=>{if(event.persisted)show();});
})();