// Encrypt data/private/guide.json -> data/guide.enc.json (AES-GCM, PBKDF2-SHA256 key).
// Passphrase: env GUIDE_PASSPHRASE or data/private/passphrase.txt.
// Must stay in sync with decryptGuide() in src/data.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = new URL('..', import.meta.url);
const pass = (process.env.GUIDE_PASSPHRASE ||
  readFileSync(new URL('data/private/passphrase.txt', root), 'utf8')).trim().toLowerCase();  // app lowercases too
const plain = gzipSync(readFileSync(new URL('data/private/guide.json', root)));
const ITER = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
const b64 = (u) => Buffer.from(u).toString('base64');
writeFileSync(new URL('data/guide.enc.json', root),
  JSON.stringify({ v: 1, gzip: true, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
console.log(`encrypted ${plain.length} gzipped bytes -> data/guide.enc.json`);
