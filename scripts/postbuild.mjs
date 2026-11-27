import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reproSrc = path.join(root, 'reproduce');
const reproDst = path.join(root, 'dist', 'public', 'reproduce');

fs.mkdirSync(reproDst, { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'public', '.nojekyll'), '');
for (const file of [
  'generation_upstream_replay.zip',
  'generation_method_replay.zip',
]) {
  fs.copyFileSync(path.join(reproSrc, file), path.join(reproDst, file));
}

const internalIdx = path.join(root, 'dist', 'internal', 'index.html');
const internalNamed = path.join(
  root,
  'dist',
  'internal',
  'General_Problems_Explorer_INTERNAL.html'
);
if (fs.existsSync(internalIdx)) {
  fs.renameSync(internalIdx, internalNamed);
}

console.log('[postbuild] Copied reproduce/*.zip to dist/public/reproduce/ and named internal bundle.');
