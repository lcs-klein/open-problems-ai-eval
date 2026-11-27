import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reproSrc = path.join(root, 'reproduce');
const reproDst = path.join(root, 'dist', 'web', 'reproduce');

fs.mkdirSync(reproDst, { recursive: true });
for (const file of [
  'generation_upstream_replay.zip',
  'generation_method_replay.zip',
]) {
  const srcFile = path.join(reproSrc, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, path.join(reproDst, file));
  }
}

console.log('[postbuild_web] Copied reproduce/*.zip to dist/web/reproduce/.');
