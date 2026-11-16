import {validateSharedItems,shoppingText,formatWon} from './shopping-share-model.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
export function setupShoppingShare({getItems,importItems}){
 const trigger=document.querySelector('#shopping-share');
 const dialog=el('dialog',null,'shopping-share-dialog');dialog.setAttribute('aria-labelledby','shopping-share-title');
 const close=el('button','닫기','share-close');close.type='button';close.onclick=()=>dialog.close();
 const titleBar=el('div',null,'title-tab-line');const title=el('h2','구매목록 전달','title-tab');title.id='shopping-share-title';titleBar.append(title);
 const note=el('p','전달할 방식을 선택하세요. 정렬된 전체 목록의 상품명·수량·가격을 전달합니다.');
 const choices=el('div',null,'share-choices'),content=el('div'),status=el('p');status.setAttribute('role','status');
 dialog.append(close,titleBar,note,choices,content,status);document.body.append(dialog);
 let snapshot=[],busy=false;
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
 const showError=e=>{status.textContent=e.message||'전달하지 못했습니다. 다시 시도하세요.';};
 const copy=async(text,box)=>{try{await navigator.clipboard.writeText(text);status.textContent='복사했습니다. 원하는 대화창에 붙여넣으세요.';}catch{box.focus();box.select();status.textContent='내용을 길게 눌러 복사하세요.';}};
 const field=text=>{const box=el('textarea');box.value=text;box.readOnly=true;box.rows=5;box.setAttribute('aria-label','전달할 내용');content.append(box);return box;};
 const deliver=async(data,fallback)=>{try{if(navigator.share){await navigator.share(data);status.textContent='공유 창을 열었습니다.';}else await fallback();}catch(e){if(e.name!=='AbortError')await fallback();}};
 async function mode(kind){
  if(busy)return;busy=true;choices.querySelectorAll('button').forEach(b=>b.disabled=true);content.replaceChildren();status.textContent='준비 중…';
  try{
   if(kind==='link'){
    const response=await fetch('/api/shopping-shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:snapshot.map(({slug,qty})=>({slug,qty}))})});const data=await response.json();if(!response.ok)throw Error(data.error);
    const deadline=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(data.expiresAt));
    const actions=el('div',null,'share-link-actions');content.append(actions);
    content.append(el('p',`${deadline} (한국 시간)에 만료되어 자동 삭제됩니다. 링크를 가진 사람은 이 목록을 볼 수 있으며, 이후의 변경사항은 전달되지 않습니다.`));
    const download=el('a','목록 파일 저장');download.href='/api/shopping-shares/'+data.id+'?download=1';download.download=data.fileName;content.append(download);
    const box=field(data.url);box.rows=2;
    actions.append(button('링크 전달',()=>deliver({title:'PX 구매목록',url:data.url},()=>copy(data.url,box))),button('링크 복사',()=>copy(data.url,box)));
   }else if(kind==='text'){
    const text=shoppingText(snapshot),box=field(text);
    content.append(button('텍스트 전달',()=>deliver({text},()=>copy(text,box))),button('텍스트 복사',()=>copy(text,box)));
   }else{
    const files=await makeImages(snapshot);
    const urls=files.map(f=>URL.createObjectURL(f));
    content.append(el('p',`구매목록 이미지 ${files.length}장입니다. 상품이 많으면 여러 장으로 나눕니다.`));
    const download=()=>{files.forEach((f,i)=>{const a=el('a',`이미지 ${i+1} 저장`);a.download=f.name;a.href=urls[i];a.click();});status.textContent='이미지를 저장합니다. 저장이 막히면 아래 이미지 저장 링크를 이용하세요.';};
    content.append(button('이미지 전달',async()=>{if(navigator.canShare?.({files}))await deliver({title:'PX 구매목록',files},download);else download();}));
    files.forEach((f,i)=>{const a=el('a',`이미지 ${i+1} 저장`);a.download=f.name;a.href=urls[i];const img=el('img');img.src=urls[i];img.alt=`구매목록 ${i+1} / ${files.length}`;content.append(a,img);});
    dialog.addEventListener('close',()=>urls.forEach(u=>URL.revokeObjectURL(u)),{once:true});
   }
   status.textContent='전달할 준비가 되었습니다.';
  }catch(e){showError(e);}finally{busy=false;choices.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 for(const [kind,name,label] of [['link','list-link','목록 링크'],['image','list-image','이미지'],['text','list-text','텍스트(카톡 등)']]){
  const choice=button('',()=>mode(kind));choice.className='share-image-choice';choice.setAttribute('aria-label',label);choice.dataset.shareMode=kind;
  const img=el('img');img.src=`/images/shopping-share/${name}-v1-192.webp`;img.srcset=`/images/shopping-share/${name}-v1-192.webp 192w, /images/shopping-share/${name}-v1-384.webp 384w`;img.sizes='(max-width:600px) calc((100vw - 84px)/3), 168px';img.width=384;img.height=384;img.alt=label;img.decoding='async';
  choice.append(img);choices.append(choice);
 }
 trigger.addEventListener('click',()=>{snapshot=getItems();if(!snapshot.length)return;content.replaceChildren();status.textContent='';dialog.showModal();});
 // Shared data is previewed first. Receiving never writes to the cart automatically.
 const share=new URLSearchParams(location.search).get('share');
 if(share)loadShared(share);
 async function loadShared(id){
  const box=el('section',null,'shopping-import');box.setAttribute('aria-label','전달받은 구매목록');trigger.closest('.shopping-toolbar').after(box);box.append(el('p','전달받은 구매목록을 불러오는 중…'));
  try{
   if(!/^[a-f0-9]{64}$/.test(id))throw Error('공유 링크를 확인하세요.');
   const r=await fetch('/api/shopping-shares/'+id);const data=await r.json();if(!r.ok)throw Error(data.error);const items=validateSharedItems(data.items);
   const products=await window.pxCatalogData.products(items.map(i=>i.slug)),map=new Map(products.map(p=>[p.slug,p]));const available=items.filter(i=>map.has(i.slug));if(!available.length)throw Error('가져올 수 있는 상품이 없습니다.');
   box.replaceChildren(el('h2',`전달받은 구매목록 ${available.length}종 · ${available.reduce((n,r)=>n+r.qty,0)}개`));
   box.append(el('p','상품과 수량을 확인하세요. 같은 상품은 더 큰 수량을 유지합니다. 가격은 현재 상품 DB를 기준으로 표시합니다.'));
   if(available.length!==items.length)box.append(el('p',`현재 판매 목록에서 찾을 수 없는 ${items.length-available.length}종은 제외됩니다.`));
   const list=el('ul');for(const row of available){list.append(el('li',`${map.get(row.slug).name} × ${row.qty}개`));}box.append(list);
   const add=button('내 장바구니에 추가',()=>{if(importItems(available,products)){box.replaceChildren(el('p',`${available.length}종을 장바구니에 추가했습니다.`));history.replaceState(history.state,'','/shopping/');}});
   box.append(add,button('닫기',()=>{box.remove();history.replaceState(history.state,'','/shopping/');}));
  }catch(e){box.replaceChildren(el('p',e.message||'공유 목록을 불러오지 못했습니다.'),button('다시 시도',()=>{box.remove();loadShared(id);}),button('닫기',()=>box.remove()));}
 }
}
// Fixed readable type; long names wrap within their own column instead of shrinking.
export function imageRows(ctx,items){
 ctx.font='bold 32px sans-serif';
 const priceWidth=Math.max(150,...items.map(r=>ctx.measureText(formatWon(Number.isFinite(r.pxPrice)?r.pxPrice*r.qty:null)).width)),qtyRight=696-priceWidth-20,nameWidth=qtyRight-80-72-16;
 ctx.font='500 34px sans-serif';
 const rows=items.map(r=>{const lines=[];let line='';for(const char of r.name){if(line&&ctx.measureText(line+char).width>nameWidth){lines.push(line);line='';}line+=char;}if(line)lines.push(line);return {r,lines,height:Math.max(72,lines.length*44+24)};});
 return {rows,qtyRight,nameWidth};
}
export async function makeImages(items){
 await document.fonts.ready;
 const pages=[];for(let offset=0;offset<items.length;offset+=20){
  const chunk=items.slice(offset,offset+20),canvas=document.createElement('canvas');canvas.width=720;const c=canvas.getContext('2d'),{rows,qtyRight}=imageRows(c,chunk);
  canvas.height=180+rows.reduce((n,r)=>n+r.height,0)+124;
  c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#17355e';c.font='bold 44px sans-serif';c.fillText('PX 구매목록',24,58);c.font='25px sans-serif';c.fillText(`${offset+1}–${offset+chunk.length} / ${items.length}종 · ${new Date().toLocaleDateString('ko-KR')}`,24,99);
  c.font='bold 24px sans-serif';c.fillText('상품명',72,150);c.textAlign='right';c.fillText('수량',qtyRight,150);c.fillText('금액',696,150);c.textAlign='left';let y=180;
  for(const {r,lines,height} of rows){
   c.strokeStyle='#345475';c.lineWidth=2;c.strokeRect(25,y+8,29,29);
   c.fillStyle='#172537';c.font='500 34px sans-serif';lines.forEach((line,i)=>c.fillText(line,72,y+35+i*44));
   c.textAlign='right';c.font='bold 32px sans-serif';c.fillText(`${r.qty}개`,qtyRight,y+35);c.font='bold 32px sans-serif';c.fillText(formatWon(Number.isFinite(r.pxPrice)?r.pxPrice*r.qty:null),696,y+35);c.textAlign='left';
   y+=height;c.strokeStyle='#d7e0ec';c.lineWidth=1;c.beginPath();c.moveTo(24,y-8);c.lineTo(696,y-8);c.stroke();
  }
  c.fillStyle='#17355e';c.font='bold 32px sans-serif';const total=items.reduce((n,r)=>n+(Number.isFinite(r.pxPrice)?r.pxPrice*r.qty:0),0);c.textAlign='right';c.fillText(`전체 ${items.reduce((n,r)=>n+r.qty,0)}개 · 합계 ${formatWon(total)}`,696,y+42);c.textAlign='left';c.font='22px sans-serif';c.fillText(items.some(r=>!Number.isFinite(r.pxPrice))?'가격 미등록 상품은 합계에서 제외':'PX 가이드',24,y+85);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('이미지를 만들지 못했습니다.')),'image/png'));pages.push(new File([blob],`PX_구매목록_${pages.length+1}.png`,{type:'image/png'}));
 }return pages;
}
