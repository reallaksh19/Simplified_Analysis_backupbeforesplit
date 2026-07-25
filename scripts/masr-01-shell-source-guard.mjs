import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout=read('src/workspace/workspace-layout.js');
const shell=read('src/workspace/application-shell-controller.js');
const icons=read('src/core/application-tabs/icon-registry.js');
const manifest=read('src/core/application-tabs/manifest.js');
const viewState=read('src/core/workspace-consumers/view-state.js');
const registry=read('src/core/workspace-consumers/registry.js');
const vite=read('vite.config.js');
const packageJson=JSON.parse(read('package.json'));

assert.equal((layout.match(/data-webgl-host/g)||[]).length,1,'MASR-01 must retain exactly one production WebGL host.');
for(const role of ['home-consumer-root','workspace-view-root','load-calc-consumer-root','pcf-consumer-root','sketcher-consumer-root','three-d-calc-consumer-root','pipe-solver-consumer-root','reports-consumer-root','qa-consumer-root','settings-consumer-root','debug-consumer-root']) assert.ok(layout.includes(`data-role="${role}"`),`Missing static root ${role}.`);
assert.ok(layout.includes('application-overflow-toggle'));
assert.ok(layout.includes('application-global-error'));
assert.ok(layout.includes('application-build-identity'));
assert.ok(!shell.includes('ensureQaRoot'));
assert.ok(shell.includes('createApplicationViewStateV10'));
assert.ok(shell.includes('transitionApplicationViewStateV10'));
assert.ok(!shell.includes('READINESS_STATES'));
assert.ok(!/from ['"]react|zustand|lucide-react/.test([shell,icons,manifest].join('\n')));
assert.ok(!/https?:\/\/|<img|new Image\(|url\(/i.test(icons));
assert.ok(!/setInterval|setTimeout/.test(shell));
assert.ok(viewState.includes("application-view-state/v10")===false,'Schema literals belong in constants, not view-state implementation.');
assert.ok(viewState.includes('IMPLEMENTATION_STATUS.IMPLEMENTED'));
assert.ok(!registry.includes('WORKSPACE_CONSUMER_REGISTRY_V10_SCHEMA'));
assert.ok(vite.includes('__BUILD_SHA__'));
for(const key of ['check:masr.01:contracts','check:masr.01:properties','check:masr.01:source','check:masr.01:browser','check:masr.01']) assert.equal(typeof packageJson.scripts[key],'string',`Missing ${key}.`);
assert.equal(Object.keys(packageJson.dependencies).length,10);
assert.equal(Object.keys(packageJson.devDependencies).length,17);
console.log('✅ MASR-01 static roots, inline icons, navigation ownership, viewport and dependency boundaries passed.');

function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')}
