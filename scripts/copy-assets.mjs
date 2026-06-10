// Copies non-TypeScript assets (vendored engine files) into dist after tsc.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pairs = [
  ['src/projects/scaffolds/vendor', 'dist/projects/scaffolds/vendor'],
];

for (const [from, to] of pairs) {
  const src = join(root, from);
  if (!existsSync(src)) continue;
  mkdirSync(join(root, to), { recursive: true });
  cpSync(src, join(root, to), { recursive: true });
}
