#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const marker='COUPANG_OBSERVATIONS=';
export const collectionTimeoutMs=count=>120000+count*3*(20000+1500);
function validateBatch(batch){
 if(!Array.isArray(batch)||batch.length>20)throw new Error('Expected at most 20 claimed products');
 for(const item of batch){
  if(!Number.isSafeInteger(item?.comparisonQuantity)||item.comparisonQuantity<=0||!/^\d+\s*(?:개|입|팩|병|캔|봉|묶음|정|매|포|pack|pet|ea)$/i.test(item.quantity??''))throw new Error('Missing server-derived bundle target');
  for(const key of ['previousPrice','referencePrice'])if(item[key]!=null&&(!Number.isSafeInteger(item[key])||item[key]<=0))throw new Error('Invalid raw-bundle baseline');
 }
}
export function runtimeScript(batch,{taskSpaceId}={}){
 validateBatch(batch);
 if(taskSpaceId!==undefined && (!Number.isSafeInteger(taskSpaceId)||taskSpaceId<1))throw new Error('Invalid existing TaskSpace ID');
 const moduleUrl=new URL('../price/browser-extract.mjs',import.meta.url).href;
 return `console.error(${JSON.stringify(taskSpaceId===undefined?"collector: allocating TaskSpace":`collector: resuming existing TaskSpace ${taskSpaceId}`)});
const bounded=async (promise,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+" timed out; inspect existing TaskSpace before retrying")),30000);})]);}finally{clearTimeout(timer);}};
const task=await bounded(taskSpace(${JSON.stringify(taskSpaceId??"Coupang price collection")}),"TaskSpace allocation");
console.error("collector: TaskSpace",task.spaceId,"page p1; retain this ID if interrupted");
console.error("collector: importing local parser");
const {collectBatch}=await bounded(import(${JSON.stringify(moduleUrl)}),"Local parser import");
console.error("collector: collecting ${batch.length} items");
const observations=await collectBatch(task,${JSON.stringify(batch)},{diagnostic:message=>console.error("collector:",message)});
console.log(${JSON.stringify(marker)}+JSON.stringify(observations));`;
}
export function runEgo(batch,{spawnProcess=spawn,diagnostic=message=>process.stderr.write(message),timeoutMs=collectionTimeoutMs(batch.length),taskSpaceId}={}){
 return new Promise((resolveResult,reject)=>{
  diagnostic(`collector: launching Ego Lite; ${batch.length} items; deadline ${Math.ceil(timeoutMs/1000)} seconds\n`);
  const child=spawnProcess('ego-browser',['nodejs','-e',runtimeScript(batch,{taskSpaceId})],{stdio:['ignore','pipe','pipe']});
  const pending={stdout:'',stderr:''},decoders={stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8')};let observations,bytes=0,settled=false;
  const complete=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolveResult(observations);};
  const timer=setTimeout(()=>{
   child.kill('SIGTERM');
   const force=setTimeout(()=>child.kill('SIGKILL'),2000);force.unref();child.once('close',()=>clearTimeout(force));
   complete(new Error('Ego Lite deadline exceeded. No automatic retry. Inspect the printed TaskSpace; remote work may still be active.'));
  },timeoutMs);
  const consumeLine=raw=>{
   if(settled)return;
   const line=raw.replace(/\r$/,'');
   // Ego sends console.log on stderr and prefixes console.error with [error].
   // Only a whole-line protocol prefix is recognized, never diagnostic substrings.
   const payload=line.startsWith(marker)?line.slice(marker.length):line.startsWith('[error] '+marker)?line.slice(8+marker.length):null;
   if(payload!==null){
    try{if(observations!==undefined)throw new Error('Duplicate observation output');observations=JSON.parse(payload);if(!Array.isArray(observations))throw new Error('Invalid observation output');}
    catch(error){child.kill('SIGTERM');complete(error);}
   }else if(line)diagnostic(line+'\n');
  };
  const receive=(channel,chunk)=>{
   if(settled)return;
   bytes+=Buffer.byteLength(chunk);if(bytes>4*1024*1024){child.kill('SIGTERM');complete(new Error('Ego Lite output limit exceeded; inspect existing TaskSpace'));return;}
   pending[channel]+=decoders[channel].write(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));let end;
   while((end=pending[channel].indexOf('\n'))!==-1){const line=pending[channel].slice(0,end);pending[channel]=pending[channel].slice(end+1);consumeLine(line);}
  };
  child.stdout.on('data',chunk=>receive('stdout',chunk));
  child.stderr.on('data',chunk=>receive('stderr',chunk));
  child.on('error',error=>complete(error));
  child.on('close',(code,signal)=>{
   for(const channel of ['stdout','stderr']){pending[channel]+=decoders[channel].end();if(pending[channel])consumeLine(pending[channel]);}
   complete(code===0&&observations!==undefined?null:new Error(`Ego Lite exited (${code ?? signal}) without complete observations. Inspect the existing TaskSpace before retrying.`));
  });
 });
}
export function parseArguments(args){
 if(args.length!==1 && !(args.length===3 && args[1]==='--task-space-id' && /^[1-9]\d*$/.test(args[2]) && Number.isSafeInteger(Number(args[2]))))throw new Error('Usage: node scripts/collect-coupang-prices.mjs batch.json [--task-space-id ID]');
 return {file:args[0],...(args.length===3?{taskSpaceId:Number(args[2])}:{})};
}
export async function main(args=process.argv.slice(2)){
 const {file,taskSpaceId}=parseArguments(args);
 const input=JSON.parse(await readFile(file,'utf8'));
 const batch=Array.isArray(input)?input:input.items;
 if(!Array.isArray(batch)||!batch.length||batch.length>20)throw new Error('Expected 1–20 claimed items');
 process.stdout.write(JSON.stringify(await runEgo(batch,{taskSpaceId}),null,2)+'\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main().catch(error=>{console.error(error.message);process.exitCode=1;});}
