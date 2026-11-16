import {shareExpiresAt,shareFileName,cleanupShoppingShares} from './shopping-share-retention.js';
import {validateSharedItems} from '../shopping-share-model.js';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
export async function handleShoppingShare(request,env){
 const url=new URL(request.url),base='/api/shopping-shares';
 if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return null;
 try{
  // Public retention maintenance: server clock only, expired snapshots only, no user data in response.
  if(url.pathname===base+'/maintenance'){
   if(!['GET','POST'].includes(request.method))return reply({error:'허용되지 않는 요청입니다.'},405);
   return reply(await cleanupShoppingShares(env.DB));
  }
  if(request.method==='GET'){
   const id=url.pathname.slice(base.length+1);if(!/^[a-f0-9]{64}$/.test(id))return reply({error:'목록을 찾을 수 없습니다.'},404);
   const row=await env.DB.prepare('SELECT items, created_at, expires_at FROM shopping_shares WHERE id = ? AND expires_at > ?').bind(id,Date.now()).first();
   if(!row)return reply({error:'공유 목록이 없거나 유효기간이 지났습니다.'},404);
   const expiresAt=Math.min(row.expires_at,shareExpiresAt(row.created_at));
   if(expiresAt<=Date.now()){await cleanupShoppingShares(env.DB);return reply({error:'공유 목록의 유효기간이 지나 삭제되었습니다.'},404);}
   const fileName=shareFileName(id,row.created_at),data={id,fileName,items:validateSharedItems(JSON.parse(row.items)),createdAt:row.created_at,expiresAt};
   if(url.searchParams.get('download')==='1')return Response.json(data,{headers:{...headers,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`}});
   return reply(data);
  }
  if(request.method!=='POST'||url.pathname!==base)return reply({error:'허용되지 않는 요청입니다.'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'허용되지 않는 요청입니다.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON 형식이 필요합니다.'},415);
  // Bound the streamed body before parsing (Content-Length can be omitted or forged).
  const reader=request.body?.getReader();let size=0,chunks=[];if(!reader)return reply({error:'빈 요청입니다.'},400);
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>250000){await reader.cancel();return reply({error:'목록이 너무 큽니다.'},413);}chunks.push(value);}
  let items;try{const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}items=validateSharedItems(JSON.parse(new TextDecoder().decode(all)).items);}catch{return reply({error:'상품 목록을 확인하세요.'},400);}
  const now=Date.now(),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode((request.headers.get('cf-connecting-ip')||'unknown')+':'+Math.floor(now/86400000)));
  const creator=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  await cleanupShoppingShares(env.DB,now);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM shopping_shares WHERE creator = ? AND created_at > ?').bind(creator,now-3600000).first();
  if(count.n>=30)return reply({error:'공유 요청이 많습니다. 잠시 후 다시 시도하세요.'},429);
  const id=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),expires=shareExpiresAt(now);
  await env.DB.batch([env.DB.prepare('INSERT INTO shopping_shares (id, items, created_at, expires_at, creator) VALUES (?, ?, ?, ?, ?)').bind(id,JSON.stringify(items),now,expires,creator)]);
  return reply({id,fileName:shareFileName(id,now),url:`${url.origin}/shopping/?share=${id}`,expiresAt:expires},201);
 }catch(error){console.error('Shopping share unavailable',error);return reply({error:'구매목록을 불러오거나 저장하지 못했습니다. 잠시 후 다시 시도하세요.'},503);}
}
