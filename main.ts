// main.ts — Zero-dependency pump.fun coin launcher (Node 22, standard library only).
// Launches "MakeFun Ghost" (GHOST) on pump.fun (Solana mainnet) for the
// make.fun bounty "Race to launch a real coin on Solana" (makefun-coin-launch-01).
//
// Usage:
//   node main.ts            (Node 22; no npm install needed)
// Reads ./keypair.json (64-byte Solana secret key, JSON array) and submits a
// REAL mainnet transaction. Only run after the metadata URI below is replaced
// with the real IPFS metadata URI and after explicit confirmation.
//
// NOTE: The first-buy step is intentionally NOT in this file. The buy
// instruction currently fails simulation with the pump.fun program error
// BuybackFeeRecipientMissing (0x17ae) even when a valid Global
// buyback_fee_recipients member is passed as a remaining account. The coin
// launches fine without it; do the first buy as a separate step (or via the
// pump.fun site) after the coin exists.
//
// No npm packages are imported. Only node:crypto, node:fs, and the global
// fetch (Node 22) are used.

const crypto = require('node:crypto');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// Config — EDIT METADATA_URI before the real launch.
// ---------------------------------------------------------------------------
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const TOKEN_NAME = 'MakeFun Ghost';
const TOKEN_SYMBOL = 'GHOST';
// Real metadata URI used for the live launch (2026-11-14).
// NOTE: hosted on muse.ai files, expires 2026-11-16 10:25 WIB — move to a
// permanent host (IPFS) and update the on-chain metadata URI before judging.
const METADATA_URI = 'https://muse.ai/files/1440645312460395/1563120372501266/06t2hu5ui2vuw3391rf03wl0/metadata.json';

// Pump.fun program + related program IDs (base58).
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOC_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const RENT_SYSVAR = 'SysvarRent111111111111111111111111111111111';
const CREATE_DISC = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

// ---------------------------------------------------------------------------
// base58 (Bitcoin alphabet)
// ---------------------------------------------------------------------------
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58encode(buf) {
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) { s = B58_ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s || '1';
}
function b58decode(str) {
  let n = 0n;
  for (const c of str) n = n * 58n + BigInt(B58_ALPHABET.indexOf(c));
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = hex === '00' ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let lead = 0;
  for (const c of str) { if (c === '1') lead++; else break; }
  return Buffer.concat([Buffer.alloc(lead), body]);
}

// ---------------------------------------------------------------------------
// ed25519 (node:crypto) + PDA derivation
// ---------------------------------------------------------------------------
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
function keypairFromSecretKey(secretKey64) {
  const seed = Buffer.from(secretKey64.subarray(0, 32));
  const priv = crypto.createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const pub = crypto.createPublicKey(priv);
  const pubDer = pub.export({ format: 'der', type: 'spki' });
  const pubkey = pubDer.subarray(pubDer.length - 32); // raw 32-byte Ed25519 public key
  return { seed, priv, pubkey };
}
function ed25519Sign(message, privKeyObject) {
  return crypto.sign(null, message, privKeyObject); // 64-byte signature
}

// ed25519 curve check (for PDA "off-curve" test). p = 2^255 - 19.
// A 32-byte candidate is a valid PDA iff it is NOT a point on the curve,
// i.e. x^2 = (y^2-1)/(d*y^2+1) has no square root mod p.
const P = (1n << 255n) - 19n;
const D = ((-121665n * modInv(121666n, P)) % P + P) % P;
function modPow(base, exp, mod) {
  let r = 1n; let b = ((base % mod) + mod) % mod; let e = exp;
  while (e > 0n) { if (e & 1n) r = (r * b) % mod; b = (b * b) % mod; e >>= 1n; }
  return r;
}
function modInv(a, mod) { return modPow(a, mod - 2n, mod); }
function isOnCurve(bytes32) {
  // y = little-endian integer with the top (sign) bit cleared
  const le = Buffer.from(bytes32);
  le[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(le[i]);
  if (y >= P) return true; // out of range counts as on-curve (invalid PDA)
  const y2 = (y * y) % P;
  const num = (y2 - 1n + P) % P;
  const den = (D * y2 + 1n) % P;
  const x2 = (num * modInv(den, P)) % P;
  // x exists iff x2 is a quadratic residue: x2^((p-1)/2) == 1 (and x2 != 0)
  if (x2 === 0n) return true;
  return modPow(x2, (P - 1n) / 2n, P) === 1n;
}
function sha256(data) { return crypto.createHash('sha256').update(data).digest(); }
function findProgramAddress(seeds, programIdStr) {
  const programId = b58decode(programIdStr);
  for (let bump = 255; bump >= 0; bump--) {
    const buf = Buffer.concat([...seeds, Buffer.from([bump]), programId, Buffer.from('ProgramDerivedAddress')]);
    const hash = sha256(buf);
    if (!isOnCurve(hash)) return { address: hash, bump };
  }
  throw new Error('no PDA bump found');
}

// ---------------------------------------------------------------------------
// Borsh helpers
// ---------------------------------------------------------------------------
function borshString(s) {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length, 0);
  return Buffer.concat([len, b]);
}

// ---------------------------------------------------------------------------
// Solana JSON-RPC (fetch)
// ---------------------------------------------------------------------------
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`RPC ${method} error: ${JSON.stringify(j.error)}`);
  return j.result;
}

// ---------------------------------------------------------------------------
// v0 message compile + sign + serialize
// ---------------------------------------------------------------------------
function compileV0Message(payerKeyBytes, recentBlockhashB58, instructions) {
  // Collect accounts: signers first (writable signers, then readonly signers),
  // then non-signers (writable, then readonly). Order within a group = first
  // appearance across instructions.
  const seen = new Map(); // base58 -> {key, isSigner, isWritable, index}
  const order = [];
  function add(pubkeyBytes, isSigner, isWritable) {
    const k = b58encode(pubkeyBytes);
    if (!seen.has(k)) {
      seen.set(k, { key: pubkeyBytes, isSigner, isWritable });
      order.push(k);
    } else {
      const e = seen.get(k);
      e.isSigner = e.isSigner || isSigner;
      e.isWritable = e.isWritable || isWritable;
    }
  }
  // payer is always first signer + writable
  add(payerKeyBytes, true, true);
  for (const ix of instructions) {
    for (const a of ix.keys) add(a.pubkey, a.isSigner, a.isWritable);
    add(b58decode(ix.programId), false, false);
  }
  const signers = order.filter((k) => seen.get(k).isSigner);
  const nonSigners = order.filter((k) => !seen.get(k).isSigner);
  const writableSigners = signers.filter((k) => seen.get(k).isWritable);
  const readonlySigners = signers.filter((k) => !seen.get(k).isWritable);
  const writableNon = nonSigners.filter((k) => seen.get(k).isWritable);
  const readonlyNon = nonSigners.filter((k) => !seen.get(k).isWritable);
  const accountKeys = [...writableSigners, ...readonlySigners, ...writableNon, ...readonlyNon].map((k) => seen.get(k).key);
  const indexOf = (bytes) => accountKeys.findIndex((k) => k.equals(bytes));

  const header = Buffer.from([
    signers.length,
    readonlySigners.length,
    readonlyNon.length,
  ]);
  const compiled = instructions.map((ix) => {
    const progIdx = indexOf(b58decode(ix.programId));
    const acctIdx = ix.keys.map((a) => indexOf(a.pubkey));
    const dataLen = Buffer.from([ix.data.length]);
    return Buffer.concat([
      Buffer.from([progIdx]),
      Buffer.from([acctIdx.length]),
      Buffer.from(acctIdx),
      dataLen,
      ix.data,
    ]);
  });
  const blockhash = b58decode(recentBlockhashB58);
  const numAccounts = Buffer.from([accountKeys.length]);
  // v0 message layout (verified against web3.js output):
  // [0x80 version byte][header 3B][numAccounts][accountKeys][blockhash 32B]
  // [numInstructions][instructions][numAddressTableLookups=0]
  const message = Buffer.concat([
    Buffer.from([0x80]),
    header,
    numAccounts,
    ...accountKeys,
    blockhash,
    Buffer.from([compiled.length]),
    ...compiled,
    Buffer.from([0]), // address table lookups: none
  ]);
  // Signer pubkeys in message order (needed to order the signatures).
  const signerPubkeys = [...writableSigners, ...readonlySigners].map((k) => seen.get(k).key);
  return { message, accountKeys, signerPubkeys };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const secret = JSON.parse(fs.readFileSync('./keypair.json', 'utf8'));
  if (!Array.isArray(secret) || secret.length !== 64) throw new Error('keypair.json must be a 64-number JSON array');
  const creator = keypairFromSecretKey(Uint8Array.from(secret));
  const user = creator.pubkey; // 32-byte Buffer
  console.log('creator (funded wallet):', b58encode(user));

  // Fresh mint keypair (random).
  const mintSeed = crypto.randomBytes(32);
  const mint = keypairFromSecretKey(Buffer.concat([mintSeed, Buffer.alloc(32)]));
  // Re-derive the mint public key properly: use the seed's public key.
  const mintPubkey = mint.pubkey;
  const mintSecretKey = Buffer.concat([mintSeed, mintPubkey]);
  console.log('mint:', b58encode(mintPubkey));

  // Derive PDAs.
  const mintAuthority = findProgramAddress([Buffer.from('mint-authority')], PUMP_PROGRAM).address;
  const bondingCurve = findProgramAddress([Buffer.from('bonding-curve'), mintPubkey], PUMP_PROGRAM).address;
  const associatedBondingCurve = findProgramAddress(
    [bondingCurve, b58decode(TOKEN_PROGRAM), mintPubkey], ASSOC_TOKEN_PROGRAM).address;
  const globalPDA = findProgramAddress([Buffer.from('global')], PUMP_PROGRAM).address;
  const metadataPDA = findProgramAddress(
    [Buffer.from('metadata'), b58decode(METAPLEX_PROGRAM), mintPubkey], METAPLEX_PROGRAM).address;
  const eventAuthority = findProgramAddress([Buffer.from('__event_authority')], PUMP_PROGRAM).address;
  const associatedUser = findProgramAddress(
    [user, b58decode(TOKEN_PROGRAM), mintPubkey], ASSOC_TOKEN_PROGRAM).address;

  // --- create instruction (legacy SPL Token, 14 accounts) ---
  const createData = Buffer.concat([
    CREATE_DISC,
    borshString(TOKEN_NAME),
    borshString(TOKEN_SYMBOL),
    borshString(METADATA_URI),
    user, // creator
  ]);
  const createIx = {
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: mintPubkey, isSigner: true, isWritable: true },
      { pubkey: mintAuthority, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: globalPDA, isSigner: false, isWritable: false },
      { pubkey: b58decode(METAPLEX_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: metadataPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: b58decode(SYSTEM_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: b58decode(TOKEN_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: b58decode(ASSOC_TOKEN_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: b58decode(RENT_SYSVAR), isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: b58decode(PUMP_PROGRAM), isSigner: false, isWritable: false },
    ],
    data: createData,
  };

  // --- create associated token account for the creator (ATA program, data=[0]) ---
  const createAtaIx = {
    programId: ASSOC_TOKEN_PROGRAM,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: associatedUser, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: false, isWritable: false },
      { pubkey: mintPubkey, isSigner: false, isWritable: false },
      { pubkey: b58decode(SYSTEM_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: b58decode(TOKEN_PROGRAM), isSigner: false, isWritable: false },
    ],
    data: Buffer.from([0]),
  };

  const { value: { blockhash } } = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const { message, signerPubkeys } = compileV0Message(user, blockhash, [createIx, createAtaIx]);

  // Sign in the message's signer order. Signers here are [creator, mint]
  // (creator added first as fee payer, mint second).
  const mintPriv = crypto.createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, mintSeed]), format: 'der', type: 'pkcs8' });
  const privByPubkey = new Map();
  privByPubkey.set(b58encode(user), creator.priv);
  privByPubkey.set(b58encode(mintPubkey), mintPriv);
  const orderedSigs = signerPubkeys.map((pk) => {
    const priv = privByPubkey.get(b58encode(pk));
    if (!priv) throw new Error('missing signer for ' + b58encode(pk));
    return ed25519Sign(message, priv);
  });

  const wire = Buffer.concat([Buffer.from([orderedSigs.length]), ...orderedSigs, message]);
  const b64 = wire.toString('base64');

  // Preflight simulate first (aborts before spending if the program rejects).
  const sim = await rpc('simulateTransaction', [b64, { sigVerify: true, commitment: 'confirmed', encoding: 'base64' }]);
  if (sim.err) {
    console.error('SIMULATION FAILED:', JSON.stringify(sim.err));
    if (sim.logs) sim.logs.forEach((l) => console.error('  ', l));
    process.exit(1);
  }
  console.log('simulation OK, unitsConsumed:', sim.unitsConsumed);

  const sig = await rpc('sendTransaction', [b64, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5, encoding: 'base64' }]);
  console.log('creation tx signature:', sig);
  console.log('mint:', b58encode(mintPubkey));
  console.log('token:', TOKEN_NAME, `(${TOKEN_SYMBOL})`);
  console.log('metadata URI:', METADATA_URI);

  // Confirm.
  const { value: { blockhash: bh2, lastValidBlockHeight } } = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  void bh2;
  for (let i = 0; i < 30; i++) {
    const st = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: true }]);
    const s = st && st[0];
    if (s && s.confirmationStatus === 'confirmed') {
      console.log('CONFIRMED. LAUNCH.json:');
      console.log(JSON.stringify({ mint: b58encode(mintPubkey), signature: sig, name: TOKEN_NAME, symbol: TOKEN_SYMBOL, metadataUri: METADATA_URI }, null, 2));
      return;
    }
    if (s && s.err) { console.error('tx failed on-chain:', JSON.stringify(s.err)); process.exit(1); }
    await new Promise((r) => setTimeout(r, 2000));
    void lastValidBlockHeight;
  }
  console.log('not confirmed within ~60s; check signature manually:', sig);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
