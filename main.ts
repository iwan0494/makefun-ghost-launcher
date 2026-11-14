// main.ts — make.fun bounty deliverable (Node 22, standard library only).
//
// This program copies LAUNCH.json from the repository to /output.
// That is all it has to do (per the bounty rules: "main.ts copies
// LAUNCH.json from the repository to /output").
//
// The coin itself ("MakeFun Ghost", GHOST) was already launched on pump.fun
// by the agent during the race; LAUNCH.json records the on-chain mint and
// the create transaction's signature. The launcher that performed the
// launch is kept in this repo as launcher.ts for reference.
// It is NOT run here — the grader runs this file in a sandbox with no
// network, so it must not need a keypair or an RPC.
//
// Usage: node main.ts
const fs = require('node:fs');
const path = require('node:path');

const outDir = '/output';
fs.mkdirSync(outDir, { recursive: true });
const src = path.join(__dirname, 'LAUNCH.json');
const data = fs.readFileSync(src, 'utf8');
// Validate the two required fields before copying.
const obj = JSON.parse(data);
if (typeof obj.mint !== 'string' || typeof obj.create_signature !== 'string') {
  throw new Error('LAUNCH.json must contain mint and create_signature strings');
}
fs.writeFileSync(path.join(outDir, 'LAUNCH.json'), data);
console.log('Copied LAUNCH.json to /output/LAUNCH.json');
