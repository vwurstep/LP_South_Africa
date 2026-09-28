// Decrypt an encrypted JSON file (guide or synced user data) and print it.
//   node tools/decrypt.mjs data/guide.enc.json
//   node tools/decrypt.mjs --userdata      (fetches user.enc.json from the `userdata` branch via gh)
// Passphrase: env GUIDE_PASSPHRASE or data/private/passphrase.txt.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const root = new URL('..', import.meta.url);
const pass = (process.env.GUIDE_PASSPHRASE || readFileSync(new URL('data/private/passphrase.txt', root), 'utf8')).trim();
const arg = process.argv[2];
const raw = arg === '--userdata'
  ? Buffer.from(execSync('gh api "repos/vwurstep/LP_South_Africa/contents/user.enc.json?ref=userdata" --jq .content').toString(), 'base64').toString()
  : readFileSync(arg, 'utf8');
const enc = JSON.parse(raw);
const b = (s) => Buffer.from(s, 'base64');
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b(enc.salt), iterations: enc.iter },
  base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const plain = gunzipSync(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(enc.iv) }, key, b(enc.ct))));
process.stdout.write(plain.toString() + '\n');
