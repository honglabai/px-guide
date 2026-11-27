(() => {
 const KEY='px-navigation-pending-v1', SCROLL='px-navigation-scroll-v1:';
 const storage={get(key){try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}},set(key,value){try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}},remove(key){try{sessionStorage.removeItem(key);}catch{}}};
 const id=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
 const local=url=>{try{const value=new URL(url,location.href);return value.origin===location.origin&&!value.pathname.startsWith('/launch/')?value:null;}catch{return null;}};
 const nativeNearby=/Android/i.test(navigator.userAgent)&&(()=>{try{return sessionStorage.getItem('px-native-nearby')==='4';}catch{return false;}})();
 if(nativeNearby){
  for(const a of document.querySelectorAll('a[href]')){
   const target=local(a.href);
   if(target&&/^\/nearby\/?$/.test(target.pathname))a.href='intent://nearby#Intent;scheme=pxguide;package=com.honglabai.pxguide;S.browser_fallback_url='+encodeURIComponent(new URL('/nearby/?web=1',location.origin).href)+';end';
  }
 }
 const nav=()=>history.state?.pxNav;
 const replace=state=>history.replaceState(state,'',location.href);
 const pending=storage.get(KEY);storage.remove(KEY);
 if(!nav()){
  let depth=0;
  if(pending&&pending.url===location.href&&Date.now()-pending.at<30000)depth=pending.depth+1;
  else if(document.referrer&&local(document.referrer)&&history.length>1)depth=1;
  replace({...history.state,pxNav:{id:id(),depth}});
 }
 const dialogs=new Map();let navigating=false;
 function updateButton(){const button=document.querySelector('[data-app-back]');if(button)button.hidden=location.pathname==='/'&&!(nav()?.depth>0)&&!document.querySelector('dialog[open]');}
 function saveScroll(){if(nav())storage.set(SCROLL+nav().id,{y:window.scrollY||0,at:Date.now()});}
 function restoreScroll(){
  const saved=nav()&&storage.get(SCROLL+nav().id);if(!saved)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:saved.y,left:0,behavior:'instant'})));
 }
 function prepare(url,depth=nav()?.depth||0){saveScroll();storage.set(KEY,{url:url.href,depth,at:Date.now()});}
 function back(){
  const dialog=document.querySelector('dialog[open]');if(dialog){dialog.close();return;}
  saveScroll();
  if(nav()?.depth>0&&history.length>1)history.back();else if(location.pathname!=='/')location.assign('/');
 }
 function openDialog(dialog){
  if(dialog.open)return;
  saveScroll();const key=id();dialogs.set(key,dialog);
  history.pushState({...history.state,pxPopup:key,pxNav:{id:nav().id,depth:nav().depth+1}},'',location.href);
  if(!dialog.dataset.pxHistoryBound){
   dialog.dataset.pxHistoryBound='true';
   dialog.addEventListener('close',()=>{if(!navigating&&dialogs.get(history.state?.pxPopup)===dialog)history.back();});
  }
  dialog.showModal();updateButton();
 }
 function commitView(url,{replace:shouldReplace=false}={}){
  const target=local(url);if(!target||target.href===location.href)return;
  saveScroll();const state={...history.state,pxNav:{id:shouldReplace?nav().id:id(),depth:nav().depth+(shouldReplace?0:1)}};delete state.pxPopup;
  history[shouldReplace?'replaceState':'pushState'](state,'',target.href);updateButton();
 }
 function follow(url,event){
  const popup=history.state?.pxPopup;
  if(popup&&document.querySelector('dialog[open]')){
   event.preventDefault();navigating=true;prepare(url,Math.max(0,nav().depth-1));document.querySelector('dialog[open]').close();
   // Replace the temporary popup entry, so returning from detail lands on the list once.
   location.replace(url.href);
  }else prepare(url);
 }
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-app-back]')){event.preventDefault();back();}});
 // Run after document-level popup handlers, so prevented product clicks never create a page entry.
 window.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self')||link.hasAttribute('data-app-back'))return;
  const target=local(link.href);if(!target||target.href===location.href||target.pathname===location.pathname&&target.search===location.search)return;
  follow(target,event);
 });
 window.addEventListener('submit',event=>{
  const form=event.target;if(event.defaultPrevented||form.method.toLowerCase()!=='get'||form.target&&form.target!=='_self')return;
  const target=local(form.action);if(!target)return;target.search=new URLSearchParams(new FormData(form)).toString();prepare(target);
 });
 let scrollFrame=false;window.addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=true;requestAnimationFrame(()=>{scrollFrame=false;saveScroll();});},{passive:true});
 window.addEventListener('pagehide',saveScroll);
 window.addEventListener('pageshow',event=>{navigating=false;updateButton();if(!event.persisted&&location.pathname!=='/products/')restoreScroll();});
 document.addEventListener('px-catalog-ready',restoreScroll);
 window.addEventListener('popstate',()=>{
  const popup=history.state?.pxPopup;
  const wanted=dialogs.get(popup);for(const dialog of new Set(dialogs.values())){if(dialog.open&&dialog!==wanted)dialog.close();}
  if(popup&&dialogs.has(popup)&&!dialogs.get(popup).open)dialogs.get(popup).showModal();
  if(location.pathname!=='/products/')restoreScroll();updateButton();
 });
 window.pxNavigation={back,openDialog,commitView,restoreScroll,saveScroll};
 updateButton();if(window.pxCatalogReady)restoreScroll();
})();
