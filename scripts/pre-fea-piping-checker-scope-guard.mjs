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
  const moduleSpecifiers = [
    ...[...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
    ...[...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
  ];
  for (const specifier of moduleSpecifiers) {
    const normalized = specifier.toLowerCase();
    for (const target of prohibitedImportTargets) {
      assert.equal(normalized.includes(target), false, `${relative('.', file)} crosses the Non-FEA boundary through module ${specifier}.`);
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
