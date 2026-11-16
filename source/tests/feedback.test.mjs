import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleFeedback,feedbackInput} from '../worker/feedback.js';
const draft={category:'problem',title:'화면 문제',body:'아이폰에서 상품 목록이 잘리지 않는지 확인해 주세요.',nickname:''};
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0008_feedback_board.sql','utf8').replaceAll('--> statement-breakpoint',''));
 const db={prepare(q){return {a:[],bind(...a){return {...this,a};},async first(){return sql.prepare(q).get(...this.a)||null;},async all(){return {results:sql.prepare(q).all(...this.a)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...this.a).changes)}};}};}};
 const call=(path='',method='GET',data,token,origin='https://px.test')=>handleFeedback(new Request('https://px.test/api/feedback'+path,{method,headers:{origin,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),'cf-connecting-ip':'192.0.2.1'},...(data?{body:JSON.stringify(data)}:{})}),{DB:db});return {sql,call};
}
test('public board persists anonymous posts, lists summaries and protects private edit credentials',async()=>{
 const f=fixture(),r=await f.call('','POST',draft);assert.equal(r.status,201);const {id,editToken}=await r.json();assert.match(id,/^[a-f0-9]{64}$/);assert.match(editToken,/^[a-f0-9]{64}$/);
 const list=await (await f.call()).json();assert.equal(list.posts.length,1);assert.equal(list.posts[0].nickname,'익명');assert(!('body' in list.posts[0]));assert(!JSON.stringify(list).includes(editToken));assert(!JSON.stringify(list).includes('edit_hash'));
 const row=await (await f.call('/'+id)).json();assert.equal(row.post.body,draft.body);const stored=f.sql.prepare('SELECT * FROM feedback_posts').get();assert.notEqual(stored.edit_hash,editToken);assert(!JSON.stringify(stored).includes('192.0.2.1'));
});
test('only the author capability can edit and remove a post, and deletion keeps rate evidence',async()=>{
 const f=fixture(),{id,editToken}=await (await f.call('','POST',draft)).json();
 assert.equal((await f.call('/'+id,'PATCH',draft)).status,403);assert.equal((await f.call('/'+id,'DELETE',null,'f'.repeat(64))).status,403);
 assert.equal((await f.call('/'+id,'PATCH',{...draft,title:'수정 제목'},editToken)).status,200);assert.equal((await (await f.call('/'+id)).json()).post.title,'수정 제목');
 assert.equal((await f.call('/'+id,'DELETE',null,editToken)).status,200);assert.equal((await f.call('/'+id)).status,404);assert.equal((await (await f.call()).json()).posts.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM feedback_posts').get().n,1);
});
test('writes enforce origin, length, required values and atomic submission rate',async()=>{
 const f=fixture();assert.equal((await f.call('','POST',draft,null,'https://evil.test')).status,403);
 for(const bad of [{...draft,category:'other'},{...draft,title:' '},{...draft,title:'a'.repeat(101)},{...draft,body:'a'.repeat(4001)},{...draft,nickname:'a'.repeat(21)}])assert.equal((await f.call('','POST',bad)).status,400);
 for(let i=0;i<3;i++)assert.equal((await f.call('','POST',draft)).status,201);assert.equal((await f.call('','POST',draft)).status,429);
 assert.equal((await f.call('','POST',{...draft,body:'a'.repeat(26000)})).status,400);
 assert.throws(()=>feedbackInput(null));assert.equal(feedbackInput({...draft,title:'<img src=x onerror=alert(1)>'}).title,'<img src=x onerror=alert(1)>');
});
test('stable pagination and category filtering neither repeat nor skip same-time posts',async()=>{
 const f=fixture(),insert=f.sql.prepare('INSERT INTO feedback_posts VALUES(?,?,?,?,?,?,?,?,?,?)');for(let i=0;i<43;i++)insert.run(i.toString(16).padStart(64,'0'),i%2?'question':'problem','제목 '+i,'내용','익명',1793000000000,1793000000000,null,'hash','creator');
 let cursor='',ids=[];do{const page=await (await f.call(cursor?'?before='+cursor:'')).json();ids.push(...page.posts.map(p=>p.id));cursor=page.nextCursor;}while(cursor);assert.equal(ids.length,43);assert.equal(new Set(ids).size,43);
 const filtered=await (await f.call('?category=question')).json();assert(filtered.posts.every(p=>p.category==='question'));assert.equal((await f.call('?before=oops')).status,400);assert.equal((await f.call('/invalid')).status,404);
});
