import assert from 'node:assert/strict';
import { createRejectedReviewResult } from '../src/core/element-fea/review-result.js';
import {
  createInitialLfeaConsumerProfile, createLfeaConsumerProfile, inspectLfeaSourceObject,
  parseLfeaSourceText, validateSuppliedFileForDownload,
} from '../src/core/lfea-consumer/index.js';
import { LfeaConsumerController } from '../src/workspace/lfea-consumer-controller.js';
import { EventBus } from '../src/workspace/event-bus.js';
import { createWorkspaceConsumerRegistryV9 } from '../src/core/workspace-consumers/index.js';
import {
  clone, convergenceConsumerFixture, mixedConsumerFixture, q4ConsumerFixture, t3ConsumerFixture,
  resealArtifact, resealReview, sourceFile,
} from './lfea-007-fixtures.mjs';

const profile = createInitialLfeaConsumerProfile();
const base = q4ConsumerFixture({ projection:true, sourceArtifacts:true });
let count = 0;
function rejected(fn) { count += 1; assert.throws(fn); }
function low(field, value = 1) { const { semanticHash:_hash, ...raw } = profile; return createLfeaConsumerProfile({ ...raw, [field]:value }); }

rejected(() => parseLfeaSourceText('{}', { profile, sourceByteLength:profile.maximumSourceBytes + 1 }), /capacity/i); // 1
rejected(() => parseLfeaSourceText('{', { profile }), /valid JSON/i); // 2
rejected(() => parseLfeaSourceText('[]', { profile }), /object root/i); // 3
rejected(() => parseLfeaSourceText('{"schema":"unknown/v1"}', { profile }), /supported/i); // 4
const rejectedReview = createRejectedReviewResult({ diagnostics:[{severity:'ERROR',code:'REJECTED',sourceArtifactIdentity:'TEST',message:'Rejected.'}] });
rejected(() => inspectLfeaSourceObject(rejectedReview, { profile }), /not QUALIFIED/i); // 5
const staleReview = clone(base.review);staleReview.semanticHash='fnv1a64:stale';
rejected(() => inspectLfeaSourceObject(staleReview, { profile }), /hash|invalid/i); // 6
const errorReview = resealReview({ ...clone(base.review), diagnostics:[{severity:'ERROR',code:'BAD',sourceArtifactIdentity:'TEST',message:'Bad review.'}] });
rejected(() => inspectLfeaSourceObject(errorReview, { profile }), /error diagnostics|invalid/i); // 7
const rejectedExport = resealArtifact({ ...clone(base.exportValue), status:'REJECTED_EXPORT', files:[], totalFileCount:0, totalByteLength:0, totalRowCount:0, diagnostics:[{severity:'ERROR',code:'REJECTED',sourceArtifactIdentity:'TEST',message:'Rejected.'}] });
rejected(() => inspectLfeaSourceObject(rejectedExport, { profile }), /not QUALIFIED|invalid/i); // 8
const staleExport = clone(base.exportValue);staleExport.semanticHash='fnv1a64:stale';
rejected(() => inspectLfeaSourceObject(staleExport, { profile }), /hash|invalid/i); // 9
const duplicatePaths = clone(base.exportValue);duplicatePaths.files.push(clone(duplicatePaths.files[0]));
rejected(() => inspectLfeaSourceObject(resealArtifact(duplicatePaths), { profile }), /duplicate|invalid/i); // 10
const noReview = clone(base.exportValue);noReview.files=noReview.files.filter((row)=>row.path!=='review.json');
rejected(() => inspectLfeaSourceObject(resealArtifact(noReview), { profile }), /review|invalid/i); // 11
const duplicateReview = clone(base.exportValue);duplicateReview.files.push(clone(duplicateReview.files.find((row)=>row.path==='review.json')));
rejected(() => inspectLfeaSourceObject(resealArtifact(duplicateReview), { profile }), /duplicate|invalid/i); // 12
const wrongIdentity = resealArtifact({ ...clone(base.exportValue), reviewIdentity:'OTHER_REVIEW' });
rejected(() => inspectLfeaSourceObject(wrongIdentity, { profile }), /identity/i); // 13
const wrongReviewHash = resealArtifact({ ...clone(base.exportValue), reviewSemanticHash:'fnv1a64:other' });
rejected(() => inspectLfeaSourceObject(wrongReviewHash, { profile }), /hash|manifest|invalid/i); // 14
const manifestMismatch = clone(base.exportValue);const manifest=manifestMismatch.files.find((row)=>row.path==='manifest.json');manifest.content='{}';
rejected(() => inspectLfeaSourceObject(resealArtifact(manifestMismatch), { profile }), /manifest|invalid/i); // 15
const fileHash = clone(base.exportValue);fileHash.files.find((row)=>row.path==='review.json').contentHash='fnv1a64:bad';
rejected(() => inspectLfeaSourceObject(resealArtifact(fileHash), { profile }), /hash|invalid/i); // 16
const fileBytes = clone(base.exportValue);fileBytes.files.find((row)=>row.path==='review.json').byteLength+=1;
rejected(() => inspectLfeaSourceObject(resealArtifact(fileBytes), { profile }), /byte|invalid/i); // 17
rejected(() => inspectLfeaSourceObject(base.exportValue, { profile:low('maximumSuppliedExportFiles'), sourceName:'export.json' }), /too many|capacity/i); // 18
rejected(() => inspectLfeaSourceObject(base.review, { profile:low('maximumNodes') }), /maximumNodes|capacity/i); // 19
const mixed = mixedConsumerFixture();
rejected(() => inspectLfeaSourceObject(mixed.review, { profile:low('maximumElements') }), /maximumElements|capacity/i); // 20
rejected(() => inspectLfeaSourceObject(base.review, { profile:low('maximumRawStressRows') }), /maximumRawStressRows|capacity/i); // 21
rejected(() => inspectLfeaSourceObject(base.review, { profile:low('maximumProjectedStressRows') }), /maximumProjectedStressRows|capacity/i); // 22
const convergence = convergenceConsumerFixture();
rejected(() => inspectLfeaSourceObject(convergence.review, { profile:low('maximumConvergenceRows') }), /maximumConvergenceRows|capacity/i); // 23
rejected(() => validateSuppliedFileForDownload({ ...clone(base.exportValue.files[0]), encoding:'BINARY' }, base.exportValue), /UTF-8/i); // 24
rejected(() => validateSuppliedFileForDownload({ ...clone(base.exportValue.files[0]), content:'tampered' }, base.exportValue), /hash/i); // 25
rejected(() => validateSuppliedFileForDownload({ ...clone(base.exportValue.files[0]), byteLength:0 }, base.exportValue), /byte/i); // 26
rejected(() => validateSuppliedFileForDownload({ ...clone(base.exportValue.files[0]), path:'missing.txt' }, base.exportValue), /manifest/i); // 27

const aggregateCount = resealArtifact({ ...clone(base.exportValue), totalFileCount:base.exportValue.totalFileCount + 1 });
rejected(() => inspectLfeaSourceObject(aggregateCount, { profile }), /aggregate counts|invalid/i); // aggregate file-count mismatch
const aggregateBytes = resealArtifact({ ...clone(base.exportValue), totalByteLength:base.exportValue.totalByteLength + 1 });
rejected(() => inspectLfeaSourceObject(aggregateBytes, { profile }), /aggregate counts|invalid/i); // aggregate byte-count mismatch
const nonfiniteReview = clone(base.review);nonfiniteReview.displacementReview.rows[0].ux=Infinity;
rejected(() => inspectLfeaSourceObject(nonfiniteReview, { profile }), /finite|hash|invalid/i); // non-finite review value

const controller = new LfeaConsumerController(null, EventBus, profile);controller.init();
await controller.loadFile(sourceFile('qualified.json', base.review));const retainedHash=controller.getViewModel().semanticHash;
await controller.loadFile(sourceFile('bad.json', '{'));
count += 1;assert.equal(controller.getViewModel().semanticHash, retainedHash); // 28
controller.setStressComponent('UNSUPPORTED');count += 1;assert.equal(controller.getViewModel().semanticHash, retainedHash); // 29
const noProjection = q4ConsumerFixture();const noProjectionController=new LfeaConsumerController(null,EventBus,profile);noProjectionController.init();await noProjectionController.loadFile(sourceFile('raw.json',noProjection.review));const rawHash=noProjectionController.getViewModel().semanticHash;noProjectionController.setResultMode('PROJECTED');count += 1;assert.equal(noProjectionController.getViewModel().semanticHash,rawHash); // 30
controller.selectRecord({type:'NODE',identity:'ABSENT',tableId:'nodes'});count += 1;assert.equal(controller.getViewModel().semanticHash,retainedHash); // 31

const boundedProfile=low('maximumNodes',3);const t3=t3ConsumerFixture();const partialController=new LfeaConsumerController(null,EventBus,boundedProfile);partialController.init();
await partialController.loadFile(sourceFile('accepted-t3.json',t3.review));const acceptedT3Hash=partialController.getViewModel().semanticHash;
await partialController.loadFile(sourceFile('blocked-q4.json',base.review));count += 1;
assert.equal(partialController.getViewModel().semanticHash,acceptedT3Hash);
assert.equal(partialController.getViewModel().geometry.nodes.length,t3.review.geometryReview.nodes.length);
assert(!partialController.getViewModel().geometry.nodes.some((row)=>row.nodeId===base.review.geometryReview.nodes.at(-1).nodeId&& !t3.review.geometryReview.nodes.some((item)=>item.nodeId===row.nodeId))); // rejected candidate exposes no partial rows
const descriptor=createWorkspaceConsumerRegistryV9().consumers.find((row)=>row.consumerId==='LOCAL_FEA');count += 1;assert(!descriptor.allowedActions.includes('GENERATE_LFEA_EXPORT')); // 32
count += 1;assert(!descriptor.allowedActions.some((row)=>row.includes('WORKSPACE')||row.includes('ANALYSIS'))); // 33
controller.destroy();noProjectionController.destroy();partialController.destroy();
assert(count >= 30);
console.log(`LFEA-007 failure containment passed (${count} explicit cases).`);
