import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  createApplicationBuildIdentity, createApplicationEmptyState, createApplicationIconRegistry,
  createApplicationTabManifest, createApplicationTabRuntimeState,
} from '../src/core/application-tabs/index.js';
import {
  CONSUMER_IDS, createApplicationViewStateV10, createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry, createWorkspaceConsumerRegistryV9,
  transitionApplicationViewStateV10,
} from '../src/core/workspace-consumers/index.js';

const registry=createWorkspaceConsumerRegistryV9(),icons=createApplicationIconRegistry(),manifest=createApplicationTabManifest(registry,icons);
const context=createWorkspaceConsumerContext({datasetId:null,workspaceVersion:0,selectedEntityId:null,contracts:{}});
const readiness=createWorkspaceConsumerReadinessRegistry(registry,context,runtimeOptions());
const first=createApplicationTabRuntimeState(manifest,readiness,{activeTabId:CONSUMER_IDS.HOME,version:3});
const second=createApplicationTabRuntimeState(manifest,readiness,{activeTabId:CONSUMER_IDS.HOME,version:3});
assert.equal(first.semanticHash,second.semanticHash);
assert.deepEqual(first,second);
assert.equal(createApplicationBuildIdentity({buildSha:'abcdef0123456789'}).semanticHash,createApplicationBuildIdentity({buildSha:'abcdef0123456789'}).semanticHash);
first.rows.forEach((row)=>assert.equal(createApplicationEmptyState(row).semanticHash,createApplicationEmptyState(row).semanticHash));

const initial=createApplicationViewStateV10(readiness,{activeViewId:CONSUMER_IDS.HOME});
for(const id of [CONSUMER_IDS.LOAD_CALC,CONSUMER_IDS.THREE_D_CALC,CONSUMER_IDS.PIPE_SOLVER,CONSUMER_IDS.REPORTS]){
  const result=transitionApplicationViewStateV10(initial,id,readiness);
  assert.equal(result.activated,true);
  assert.equal(result.state.activeViewId,id);
}
assert.equal(transitionApplicationViewStateV10(initial,CONSUMER_IDS.DEBUG,readiness).activated,false);

const invalidRows=clone(readiness);
const target=invalidRows.find((row)=>row.consumerId===CONSUMER_IDS.THREE_D_CALC);
const invalidBase={...target,readinessState:'BLOCKED_INVALID_CONTRACTS',availableContractKeys:[],missingRequiredContractKeys:[],invalidContractKeys:['sharedModel'],blockers:['INVALID_CONTRACT:sharedModel'],diagnostics:[{code:'INVALID_REQUIRED_CONTRACT',severity:'INFO',contractKey:'sharedModel',message:'Required contract sharedModel is invalid or stale.'}]};
invalidRows[invalidRows.indexOf(target)]={...invalidBase,semanticHash:semanticHash(withoutHash(invalidBase))};
const invalidRuntime=createApplicationTabRuntimeState(manifest,invalidRows,{activeTabId:CONSUMER_IDS.THREE_D_CALC});
assert.equal(invalidRuntime.rows.find((row)=>row.tabId===CONSUMER_IDS.THREE_D_CALC).contentState,'INVALID');

const mutated=clone(readiness);mutated[0].diagnostics.push({code:'CALLER_ONLY',severity:'INFO',contractKey:null,message:'caller only'});
assert.equal(first.rows.some((row)=>row.diagnostics.some((diag)=>diag.code==='CALLER_ONLY')),false);
assert.throws(()=>createApplicationTabRuntimeState({...manifest,tabs:[...manifest.tabs,manifest.tabs[0]]},readiness),/exactly one readiness row|manifest/i);
const mismatched=clone(readiness);mismatched[0].contextSemanticHash='fnv1a64:2222222222222222';mismatched[0].semanticHash=semanticHash(withoutHash(mismatched[0]));
assert.throws(()=>createApplicationTabRuntimeState(manifest,mismatched),/one consumer context/i);
console.log('✅ MASR-01 determinism, blocked-navigation, invalid-state and caller-isolation properties passed.');

function runtimeOptions(){return{workspaceBooted:true,settingsAuthorityInitialized:true,settingsDefinitionsAvailable:true,settingsProfileValid:true}}
function clone(value){return JSON.parse(JSON.stringify(value))}
function withoutHash(value){const{semanticHash:_hash,...rest}=value;return rest}
