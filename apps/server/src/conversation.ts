import type { Store } from "./store.ts";
import type { Source, Thread } from "../../../packages/contracts/index.ts";
export const excludedSource = (s?: Source) => s?.id === "b79ae964-09aa-4264-ab8e-255e4be91af3" || /^Research Instrument\.pdf$/i.test(s?.name || "");
export function retrievalQuery(t: Thread, text: string) {
  return t.messages.filter(m => m.status === "complete").slice(-3).map(m => m.text.slice(-1800)).join("\n") + "\n" + text;
}
export const conversationPolicy = `CONVERSATIONAL WORKFLOW — latest team direction:
Work like an active thesis collaborator in this chat. Read, reconcile, locate sections and prepare exact proposals yourself. Do not send the user to inspect a map, prepare a finding request, mark every file reviewed or change task modes. Sources are supplied reports, not independently verified facts. Review their use together with exact before/after changes; cite source IDs and explain any limitations in the answer. Never mark a source human-reviewed yourself. Do not use unselected questionnaire records or invent research data. New public findings must be imported as frozen sources before factual edit operations cite them.
Ask at most ONE consequential question at a time, with your recommended choice and short explanation; accept natural replies. Do useful independent work, do not repeat answered questions, and do not overwhelm the user with a huge workbench/checklist. For SOP decisions explain retain/adapt/adapt with changes and why, one decision at a time; finalized SOP stays protected until a separate authorized workflow changes that protection. Routine supported corrections can be prepared now as one manageable exact proposal. Approval always belongs to the human; a chat reply is not an automatic write. Explain that the before/after proposal has one Approve and apply action. Never ask for review essays or paragraph IDs. After each response stop for the team's reply rather than making unattended writes.
Chapter 1 introduction uses inverted-pyramid structure and relevant SDGs. Scope and Limitations describes the WHOLE study in ordinary academic prose: system/functions, intended vehicle, participants/locations, evaluation coverage, deliberate boundaries and substantive interpretation/generalizability constraints. Never bound it to DP1 or mention DP1 there. Exclude temporary development problems, pending component/controller decisions, consultation to-do lists and the resistor-load demonstration fallback; put these in relevant testing/development procedures, not the overall study boundary. Do not use internal editing/process phrases such as "as specified in the finalized Statement of the Problem", "finalized SOP", "approved wording" or "adviser review" in manuscript prose; state the evaluation coverage directly. Align with the research questions through substance. Describe unperformed testing honestly in appropriate methodology/status passages. For an explicit whole-chapter request, inspect every supplied Chapter 1 passage, list the supported substantive changes and prepare the useful exact wording batch now; do not merely offer another plan or rewrite already adequate prose. Distinguish remaining figures, unresolved research decisions and print checks honestly; never claim a chapter complete based on partial context. Chapter 2 needs relevant REAL visuals from supplied studies or original public sources, correct captions and placement sampled from the current native manuscript. No AI-generated research visuals/data. Chapter 3 diagram changes may need precise human editing instructions.
Sampling MD and PDF are identical companion exports of ONE revision; prefer MD for text, PDF for equation/visual crosschecks; do not double-count as independent evidence. Research Instrument.pdf is unrelated and excluded; use Research-Instrument.md. Wind is 300 W SELLER-LISTED, with UNLABELLED turbine/controller, not verified 400 W. Solar is separately two 200 W panels. Latest user corrections override stale notes and earlier assistant advice. Preserve school-layout tab, native figures/equations, finalized SOP and original manuscript. Never claim full reading when context excerpts are partial. Keep final scientific and PDF/pagination checks explicit.`;

const revisionFiles = new Set(["Revision-for-DP1.md", "Computation-of-Sampling-for-Problem-Validation.md", "Computation-of-Sampling-for-Problem-Validation-1.pdf", "TSU-SOLARCHARGER-BEMAC_inquest2018_part1.pdf", "TSU-SOLARCHARGER-BEMAC_inquest-2020_part2.pdf", "UPD-BEMAC.pdf"]);
/** Known selected revision bundle only; never indiscriminately include interview exports or synthetic fixtures. */
export function revisionContext(store: Store, retained: string[]) {
  const sources = store.list<Source>("source"), latest = new Map<string, Source>();
  for (const s of sources) if ((s.projectFile || revisionFiles.has(s.name)) && !latest.has(s.projectFile || s.name)) latest.set(s.projectFile || s.name, s);
  const ids = [...new Set([...retained.filter(id => { const s = store.get<Source>("source", id); return s && !excludedSource(s) && (!s.projectFile || latest.get(s.projectFile)?.id === id); }), ...[...latest.values()].map(s => s.id)])];
  return ids;
}

/** Stay below both worker schema and UTF-8 JSON transport ceilings, including request metadata. */
export function contextFits(prompt: string) {
  return prompt.length <= 170000 && Buffer.byteLength(JSON.stringify({prompt}), "utf8") <= 220000;
}
/** Keep human decisions complete, deduplicate retries, and bound repeated assistant explanations. */
export function conversationContext(t: Thread) {
  const complete = t.messages.filter(m => m.status === "complete");
  const users: typeof complete = [], seen = new Set<string>(); let userBudget = 24000;
  for (const m of [...complete].reverse()) if (m.role === "user" && !seen.has(m.text)) {
    seen.add(m.text);
    if (m.text.length <= userBudget) { users.unshift(m); userBudget -= m.text.length; }
  }
  const recent = complete.filter(m => m.role === "assistant").slice(-4);
  return complete.filter(m => users.includes(m) || recent.includes(m)).map(m => ({role:m.role, text:m.role === "user" ? m.text : m.text.slice(0,2000), member:m.actor?.name}));
}

/** Prioritize primary revision drafts for a whole-chapter pass, keeping every file available. */
export function sourceWeight(name: string, query: string) {
  if (/^Revision-for-DP1\.md$/i.test(name)) return 4;
  if (/^Computation-of-Sampling-for-Problem-Validation\.md$/i.test(name)) return 4;
  if (/^Computation-of-Sampling-for-Problem-Validation.*\.pdf$/i.test(name)) return 0.6;
  if (/^Pasted text\.txt$/i.test(name)) return 0.5;
  if (/chapter\s*1\b/i.test(query) && /Research-Instrument|INSTRUMENT-REVIEW-DP2/i.test(name)) return 0.4;
  if (/chapter\s*2\b/i.test(query) && /TSU-|UPD-BEMAC/i.test(name)) return 3;
  return 1;
}
