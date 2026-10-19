import { Store } from '../apps/server/src/store.ts';
import { Manuscript } from '../apps/server/src/manuscript.ts';
import { Codex } from '../apps/server/src/codex.ts';
import { createApp } from '../apps/server/src/app.ts';
import { sourceBytes } from '../apps/server/src/source-snapshots.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';
const dir=resolve('.local/acceptance/context-replay');mkdirSync(dir,{recursive:true,mode:0o700});
const source=new Store('.local'),store=new Store(dir),tid='cee919d1-d398-4b05-9ccf-3e932dcbabf2';
for(const kind of ['source','snapshot','historical','job'])for(const value of source.list(kind))store.put(kind,value);
const prior=source.get('thread',tid), last=prior.messages.filter((m:any)=>m.role==='user').at(-1);
store.put('thread',{...prior,messages:prior.messages.filter((m:any)=>m.status==='complete')});
mkdirSync(join(dir,'sources'),{recursive:true});for(const s of source.list('source')){try{writeFileSync(join(dir,'sources',s.id+(s.image?(s.image.mime==='image/png'?'.png':'.jpg'):'')),sourceBytes(source,s),{mode:0o600});}catch{}}
const snapshot=source.get('snapshot','1rgMme-k53PQdyBDcAi43mDfrCxrt2LJlIFU-fz5P7NM').raw;source.close();
const codex=new Codex('.'),m=new Manuscript(store,{tool:async name=>{assert.equal(name,'get_document');return structuredClone(snapshot);}},resolve('..'),'maintained');
let prompt='';codex.models=async()=>[{model:'gpt-6.1-sol',label:'Fixture',efforts:['high']}];codex.propose=async(_pid,text)=>{assert(!text.startsWith('SOLAIR_SCOPE_ROUTING'));prompt=text;return JSON.stringify({answer:'Read-only context replay passed.',operations:[],workbench:null});};
const server=createApp(store,codex,m,resolve('..')).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
try{
 const r=await fetch(`http://127.0.0.1:${(server.address()as any).port}/api/v1/chat/threads/${tid}/messages`,{method:'POST',headers:{'Content-Type':'application/json','X-SOLAIR-Client':'web'},body:JSON.stringify({text:last.text,task:'conversation',research:false})});assert.equal(r.status,202);
 for(let i=0;i<500&&store.get('thread',tid).messages.at(-1).status==='running';i++)await new Promise(r=>setTimeout(r,20));
 const t=store.get('thread',tid),lastMessage=t.messages.at(-1);assert.equal(lastMessage.status,'complete',lastMessage.text);assert(prompt);
 const receipt=store.get('context_receipt',lastMessage.id);assert.equal(receipt.includedParagraphs,receipt.selectedParagraphs);assert.equal(receipt.selectedParagraphs,123);
 assert(prompt.includes('resistor-load demonstration fallback'));assert(prompt.includes('why does the scope and limitation include'));
 writeFileSync(join(dir,'prepared-prompt.txt'),prompt,{mode:0o600});writeFileSync(join(dir,'receipt.json'),JSON.stringify({...receipt,exactFailedRequestReplayed:true,nativeWrites:0},null,2),{mode:0o600});console.log(JSON.stringify({...receipt,threadId:undefined,id:undefined,exactFailedRequestReplayed:true,nativeWrites:0}));
}finally{await new Promise<void>(r=>server.close(()=>r()));store.close();}
