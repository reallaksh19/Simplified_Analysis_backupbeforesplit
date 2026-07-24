import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json','utf8'));
const expected = {
  'check:w10.r4:contracts':'node scripts/w10.r4-sketcher-contract-check.mjs',
  'check:w10.r4:commands':'node scripts/w10.r4-sketcher-command-check.mjs',
  'check:w10.r4:properties':'node scripts/w10.r4-sketcher-property-check.mjs',
  'check:w10.r4:source':'node scripts/w10.r4-sketcher-source-guard.mjs && node scripts/w10.r4-registration-check.mjs',
  'check:w10.r4:browser':'playwright test e2e/w10.r4-sketcher-recovery.spec.js',
  'check:w10.r4':'npm run check:w10.r4:contracts && npm run check:w10.r4:commands && npm run check:w10.r4:properties && npm run check:w10.r4:source && npm run check:w10.r4:browser',
};
Object.entries(expected).forEach(([key,value]) => assert.equal(packageJson.scripts[key],value,`${key} registration mismatch`));
assert.ok(packageJson.scripts['check:workspace-browser'].includes('e2e/w10.r4-sketcher-recovery.spec.js'));
assert.ok(packageJson.scripts['check:lafea.3'].includes('lafea.3-contract-check.mjs'));
const workflow = fs.readFileSync('.github/workflows/w10-r4-certification.yml','utf8');
for (const token of ['npm ci','playwright install chromium','check:w10.r4:contracts','check:w10.r4:commands','check:w10.r4:properties','check:w10.r4:source','check:w10.r4:browser','check:w10.r4','check:full','check:workspace-browser','npm run build']) assert.ok(workflow.includes(token),`Workflow registration token missing: ${token}`);
console.log('✅ W10.R4 package, browser, LAFEA.3 and workflow registrations passed.');
