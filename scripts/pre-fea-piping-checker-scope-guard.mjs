import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = [
  'src/core/pre-fea-piping-checker',
  'src/pre-fea-checker',
];
const prohibitedImportTargets = [
  'lfea',
  'lafea',
  'local-shell',
  'local-continuum',
  'local-stress',
  'element-fea',
  '3d-analysis',
  '/solvers/',
  'finite-element',
];
const prohibitedRuntimeClaims = [
  /\bassemble(?:Global)?Stiffness\b/,
  /\bcreateMesh\b/,
  /\bgenerateMesh\b/,
  /\bsolveFiniteElement\b/,
  /\bcalculateFea\b/i,
];

const files = roots.flatMap(walk).sort();
assert.ok(files.length > 0, 'Non-FEA checker source files were not found.');

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const importLines = source.split(/\r?\n/).filter((line) => /\b(?:import|export)\b/.test(line) && /from\s+['"]|import\s*\(/.test(line));
  for (const line of importLines) {
    const normalized = line.toLowerCase();
    for (const target of prohibitedImportTargets) {
      assert.equal(normalized.includes(target), false, `${relative('.', file)} crosses the Non-FEA boundary through: ${line.trim()}`);
    }
  }
  for (const pattern of prohibitedRuntimeClaims) {
    assert.equal(pattern.test(source), false, `${relative('.', file)} contains prohibited FEA runtime behavior matching ${pattern}.`);
  }
}

console.log(`✅ Non-FEA dependency boundary passed for ${files.length} checker source files.`);

function walk(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(?:js|jsx|mjs)$/.test(path) ? [path] : [];
  });
}
