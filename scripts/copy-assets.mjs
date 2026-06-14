import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'aspects');
const dest = resolve(root, 'app/public/aspects');

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`copied ${src} -> ${dest}`);
