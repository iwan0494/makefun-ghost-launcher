# AI Coding-Agent Transcripts — makefun-coin-launch-01

This submission was built autonomously by AI agents (Muse / Wowo) at the
user's direction. No human wrote or edited the launcher code by hand.

## Agent 1 — Launcher builder (subagent)

**Task:** Build a zero-dependency pump.fun coin launcher (`main.ts`, Node 22
stdlib only) for the make.fun bounty. Read `https://make.fun/skill.md`,
research the zero-dependency `create` flow, download the ghost mascot
unmodified, prepare metadata, write `main.ts`, and **simulate only** (never
submit a real transaction).

**Work done:**
- Downloaded the make.fun press kit and extracted the ghost mascot
  (`ghost.png`, 1024×1024, unmodified).
- Researched the pump.fun `create` instruction (program
  `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`, legacy SPL + Metaplex,
  14 accounts) and implemented it from scratch: base58, ed25519 signing
  (PKCS8 DER), PDA derivation with off-curve checks, Borsh serialisation,
  v0 message compilation, and Solana JSON-RPC — all with Node stdlib only
  (`node:crypto`, `node:fs`, global `fetch`).
- Wrote `main.ts` (15,837 bytes). Validated end-to-end: the zero-dependency
  path simulates clean, and its wire transaction (798 bytes) is byte-identical
  to the same transaction built with `@solana/web3.js`.
- Attempted the bundled first `buy`: simulation fails with
  `BuybackFeeRecipientMissing` (sell.rs:145). Verified the buyback fee
  recipient addresses directly from the on-chain Global account (programmatic
  IDL offsets) — they match what was passed, so the handler expects a
  different account layout than the IDL shows. Stopped pursuing the buy per
  instructions; **create-only is sufficient for the launch**.
- Attempted IPFS upload of the image + metadata (pump.fun `/api/ipfs`,
  ipfs.io, 0x0.st, catbox.moe) — all blocked/failed from this environment.
  Left `METADATA_URI` as a placeholder in `main.ts` for the parent to replace.
- **Did not submit any real transaction.** Only simulations. No SOL spent.

## Agent 2 — Launch operator (parent agent, Muse / Wowo)

**Task:** Take the built launcher to a real launch on the user's explicit
"Gas" / "Ayo wo" order, after the simulation results were reported.

**Work done:**
- Re-ran the simulation independently (`simulate.js`, web3.js): `create`
  instruction SUCCESS, ATA creation SUCCESS, `buy` FAILED
  (`BuybackFeeRecipientMissing`). Confirmed create-only as the launch path.
- Hosted the ghost mascot + metadata JSON (description contains the exact
  sentence `"made for make.fun $1000 bounty"`) and obtained a real metadata
  URI. Updated `main.ts`'s `METADATA_URI` to it.
- Built `launch.js` (web3.js, create-only), which simulates first and only
  submits when the simulation is clean. Ran it on the user's "Gas" order.
- **Launch executed 2026-11-14 ~10:26 WIB:** coin **MakeFun Ghost (GHOST)**,
  mint `B8dpF7tRXtzVANhoc9VkyGHpbVTdoMkqY9TvCJKMUqY7`, creation signature
  `45DbMXv63B2266vDsqR2G6Gv9usAfDDtFnEGULfpgo21bpLQgKUF4gLcnxkytUEErEEMrUC6kJafkBmfaZ1W14rr`
  (slot 469176500, confirmed). Cost ≈ 0.0178 SOL. Verified on-chain: mint
  exists, supply 1,000,000,000 (6 decimals), mint/freeze authority revoked.
- Assembled this repo (clean copy of deliverables only — the wallet keypair
  is never included) and this transcript file.

## Wallet

- Creator wallet: `9e6z77wgZjFsUYCVv1cfq4XJ4zQA2hdJttEu6kZ75s1p`
  (fresh Solana wallet created for this bounty at the user's order; funded
  with ~0.0328 SOL by the user).
- The wallet's private key is stored only in the operator's local
  `keypair.json` and is **not** part of this repository.
