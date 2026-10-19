import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("Deployment preparation keeps partial-setup credentials, uses private files and fails before generating keys when inputs are missing", () => {
  const root = mkdtempSync(join(tmpdir(), "solair-deployment-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "packages/engine"), { recursive: true });
    copyFileSync(
      resolve("scripts/prepare-team.mjs"),
      join(root, "scripts/prepare-team.mjs"),
    );
    writeFileSync(
      join(root, "packages/engine/Core.cjs"),
      "// isolated deployment fixture",
    );
    const run = (origin = "https://manuscript.example") =>
      spawnSync(
        process.execPath,
        [
          join(root, "scripts/prepare-team.mjs"),
          origin,
          "https://script.google.com/macros/s/test-deployment/exec",
        ],
        { encoding: "utf8" },
      );
    assert.notEqual(run("http://unsafe.example").status, 0);
    assert.notEqual(run().status, 0);
    assert(!existsSync(join(root, ".local/deployment")));
    mkdirSync(join(root, "deploy/context"), { recursive: true });
    for (const name of [
      "SOLAIR-reconciled-setup-baseline.md",
      "SOLAIR-GUI-Orca-plan.md",
    ])
      writeFileSync(join(root, "deploy/context", name), "Test context only");
    const success = run();
    assert.equal(success.status, 0, success.stderr);
    const dir = join(root, ".local/deployment"),
      config = JSON.parse(readFileSync(join(dir, "team.json"), "utf8"));
    assert.equal(config.privateImageTrials, false);
    assert.equal(
      new Set(Object.values(config.workers).map((w: any) => w.key)).size,
      4,
    );
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    const keys = [
      "google-bridge.key",
      ...[1, 2, 3, 4].map((s) => `worker${s}.key`),
    ];
    const original = keys.map((name) => readFileSync(join(dir, name), "utf8"));
    for (let i = 0; i < keys.length; i++) {
      assert.equal(statSync(join(dir, keys[i])).mode & 0o777, 0o600);
      assert(!success.stdout.includes(original[i]));
    }
    unlinkSync(join(dir, "team.json"));
    const retry = run();
    assert.notEqual(retry.status, 0);
    assert.match(retry.stderr, /partial setup/);
    assert(!existsSync(join(dir, "team.json")));
    assert.deepEqual(
      keys.map((name) => readFileSync(join(dir, name), "utf8")),
      original,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Laptop setup requires an explicit origin, preserves credentials and prepares four isolated loopback workers',()=>{
 const root=mkdtempSync(join(tmpdir(),'solair-laptop-'));
 try{
  for(const name of ['scripts','deploy/context','deploy/google','packages/engine'])mkdirSync(join(root,name),{recursive:true});
  for(const name of ['prepare-team.mjs','prepare-laptop-team.mjs'])copyFileSync(resolve('scripts',name),join(root,'scripts',name));
  writeFileSync(join(root,'packages/engine/Core.cjs'),'// isolated engine');
  writeFileSync(join(root,'deploy/worker-config.toml'),'forced_login_method = "chatgpt"\ncli_auth_credentials_store = "file"\n');
  for(const name of ['SOLAIR-reconciled-setup-baseline.md','SOLAIR-GUI-Orca-plan.md'])writeFileSync(join(root,'deploy/context',name),'Fixture context');
  const run=(args:string[])=>spawnSync(process.execPath,[join(root,'scripts/prepare-laptop-team.mjs'),...args],{encoding:'utf8'});
  assert.notEqual(run([]).status,0);assert(!existsSync(join(root,'.local/deployment')));
  const result=run(['https://manuscript.example']);assert.equal(result.status,0,result.stderr);
  const dir=join(root,'.local/deployment'),config=JSON.parse(readFileSync(join(dir,'team.json'),'utf8'));assert.equal(config.localGoogleConnector,true);assert.equal(config.googleBridge,undefined);
  for(const slot of [1,2,3,4]){assert.equal(config.workers[slot].url,`http://127.0.0.1:${4790+slot}`);assert.equal(readFileSync(join(dir,`worker${slot}.key`),'utf8'),config.workers[slot].key);assert(existsSync(join(root,`.local/workers/member${slot}/.codex/config.toml`)));}
  const before=readFileSync(join(dir,'team.json'),'utf8');assert.notEqual(run(['https://other.example']).status,0);assert.equal(readFileSync(join(dir,'team.json'),'utf8'),before);
 }finally{rmSync(root,{recursive:true,force:true});}
});
