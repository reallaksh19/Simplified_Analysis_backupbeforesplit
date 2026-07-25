import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APPLICATION_NAVIGATION_ORDER_V9, CONSUMER_IDS,
  createApplicationViewStateV9, createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry, createWorkspaceConsumerRegistryV9,
  transitionApplicationViewStateV9, validateApplicationViewStateV9,
} from '../src/core/workspace-consumers/index.js';

const registry=createWorkspaceConsumerRegistryV9();
const context=createWorkspaceConsumerContext({datasetId:null,workspaceVersion:0,selectedEntityId:null,contracts:{}});
const readiness=createWorkspaceConsumerReadinessRegistry(registry,context,{workspaceBooted:true,settingsAuthorityInitialized:true,settingsDefinitionsAvailable:true,settingsProfileValid:true});
const state=createApplicationViewStateV9(readiness);
assert(validateApplicationViewStateV9(state).ok);
assert.equal(state.activeViewId,CONSUMER_IDS.HOME);
assert(state.availableViewIds.includes(CONSUMER_IDS.LOCAL_FEA));
assert.deepEqual(APPLICATION_NAVIGATION_ORDER_V9,['HOME','WORKSPACE','LOAD_CALC','PCF','SKETCHER','THREE_D_CALC','PIPE_SOLVER','LOCAL_FEA','REPORTS','QA','SETTINGS','DEBUG']);
const activated=transitionApplicationViewStateV9(state,CONSUMER_IDS.LOCAL_FEA,readiness);
assert.equal(activated.activated,true);
assert.equal(activated.state.activeViewId,CONSUMER_IDS.LOCAL_FEA);
assert.throws(()=>transitionApplicationViewStateV9(state,'UNKNOWN',readiness),/Unknown application view/);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.equal(pkg.scripts['check:lfea.007:static'],'node scripts/lfea-007-check.mjs');
assert.equal(pkg.scripts['check:lfea.007:browser'],'playwright test e2e/lfea-007-local-fea-consumer.spec.js');
assert(pkg.scripts['check:workspace-browser'].includes('e2e/lfea-007-local-fea-consumer.spec.js'));
const qa=fs.readFileSync('scripts/qa-check.mjs','utf8');
assert.equal((qa.match(/LFEA-007 Read-Only Local FEA Consumer Static Check/g)||[]).length,1);
const layout=fs.readFileSync('src/workspace/workspace-layout.js','utf8');
assert.equal((layout.match(/data-application-view="LOCAL_FEA"/g)||[]).length,1);
assert.equal((layout.match(/data-webgl-host/g)||[]).length,1);
assert(!/data-application-view="LOCAL_FEA"[^]*?<canvas/i.test(layout));
console.log('LFEA-007 registration qualification passed.');
