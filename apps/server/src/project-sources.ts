import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Source } from "../../../packages/contracts/index.ts";
import { Store, id, now } from "./store.ts";
import { sourceHash } from "./source-snapshots.ts";

/** Only these explicitly supplied project notes are imported, never arbitrary workspace files. */
export function importProjectSources(store: Store, project: string) {
  const result: Source[] = [];
  for (const name of [
    "electrical-and-mechanical-system-findings-in-bemac.md",
    "Research-Instrument.md",
    "PROJECT-NOTES.md",
    "INSTRUMENT-REVIEW-DP2.md",
  ]) {
    const path = join(project, "manuscript-app", name);
    if (!existsSync(path)) continue;
    const bytes = readFileSync(path);
    if (!bytes.length || bytes.length > 200000) continue;
    const sha256 = sourceHash(bytes);
    let source = store
      .list<Source>("source")
      .find((s) => s.projectFile === name && s.sha256 === sha256);
    if (!source) {
      source = {
        id: id(),
        name,
        mime: "text/markdown",
        sha256,
        size: bytes.length,
        projectFile: name,
        origin: "upload",
        preparedKind: "text",
        preparedAt: now(),
        evidenceReviewed: false,
        status: "needs_mapping",
        createdAt: now(),
        extractionNotice:
          "Team-supplied notes. Reported measurements, seller ratings, estimates and proposals require separate attribution; this is not an independent equipment inspection.",
        provenance: { kind: "team_notes", title: name },
      };
      mkdirSync(join(store.dir, "sources"), { recursive: true, mode: 0o700 });
      writeFileSync(join(store.dir, "sources", source.id), bytes, {
        mode: 0o600,
      });
      store.put("source", source);
      store.activity(
        "project_source_imported",
        `Added a frozen copy of ${name}; human evidence review is pending.`,
        undefined,
        "project_import",
      );
    }
    result.push(source);
  }
  return result;
}
