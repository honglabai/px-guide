const base='/api/feedback';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const fields='id, category, title, body, nickname, created_at AS createdAt, updated_at AS updatedAt';
const validId=id=>/^[a-f0-9]{64}$/.test(id);
export function feedbackInput(data){
 if(!data||typeof data!=='object')throw Error('내용을 확인하세요.');
 const text=(key,max,required=true)=>{if(typeof data[key]!=='string')throw Error('내용을 확인하세요.');const value=data[key].trim();if((required&&!value)||value.length>max)throw Error('입력한 글자 수를 확인하세요.');return value;};
 const category=text('category',20),title=text('title',100),body=text('body',4000),nickname=text('nickname',20,false)||'익명';
 if(!['problem','suggestion','question'].includes(category))throw Error('문의 유형을 선택하세요.');
 return {category,title,body,nickname};
}
async function jsonBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON 형식이 필요합니다.');
 const reader=request.body?.getReader();if(!reader)throw Error('내용을 입력하세요.');let n=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>25000){await reader.cancel();throw Error('내용이 너무 깁니다.');}chunks.push(value);}
 const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleFeedback(request,env){
 const url=new URL(request.url);if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return null;
 const id=url.pathname===base?'':url.pathname.slice(base.length+1),db=env.DB;
 if(id&&!validId(id))return reply({error:'게시글을 찾을 수 없습니다.'},404);
 try{
  if(request.method==='GET'){
   if(id){const post=await db.prepare(`SELECT ${fields} FROM feedback_posts WHERE id = ? AND deleted_at IS NULL`).bind(id).first();return post?reply({post}):reply({error:'게시글을 찾을 수 없습니다.'},404);}
   const category=url.searchParams.get('category')||'',cursor=url.searchParams.get('before')||'';
   if(category&&!['problem','suggestion','question'].includes(category)||cursor&&!/^\d{13}_[a-f0-9]{64}$/.test(cursor))return reply({error:'검색 조건을 확인하세요.'},400);
   const conditions=['deleted_at IS NULL'],args=[];
   if(category){conditions.push('category = ?');args.push(category);}
   if(cursor){const [time,key]=cursor.split('_');conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');args.push(Number(time),Number(time),key);}
   const result=await db.prepare(`SELECT id,category,title,nickname,created_at AS createdAt,updated_at AS updatedAt FROM feedback_posts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT 21`).bind(...args).all();
   const rows=result.results||[],posts=rows.slice(0,20),last=posts.at(-1);return reply({posts,nextCursor:rows.length>20?`${last.createdAt}_${last.id}`:null});
  }
  if(!['POST','PATCH','DELETE'].includes(request.method)||request.method==='POST'&&id||request.method!=='POST'&&!id)return reply({error:'허용되지 않는 요청입니다.'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'허용되지 않는 요청입니다.'},403);
  if(request.method==='POST'){
   let data;try{data=feedbackInput(await jsonBody(request));}catch{return reply({error:'유형·제목(100자)·내용(4,000자)·별명(20자)을 확인하세요.'},400);}
   const now=Date.now(),creator=await hash(`${request.headers.get('cf-connecting-ip')||'unknown'}:${Math.floor(now/86400000)}`),editToken=random(),key=random();
   // Keep the rate guard inside the INSERT so concurrent requests cannot bypass it.
   const result=await db.prepare('INSERT INTO feedback_posts (id,category,title,body,nickname,created_at,updated_at,edit_hash,creator) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM feedback_posts WHERE creator = ? AND created_at > ?) < 3 AND (SELECT COUNT(*) FROM feedback_posts WHERE creator = ? AND created_at > ?) < 10').bind(key,data.category,data.title,data.body,data.nickname,now,now,await hash(editToken),creator,creator,now-600000,creator,now-86400000).run();
   if(!result.meta?.changes)return reply({error:'글 등록이 많습니다. 10분 뒤 다시 시도하세요.'},429);
   return reply({id:key,editToken},201);
  }
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return reply({error:'작성한 브라우저에서만 수정·삭제할 수 있습니다.'},403);
  const digest=await hash(token),own=await db.prepare('SELECT id FROM feedback_posts WHERE id = ? AND edit_hash = ? AND deleted_at IS NULL').bind(id,digest).first();
  if(!own)return reply({error:'수정·삭제 권한이 없거나 삭제된 글입니다.'},403);
  if(request.method==='DELETE')await db.prepare('UPDATE feedback_posts SET deleted_at = ? WHERE id = ? AND edit_hash = ?').bind(Date.now(),id,digest).run();
  else{let data;try{data=feedbackInput(await jsonBody(request));}catch{return reply({error:'입력 내용을 확인하세요.'},400);}await db.prepare('UPDATE feedback_posts SET category = ?,title = ?,body = ?,nickname = ?,updated_at = ? WHERE id = ? AND edit_hash = ? AND deleted_at IS NULL').bind(data.category,data.title,data.body,data.nickname,Date.now(),id,digest).run();}
  return reply({ok:true});
 }catch(error){console.error('Feedback board unavailable',error);return reply({error:'게시판을 불러오거나 저장하지 못했습니다. 잠시 후 다시 시도하세요.'},503);}
}
