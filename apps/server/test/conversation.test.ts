import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../src/store.ts';
import { Codex } from '../src/codex.ts';
import { Manuscript, Engine, TARGET } from '../src/manuscript.ts';
import { createApp } from '../src/app.ts';
import { revisionContext } from '../src/conversation.ts';
import { sourceHash } from '../src/source-snapshots.ts';
import type { Source, Thread } from '../../../packages/contracts/index.ts';
const project = resolve('..'), fixture = JSON.parse(readFileSync(resolve(project, 'work/manuscript-automation/trial-before/document-result.json'), 'utf8')).structuredContent;
const sid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'solair-conversation-')), store = new Store(dir), codex = new Codex('.'), doc = structuredClone(fixture), calls: string[] = [];
  const m = new Manuscript(store, { tool: async (name, args) => {
    calls.push(name);
    if (name === 'get_document') return structuredClone(doc);
    if (name === 'copy_file') return { id: 'synthetic-backup' };
    if (name === 'batch_update_document') {
      assert.equal(args.write_control.requiredRevisionId, doc.revisionId);
      const tab = doc.tabs.find((t: any) => t.tabId === TARGET.tab_id);
      for (const r of args.requests) {
        if (r.updateParagraphStyle) Object.assign(Engine.paragraphs(tab).find((p: any) => p.start === r.updateParagraphStyle.range.startIndex).paragraph.paragraphStyle, r.updateParagraphStyle.paragraphStyle);
        if (r.createNamedRange) { tab.namedRanges ||= {}; tab.namedRanges[r.createNamedRange.name] = { name: r.createNamedRange.name }; }
      }
      doc.revisionId += 'updated'; return {};
    }
    throw new Error('Unexpected tool ' + name);
  } }, project);
  await m.refresh();
  const section = m.sections().find(s => s.title === 'Introduction')!;
  const text = 'Seller lists wind 300 W; actual turbine/controller unlabelled.';
  const source: Source = { id: sid, name: 'Messy notes.md', mime: 'text/markdown', sha256: sourceHash(text), preparedKind: 'text', origin: 'upload', evidenceReviewed: false, status: 'needs_mapping', createdAt: new Date().toISOString() };
  mkdirSync(join(dir, 'sources')); writeFileSync(join(dir, 'sources', sid), text); store.put('source', source);
  codex.models = async () => [{ model: 'gpt-6.1-sol', label: 'Fixture', efforts: ['high'] }];
  const server = createApp(store, codex, m, project).listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  const request = async (path: string, body?: any, headers = {}) => {
    const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-SOLAIR-Client': 'web', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ...await res.json() };
  };
  const t = (await request('/chat/threads', { title: 'Conversational revision' })).data as Thread;
  const send = (text: string) => request(`/chat/threads/${t.id}/messages`, { text, task: 'conversation', sectionIds: [section.id], contextSourceIds: [sid] });
  const wait = async () => { for (let i=0;i<300;i++) { const latest = store.get<Thread>('thread', t.id)!; if (!latest.messages.some(m => m.status === 'running')) return latest; await new Promise(r => setTimeout(r, 10)); } throw new Error('Fixture timeout'); };
  return { store, codex, m, doc, source, calls, section, t, request, send, wait, server, close: async () => { await new Promise<void>(r => server.close(() => r())); store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('Conversation prepares an unmapped-source preview automatically; one exact approval applies with backup and native verification', async () => {
  const s = await setup();
  try {
    s.codex.propose = async (_pid, prompt) => { assert.match(prompt, /CONVERSATIONAL WORKFLOW/); assert.match(prompt, /Seller lists wind 300 W/); return JSON.stringify({ answer: 'I recommend this small formatting batch.', operations: [{ type: 'format_paragraph', expected_text: 'Introduction', paragraph_style: { keepWithNext: true }, evidence: 'Explicit user formatting request; supplied context ' + sid }], workbench: null }); };
    assert.equal((await s.send('Keep the introduction heading with its paragraph.')).status, 202);
    const t = await s.wait(), last = t.messages.at(-1)!;
    assert.equal(last.status, 'complete', last.text);
    const job = s.m.get(last.jobId!); assert.equal(job.status, 'dry_run_ready'); assert.equal(job.sourceReviewMode, 'proposal_review'); assert(job.review?.changes.length);
    assert.equal(s.store.get<Source>('source', sid)!.evidenceReviewed, false);
    assert(!s.calls.includes('copy_file'));
    const path = '/jobs/' + job.id + '/approve-and-apply', body = { previewHash: job.review!.hash, baseRevision: job.baseRevision, acknowledged: true };
    assert.equal((await s.request(path, { ...body, acknowledged: false })).status, 400);
    assert.equal((await s.request(path, { ...body, previewHash: '0'.repeat(64) }, { 'Idempotency-Key': job.id })).status, 409);
    const result = await s.request(path, body, { 'Idempotency-Key': job.id });
    assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.data.verification.native, true); assert.equal(result.data.verification.layout, 'pending');
    assert(s.calls.indexOf('copy_file') < s.calls.indexOf('batch_update_document'));
    assert.equal((await s.request(path, body, { 'Idempotency-Key': job.id })).status, 200);
    assert.equal(s.calls.filter(c => c === 'batch_update_document').length, 1);
  } finally { await s.close(); }
});
test('Conversation review keeps byte changes, ineligible survey rows and protected SOP blocked', async () => {
  const s = await setup();
  try {
    const op = { type: 'format_paragraph' as const, expected_text: 'Introduction', paragraph_style: { keepWithNext: true }, evidence: 'Fixture request' };
    const j = s.m.create('Fixture', [op], [sid], 'gui_chat', undefined, 'proposal_review'); const preview = await s.m.dryRun(j.id);
    s.store.put('source', { ...s.source, description: 'Changed meaning' });
    assert.throws(() => s.m.approveReview(j.id, preview.review!.hash, preview.review!.changes.map(c => c.id), ''), /Source content/);
    const csv = 'Code,Answer\nTEST,NEVER_USE_THIS_RESULT\n'; s.store.put('source', { ...s.source, name: 'Forms.csv', mime: 'text/csv', sha256: sourceHash(csv) }); writeFileSync(join(s.store.dir, 'sources', sid), csv);
    const tableJob = s.m.create('Fixture table', [op], [sid], 'gui_chat', undefined, 'proposal_review'); await assert.rejects(s.m.dryRun(tableJob.id), /eligible table records/);
    s.codex.propose = async (_pid, prompt) => { assert(!prompt.includes('NEVER_USE_THIS_RESULT')); return JSON.stringify({ answer: 'Rows need genuine-record selection.', operations: [], workbench: null }); };
    await s.send('Review these notes'); assert.equal((await s.wait()).messages.at(-1)?.status, 'complete');
    const a = s.m.outline().find(a => a.protected && a.text.trim().length > 5)!;
    const protectedJob = s.m.create('Fixture SOP edit', [{ type: 'replace_text', before: a.text, after: 'Changed', anchorId: a.id, evidence: 'Fixture only' }], [], 'gui_chat', undefined, 'proposal_review');
    await assert.rejects(s.m.dryRun(protectedJob.id)); assert(!s.calls.includes('copy_file'));
  } finally { await s.close(); }
});
test('Guidance is saved during an active answer, delivered live when available, otherwise followed automatically without applying', async () => {
  for (const live of [true, false]) {
    const s = await setup();
    try {
      let release!: () => void, started!: () => void, calls=0;
      const began = new Promise<void>(r => started=r), gate = new Promise<void>(r => release=r);
      s.codex.steer = async (text, pid) => { assert.equal(pid, 'fixture-provider'); assert.equal(text, 'Keep whole-study scope'); return { delivered: live }; };
      s.codex.propose = async (_pid, prompt, _delta, provider) => { calls++; provider('fixture-provider'); if (calls === 1) { started(); await gate; } else assert.match(prompt, /Keep whole-study scope/); return JSON.stringify({ answer: 'Fixture answer', operations: [], workbench: null }); };
      await s.send('Consolidate the introduction'); await began;
      const g = await s.request(`/chat/threads/${s.t.id}/guidance`, { text: 'Keep whole-study scope' }); assert.equal(g.status, 202); assert.equal(g.data.delivery, live ? 'steered' : 'queued'); release();
      const t = await s.wait(); assert.equal(calls, live ? 1 : 2); assert.equal(t.messages.find(m => m.guidance)?.guidance, live ? 'steered' : 'following'); assert.equal(s.store.list('job').length, 0);
    } finally { await s.close(); }
  }
});
test('Codex steering is bound to the actual active provider and turn, with an honest unavailable fallback', async () => {
  const c = new Codex('.'), calls: any[]=[]; c.rpc = async (method, params) => { calls.push({method,params}); return {}; };
  assert.deepEqual(await c.steer('Guidance', 'one'), {delivered:false}); c.activeTurn = {threadId:'one',turnId:'active-one'};
  assert.deepEqual(await c.steer('Guidance', 'other'), {delivered:false}); assert.equal(calls.length,0);
  assert.deepEqual(await c.steer('Guidance', 'one'), {delivered:true}); assert.equal(calls[0].params.expectedTurnId,'active-one');
  c.rpc = async () => {throw new Error('Turn ended');}; assert.deepEqual(await c.steer('Guidance','one'),{delivered:false});
});

test('Required revision bundle is automatic, version-aware and excludes unrelated instruments, survey exports and fixtures', async () => {
 const s = await setup(); try {
  const put = (id:string,name:string,projectFile?:string) => s.store.put('source',{...s.source,id,name,projectFile});
  put('old-notes','PROJECT-NOTES.md','PROJECT-NOTES.md'); put('new-notes','PROJECT-NOTES.md','PROJECT-NOTES.md');
  put('revision','Revision-for-DP1.md'); put('study','UPD-BEMAC.pdf'); put('wrong','Research Instrument.pdf'); put('forms','Forms.csv'); put('fixture','Synthetic fixture.png');
  const context = revisionContext(s.store,['old-notes','wrong',sid]);
  assert(context.includes('new-notes')); assert(context.includes('revision')); assert(context.includes('study')); assert(context.includes(sid));
  for(const id of ['old-notes','wrong','forms','fixture']) assert(!context.includes(id));
 } finally {await s.close();}
});

test('Whole Chapter 1 bypasses scope inference and fits a retained 25-source Unicode bundle without losing human corrections', async () => {
 const s=await setup();
 try {
  const ids: string[]=[];
  for(let i=0;i<25;i++){
   const id=`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`,text=('Chapter 1 scope SDG study whole project: 一二三四五六七八九十\n').repeat(1500);
   ids.push(id);s.store.put('source',{...s.source,id,name:`Study notes ${i}.md`,sha256:sourceHash(text)});writeFileSync(join(s.store.dir,'sources',id),text);
  }
  const t=s.store.get<Thread>('thread',s.t.id)!;
  t.messages.push({id:'prior-correction',role:'user',text:'Scope covers the whole research, never the temporary resistor-load fallback. '+('Older detail. '.repeat(150)),createdAt:new Date().toISOString(),status:'complete'});s.store.put('thread',t);
  let seen=false;
  s.codex.propose=async(pid,prompt)=>{
   assert.equal(pid,undefined,'Conversational prompt must not re-append its large bundle to provider history');
   assert(!prompt.startsWith('SOLAIR_SCOPE_ROUTING'));assert(prompt.length<=170000);assert(Buffer.byteLength(JSON.stringify({prompt}))<=220000);
   assert.match(prompt,/never the temporary resistor-load fallback/);assert.match(prompt,/resistor-load demonstration fallback/);
   for(const id of ids)assert(prompt.includes(id));seen=true;
   return JSON.stringify({answer:'Exact chapter review prepared from supplied context.',operations:[],workbench:null});
  };
  const response=await s.request(`/chat/threads/${s.t.id}/messages`,{text:'continue and give me everything we need to change in chapter 1 so i can approve and finish the whole chapter 1. chapter 1 revision up to chapter 2 isnt really that long',task:'conversation',contextSourceIds:ids});
  assert.equal(response.status,202);const finished=await s.wait();assert.equal(finished.messages.at(-1)?.status,'complete',finished.messages.at(-1)?.text);assert(seen);
  const receipt=s.store.get('context_receipt',finished.messages.at(-1)!.id);assert.equal(receipt.retainedSources,25);assert.equal(receipt.includedParagraphs,receipt.selectedParagraphs);assert.equal(s.calls.filter(x=>x==='batch_update_document').length,0);
 } finally {await s.close();}
});

test('Host repair resumes only the existing accepted context-failed request once, preserving its actor and adding no user turn or approval', async () => {
 const s=await setup(); let replacement: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
 try {
  s.codex.propose=async()=>{throw new Error('context too large');}; await s.send('Continue the current revision');const failed=await s.wait();
  const user=failed.messages.find(m=>m.role==='user')!,assistant=failed.messages.at(-1)!;assert.equal(assistant.status,'failed');
  s.store.put('chat_retry',{id:'repair-once',threadId:s.t.id,userMessageId:user.id,failedMessageId:assistant.id,status:'pending'});
  s.codex.propose=async()=>JSON.stringify({answer:'Resumed exact saved request.',operations:[],workbench:null});
  replacement=createApp(s.store,s.codex,s.m,project).listen(0,'127.0.0.1');await new Promise<void>(r=>setTimeout(r,30));const result=await s.wait();
  assert.equal(result.messages.filter(m=>m.role==='user').length,failed.messages.filter(m=>m.role==='user').length);
  assert.equal(result.messages.at(-1)?.actor?.id,user.actor?.id);assert.equal(result.messages.at(-1)?.status,'complete');assert.equal(s.store.get('chat_retry','repair-once').status,'started');assert.equal(s.store.list('approval').length,0);
 } finally {if(replacement)await new Promise<void>(r=>replacement!.close(()=>r()));await s.close();}
});
