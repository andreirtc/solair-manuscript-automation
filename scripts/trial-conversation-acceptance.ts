import { Codex } from '../apps/server/src/codex.ts';
import { Manuscript, Engine, TARGET } from '../apps/server/src/manuscript.ts';
import { Store } from '../apps/server/src/store.ts';
import { sourceHash } from '../apps/server/src/source-snapshots.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('.'), project=resolve('..'), dir=resolve('.local/acceptance/conversation-trial');
mkdirSync(dir,{recursive:true,mode:0o700}); const store=new Store(dir), c=new Codex(root), m=new Manuscript(store,c,project);
const actor={id:'developer-conversation-acceptance',name:'Developer acceptance fixture',username:'developer-fixture',role:'owner' as const,slot:0};
try {
 await store.context.run(actor,async()=>{
  const raw=await m.refreshRaw(); assert.equal(raw.documentId,TARGET.document_id);
  const ps=Engine.paragraphs(Engine.normalize(raw).tabs.find((t:any)=>t.tabId===TARGET.tab_id));
  const p=ps.find((p:any)=>p.text.trim()==='Introduction'); assert(p);
  const old=p.paragraph.paragraphStyle?.keepLinesTogether??false;
  const sid='aaaaaaaa-1111-4111-8111-111111111111', text='Synthetic acceptance context. Only heading formatting is tested; this is not research evidence.';
  mkdirSync(join(dir,'sources'),{recursive:true});writeFileSync(join(dir,'sources',sid),text,{mode:0o600});
  store.put('source',{id:sid,name:'Developer acceptance notes.md',mime:'text/markdown',preparedKind:'text',origin:'upload',evidenceReviewed:false,status:'needs_mapping',sha256:sourceHash(text),createdAt:new Date().toISOString()});
  const receipts=[];
  for(const value of [!old,old]){
   const j=m.create('Developer fixture: reversible duplicate heading flow check',[{type:'format_paragraph',expected_text:'Introduction',paragraph_style:{keepLinesTogether:value},evidence:'Developer acceptance only, no research claim; unreviewed context '+sid}],[sid],'developer_acceptance',undefined,'proposal_review');
   const p=await m.dryRun(j.id); assert.equal(p.status,'dry_run_ready');m.approveReview(j.id,p.review!.hash,p.review!.changes.map(c=>c.id),'');
   const applied=await m.apply(j.id,p.baseRevision!,j.id);assert(applied.verification?.native);assert.equal(applied.target,'trial');
   receipts.push({jobId:applied.id,target:applied.documentId,native:applied.verification.native,layout:applied.verification.layout,sourceStillUnreviewed:!store.get('source',sid).evidenceReviewed,backup:applied.backup?.id});
  }
  writeFileSync(join(dir,'receipt.json'),JSON.stringify({checkedAt:new Date().toISOString(),duplicateOnly:true,restoredOriginalHeadingProperty:true,receipts},null,2),{mode:0o600});
  console.log(JSON.stringify({duplicateOnly:true,passes:receipts.length,nativeVerified:true,restored:true,layout:'pending'}));
 });
}finally{c.stop();store.close();}
