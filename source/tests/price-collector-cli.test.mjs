import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {collectionTimeoutMs,runtimeScript,runEgo,parseArguments} from '../scripts/collect-coupang-prices.mjs';
function child(){const c=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();c.killed=0;c.kill=()=>{c.killed++;};return c;}
test('budget covers all 60 bounded navigations; TaskSpace ID prints before import',()=>{
 assert.ok(collectionTimeoutMs(20)>60*20000);
 const script=runtimeScript([]);assert.ok(script.indexOf('task.spaceId')<script.indexOf('bounded(import'));
 assert.equal((script.match(/taskSpace\(/g)||[]).length,1);
});
test('diagnostics stream immediately and stdout envelope is parsed across chunks',async()=>{
 const c=child(),logs=[];let calls=0;const result=runEgo([],{spawnProcess:()=>{calls++;return c;},diagnostic:s=>logs.push(s)});
 c.stderr.emit('data',Buffer.from('TaskSpace 6\n'));assert.ok(logs.includes('TaskSpace 6\n'));
 c.stdout.emit('data',Buffer.from('runtime ready\nCOUPANG_OBSER'));c.stdout.emit('data',Buffer.from('VATIONS=[]\n'));c.emit('close',0);
 assert.deepEqual(await result,[]);assert.equal(calls,1);assert.ok(logs.includes('runtime ready\n'));
});
test('timeout stops once, reports possible remote effects and never retries',async()=>{
 const c=child();let calls=0;await assert.rejects(runEgo([],{spawnProcess:()=>{calls++;return c;},diagnostic:()=>{},timeoutMs:5}),/remote work may still be active/);assert.equal(c.killed,1);assert.equal(calls,1);
});
test('nonzero exit does not publish partial results',async()=>{
 const c=child();const result=runEgo([],{spawnProcess:()=>c,diagnostic:()=>{}});c.stdout.emit('data',Buffer.from('COUPANG_OBSERVATIONS=[]\n'));c.emit('close',1);await assert.rejects(result,/without complete observations/);
});

test('explicit resume selects only the existing space and never falls back to allocation',async()=>{
 const script=runtimeScript([],{taskSpaceId:2});assert.match(script,/taskSpace\(2\)/);assert.doesNotMatch(script,/taskSpace\("Coupang/);assert.equal((script.match(/taskSpace\(/g)||[]).length,1);
 assert.deepEqual(parseArguments(['batch.json','--task-space-id','2']),{file:'batch.json',taskSpaceId:2});
 for(const args of [['batch.json','--task-space-id','0'],['batch.json','--task-space-id','bad'],['batch.json','--task-space-id','2','extra']])assert.throws(()=>parseArguments(args));
 assert.throws(()=>runtimeScript([],{taskSpaceId:'2; unsafe'}));
 const c=child();let calls=0;const result=runEgo([],{taskSpaceId:2,spawnProcess:(_cmd,args)=>{calls++;assert.match(args[2],/taskSpace\(2\)/);return c;},diagnostic:()=>{}});c.emit('close',1);await assert.rejects(result);assert.equal(calls,1);
});
test('Ego stderr console envelopes carry observations without leaking payload to diagnostics',async()=>{
 for(const prefix of ['', '[error] ']){
  const c=child(),logs=[];const result=runEgo([],{spawnProcess:()=>c,diagnostic:s=>logs.push(s)});
  c.stderr.emit('data',Buffer.from('[error] collector: TaskSpace 2\n'+prefix+'COUPANG_OBSER'));
  c.stderr.emit('data',Buffer.from('VATIONS=[{"slug":"sample"}]'));c.emit('close',0);
  assert.deepEqual(await result,[{slug:'sample'}]);assert.ok(logs.some(s=>s.includes('TaskSpace 2')));assert.ok(logs.every(s=>!s.includes('"slug"')));
 }
});
test('result-like diagnostic substrings and duplicate channels do not silently succeed',async()=>{
 const c=child();const result=runEgo([],{spawnProcess:()=>c,diagnostic:()=>{}});c.stderr.emit('data',Buffer.from('[error] failed to print COUPANG_OBSERVATIONS=[]\n'));c.emit('close',0);await assert.rejects(result,/without complete observations/);
 const d=child();const duplicate=runEgo([],{spawnProcess:()=>d,diagnostic:()=>{}});d.stdout.emit('data',Buffer.from('COUPANG_OBSERVATIONS=[]\n'));d.stderr.emit('data',Buffer.from('[error] COUPANG_OBSERVATIONS=[]\n'));d.emit('close',0);await assert.rejects(duplicate,/Duplicate/);
});
test('stderr JSON preserves Korean text split across UTF-8 byte chunks',async()=>{
 const c=child();const result=runEgo([],{spawnProcess:()=>c,diagnostic:()=>{}});
 const bytes=Buffer.from('COUPANG_OBSERVATIONS=[{"seller":"주식회사"}]\n');const at=bytes.indexOf(Buffer.from('주'))+1;
 c.stderr.emit('data',bytes.subarray(0,at));c.stderr.emit('data',bytes.subarray(at));c.emit('close',0);assert.deepEqual(await result,[{seller:'주식회사'}]);
});
test('runtime refuses a batch without the server-derived bundle target',()=>{
 for(const item of [
  {slug:'a',quantity:'20개'},
  {slug:'a',quantity:'20개',comparisonQuantity:0},
  {slug:'a',quantity:'',comparisonQuantity:20},
  {slug:'a',quantity:'20개',comparisonQuantity:20,referencePrice:12.5},
 ])assert.throws(()=>runtimeScript([item]),/bundle target|baseline/i);
 assert.match(runtimeScript([{slug:'a',quantity:'20개',comparisonQuantity:20,referencePrice:25950}]),/25950/);
});
