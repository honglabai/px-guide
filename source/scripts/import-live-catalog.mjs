import fs from 'node:fs';
import manifest from '../catalog/import-manifest.json' with {type:'json'};
// Credential is accepted only through hidden stdin; never a file, argument or URL.
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdout.write('Ready for catalog import credential on hidden stdin.\n');
let line='';for await(const chunk of process.stdin){line+=chunk;if(line.length>8192)throw Error('Input too long');if(/[\r\n]/.test(line))break;}
if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
const {token,origin}=JSON.parse(line.trim());if(!token||origin!=='https://pxguide.zeromorow.chatgpt.site')throw Error('Invalid import input');
async function call(action,body={}){const r=await fetch(origin+'/api/catalog/admin/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({version:manifest.version,...body}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(action+' failed: '+r.status+' '+(await r.text()).slice(0,300));return r.json();}
if(!process.argv.includes('--activate')){for(let part=0;part<manifest.parts.length;part++){await call('seed',{part});if(part%5===0||part===manifest.parts.length-1)console.log(JSON.stringify({seeded:part+1,total:manifest.parts.length}));}const checked=await call('verify');if(!checked.valid)throw Error('Database verification failed');fs.writeFileSync('work/catalog-live-verification.json',JSON.stringify(checked,null,2));console.log(JSON.stringify({verified:checked.valid,version:checked.version,counts:Object.fromEntries(Object.entries(checked.checks).map(([k,v])=>[k,v.count]))}));}
else{const r=await call('activate');if(!r.valid)throw Error('Activation failed');console.log(JSON.stringify({activated:true,version:r.version}));}
