import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function fixture(local=new Map(),session=new Map()){
 const events={},checks={checked:false},button={addEventListener:(name,fn)=>button[name]=fn};
 const dialog={open:false,setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},querySelector:s=>s==='#app-help-hide'?checks:button};
 const document={visibilityState:'visible',createElement:()=>dialog,body:{append(){}},querySelector:()=>null,addEventListener:(name,fn)=>events[name]=fn};
 const store=m=>({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)});
 vm.runInNewContext(fs.readFileSync('app-help.js','utf8'),{document,window:{addEventListener:(name,fn)=>events[name]=fn},localStorage:store(local),sessionStorage:store(session)});
 return {dialog,checks,button,events,local,session};
}
test('help reappears on next launch until checkbox and explicit close are used',()=>{
 const f=fixture();assert(f.dialog.open);f.button.click();assert(!f.dialog.open);assert.equal(f.local.size,0);
 const next=fixture(f.local);assert(next.dialog.open);next.checks.checked=true;next.button.click();assert(!next.dialog.open);
 assert(!fixture(next.local).dialog.open);
});
test('checking alone or dismissing with back does not opt out, and internal navigation is quiet',()=>{
 const f=fixture();f.checks.checked=true;f.dialog.close();assert.equal(f.local.size,0);assert(!fixture(f.local,f.session).dialog.open);
 f.events.visibilitychange();assert(f.dialog.open);assert.equal(f.checks.checked,false);
});
