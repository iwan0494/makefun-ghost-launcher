# MakeFun Ghost — make.fun $1000 Bounty Launcher

A zero-dependency pump.fun coin launcher, built for the make.fun bounty
**"Race to launch a real coin on Solana"** (`makefun-coin-launch-01`).

## The coin

- **Name:** MakeFun Ghost
- **Symbol:** GHOST
- **Mint:** `B8dpF7tRXtzVANhoc9VkyGHpbVTdoMkqY9TvCJKMUqY7`
- **Creation tx:** `45DbMXv63B2266vDsqR2G6Gv9usAfDDtFnEGULfpgo21bpLQgKUF4gLcnxkytUEErEEMrUC6kJafkBmfaZ1W14rr`
- **Launched:** 2026-11-14 (slot 469176500)
- **Logo:** the official make.fun ghost mascot (`ghost.png`, unmodified from the
  make.fun press kit)
- **Metadata:** `metadata.json` — description contains the required sentence
  `"made for make.fun $1000 bounty"`.
- **View it:** https://solscan.io/token/B8dpF7tRXtzVANhoc9VkyGHpbVTdoMkqY9TvCJKMUqY7

## Files

| File | What it is |
|---|---|
| `main.ts` | The launcher. Zero-dependency (Node 22 stdlib only). Reads `./keypair.json`, creates a fresh mint, sends the pump.fun `create` instruction, confirms, and prints `LAUNCH.json`. |
| `LAUNCH.json` | The launch record: mint + creation signature. |
| `ghost.png` | The make.fun ghost mascot, unmodified. |
| `metadata.json` | Token metadata (name, symbol, description, image). |
| `TRANSCRIPTS.md` | AI coding-agent transcripts for this submission. |

## How to run

```bash
# Node 22+ required. No npm install — stdlib only.
# Place a funded Solana keypair at ./keypair.json (standard JSON array format).
node main.ts
```

`main.ts` simulates the transaction first (preflight) and only submits when the
simulation is clean. It prints the mint address and creation signature, and
writes `LAUNCH.json`.

## Notes

- **Create-only launch.** The pump.fun `create` instruction is the whole
  launch; no first buy is bundled. A bundled `buy` was attempted and fails
  simulation with `BuybackFeeRecipientMissing` (the buyback fee recipient
  address was verified against the on-chain Global account — the handler
  expects a different account layout than the IDL shows). The coin is fully
  created and tradeable from the `create` instruction alone.
- **Metadata hosting.** The metadata URI in `LAUNCH.json` / `main.ts` points
  to a temporary file host (expires 2026-11-16). For a permanent record, move
  `ghost.png` + `metadata.json` to IPFS and update the on-chain metadata URI
  (Metaplex `update_metadata_account_v2`, update authority = creator).
- **Cost.** Creation cost ≈ 0.0178 SOL (rent for mint + metadata + bonding
  curve + tx fee).

## License

MIT
