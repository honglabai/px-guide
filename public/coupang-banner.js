export const COUPANG_WEB_URL='https://www.coupang.com/';
// HTTPS is also the iOS Universal Link; Android explicitly targets Coupang's app.
export function coupangAppUrl(webUrl,userAgent=''){
 const url=new URL(webUrl);
 if(url.origin!=='https://www.coupang.com'||url.username||url.password)throw Error('Invalid Coupang URL');
 url.hash='';
 return /Android/i.test(userAgent)?'intent://'+url.host+url.pathname+url.search+'#Intent;scheme=https;package=com.coupang.mobile;S.browser_fallback_url='+encodeURIComponent(url.href)+';end':url.href;
}
export function coupangBannerUrl(userAgent=''){return coupangAppUrl(COUPANG_WEB_URL,userAgent);}
export function configureCoupangBanner(doc,device){
 for(const link of doc.querySelectorAll('[data-coupang-banner]'))link.href=coupangBannerUrl(device?.userAgent||'');
}
// Keep the direct tap as the app-launch gesture, including dynamically inserted links.
export function prepareCoupangLink(link,userAgent=''){
 let url;try{url=new URL(link.href);}catch{return false;}
 if(url.origin!=='https://www.coupang.com')return false;
 link.href=coupangAppUrl(url.href,userAgent);
 link.removeAttribute?.('target');
 return true;
}
export function configureCoupangLinks(doc,device){
 const userAgent=device?.userAgent||'';
 for(const link of doc.querySelectorAll('a[href]'))prepareCoupangLink(link,userAgent);
 doc.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link)prepareCoupangLink(link,userAgent);},true);
}
if(typeof document!=='undefined'){configureCoupangBanner(document,navigator);configureCoupangLinks(document,navigator);}
