(() => {
 const $=s=>document.querySelector(s),form=$('#feedback-form');if(!form)return;
 const list=$('#feedback-list'),status=$('#feedback-status'),filter=$('#feedback-filter'),more=$('#feedback-more'),submit=$('#feedback-submit'),tokensKey='px-feedback-edit-v1';
 const names={problem:'문제 신고',suggestion:'개선 건의',question:'일반 문의'};
 let tokens={};try{tokens=JSON.parse(localStorage.getItem(tokensKey)||'{}');if(!tokens||typeof tokens!=='object'||Array.isArray(tokens))tokens={};}catch{}
 let editing=null,cursor=null,generation=0,sending=false;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const field=name=>form.elements.namedItem(name);
 const date=time=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(time));
 async function api(path='',options={}){const r=await fetch('/api/feedback'+path,options);let data;try{data=await r.json();}catch{throw Error('게시판 연결을 확인하고 다시 시도하세요.');}if(!r.ok)throw Error(data.error||'요청을 처리하지 못했습니다.');return data;}
 function compose(post){editing=post?.id||null;form.reset();if(post)for(const name of ['category','nickname','title','body'])field(name).value=post[name];$('#feedback-form-title').textContent=editing?'문의 수정':'문의 작성';submit.textContent=editing?'수정 저장':'등록';form.hidden=false;field('title').focus();}
 $('#feedback-compose').addEventListener('click',()=>{if(!sending)compose();});
 $('#feedback-cancel').addEventListener('click',()=>{if(!sending){form.hidden=true;editing=null;}});
 function render(row){
  const details=el('details',null,'feedback-post'),summary=el('summary'),badge=el('span',names[row.category],'feedback-badge'),title=el('strong',row.title),meta=el('span',`${row.nickname} · ${date(row.createdAt)}${row.updatedAt>row.createdAt?' · 수정됨':''}`,'feedback-meta');summary.append(badge,title,meta);details.append(summary);
  const content=el('div',null,'feedback-post-content');details.append(content);let loaded=false,loading=false;
  details.addEventListener('toggle',async()=>{
   if(!details.open||loaded||loading)return;loading=true;content.textContent='내용을 불러오는 중…';
   try{const {post}=await api('/'+row.id);content.replaceChildren(el('p',post.body,'feedback-body'));loaded=true;
    if(tokens[row.id]){const actions=el('div',null,'feedback-post-actions'),edit=el('button','수정'),remove=el('button','삭제');edit.type=remove.type='button';edit.onclick=()=>compose(post);remove.onclick=async()=>{if(!confirm('이 글을 게시판에서 삭제할까요?'))return;remove.disabled=true;try{await api('/'+row.id,{method:'DELETE',headers:{authorization:'Bearer '+tokens[row.id]}});delete tokens[row.id];try{localStorage.setItem(tokensKey,JSON.stringify(tokens));}catch{}await load();status.textContent='게시글을 삭제했습니다.';}catch(e){status.textContent=e.message;remove.disabled=false;}};actions.append(edit,remove);content.append(actions);}
   }catch(e){content.replaceChildren(el('p',e.message));}finally{loading=false;}
  });list.append(details);
 }
 async function load(append=false){
  const version=++generation;more.disabled=true;status.textContent='게시글을 불러오는 중…';
  const params=new URLSearchParams();if(filter.value)params.set('category',filter.value);if(append&&cursor)params.set('before',cursor);
  try{const data=await api('?'+params);if(version!==generation)return;if(!append)list.replaceChildren();data.posts.forEach(render);cursor=data.nextCursor;more.hidden=!cursor;status.textContent=list.children.length?'':'아직 등록된 문의가 없습니다. 첫 의견을 남겨 주세요.';}
  catch(e){if(version===generation){status.textContent=e.message;}}
  finally{if(version===generation)more.disabled=false;}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!form.reportValidity())return;sending=true;submit.disabled=true;$('#feedback-cancel').disabled=true;const id=editing;
  const data=Object.fromEntries(['category','nickname','title','body'].map(name=>[name,field(name).value]));
  try{const result=await api(id?'/'+id:'',{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json',...(id?{authorization:'Bearer '+tokens[id]}:{})},body:JSON.stringify(data)});let retained=true;
   if(!id){tokens[result.id]=result.editToken;try{localStorage.setItem(tokensKey,JSON.stringify(tokens));}catch{retained=false;}}
   form.hidden=true;form.reset();editing=null;filter.value='';await load();status.textContent=retained?(id?'수정했습니다.':'문의가 등록되었습니다.'):'등록되었습니다. 브라우저 저장이 제한되어 새로고침 후 수정·삭제가 어려울 수 있습니다.';
  }catch(e){status.textContent=e.message;}finally{sending=false;submit.disabled=false;$('#feedback-cancel').disabled=false;}
 });
 filter.addEventListener('change',()=>load());more.addEventListener('click',()=>load(true));load();
})();
