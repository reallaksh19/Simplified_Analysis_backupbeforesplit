import assert from 'node:assert/strict';
import fs from 'node:fs';
const packageJson=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.equal(packageJson.scripts['check:masr.01:contracts'],'node scripts/masr-01-shell-contract-check.mjs');
assert.equal(packageJson.scripts['check:masr.01:properties'],'node scripts/masr-01-shell-property-check.mjs');
assert.equal(packageJson.scripts['check:masr.01:source'],'node scripts/masr-01-shell-source-guard.mjs && node scripts/masr-01-registration-check.mjs');
assert.equal(packageJson.scripts['check:masr.01:browser'],'playwright test e2e/masr-01-shell-navigation.spec.js');
assert.equal(packageJson.scripts['check:masr.01'],'npm run check:masr.01:contracts && npm run check:masr.01:properties && npm run check:masr.01:source && npm run check:masr.01:browser');
console.log('✅ MASR-01 package command registration passed.');
