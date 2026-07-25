import { hashUtf8 } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, utf8ByteLength } from '../shared-piping-model/index.js';
import {
  ENGINEERING_REVIEW_SCHEMA, EVIDENCE_EXPORT_SCHEMA, EXPORT_STATUS, REVIEW_STATUSES,
  validateEngineeringReview, validateEvidenceExport,
} from '../element-fea/index.js';
import { LFEA_SOURCE_KINDS } from './constants.js';
import { validateLfeaConsumerProfile } from './profile.js';

export function parseLfeaSourceText(sourceText, options) {
  const { profile, sourceName='selected-source.json', sourceByteLength=utf8ByteLength(sourceText) }=options||{};
  assertProfile(profile);
  if(typeof sourceText!=='string')throw rejection('LFEA_SOURCE_TEXT_INVALID','Selected source must be UTF-8 text.');
  if(sourceByteLength>profile.maximumSourceBytes)throw capacity('maximumSourceBytes',sourceByteLength,profile.maximumSourceBytes,'Selected source exceeds the approved byte capacity.');
  let parsed;try{parsed=JSON.parse(sourceText);}catch{throw rejection('LFEA_JSON_MALFORMED','Selected source is not valid JSON.');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw rejection('LFEA_JSON_ROOT_INVALID','Selected source must have a JSON object root.');
  return inspectLfeaSourceObject(parsed,{profile,sourceName,sourceByteLength});
}

export function inspectLfeaSourceObject(value, options) {
  const {profile,sourceName='selected-source.json',sourceByteLength=0}=options||{};assertProfile(profile);
  if(value?.schema===ENGINEERING_REVIEW_SCHEMA)return acceptReview(value,{profile,sourceName,sourceByteLength});
  if(value?.schema===EVIDENCE_EXPORT_SCHEMA)return acceptExport(value,{profile,sourceName,sourceByteLength});
  throw rejection('LFEA_SOURCE_SCHEMA_UNSUPPORTED','Only qualified lfea-engineering-review/v1 or lfea-evidence-export/v1 sources are supported.');
}

export function validateSuppliedFileForDownload(file, exportValue) {
  if(!file||typeof file!=='object')throw rejection('LFEA_FILE_MISSING','Supplied export file is unavailable.');
  if(file.encoding!=='UTF-8'||typeof file.content!=='string')throw rejection('LFEA_FILE_ENCODING_INVALID','Supplied export file is not UTF-8 text.');
  if(file.contentHash!==hashUtf8(file.content))throw rejection('LFEA_FILE_HASH_MISMATCH','Supplied export file content hash mismatch.');
  if(file.byteLength!==utf8ByteLength(file.content))throw rejection('LFEA_FILE_BYTE_LENGTH_MISMATCH','Supplied export file byte length mismatch.');
  const manifest=manifestObject(exportValue);const row=manifest.files?.find((entry)=>entry.path===file.path);
  if(!row)throw rejection('LFEA_FILE_MANIFEST_MISSING','Supplied file is absent from the export manifest.');
  if(file.path!=='manifest.json'&&(row.contentHash!==file.contentHash||row.byteLength!==file.byteLength))throw rejection('LFEA_FILE_MANIFEST_MISMATCH','Supplied file does not match manifest evidence.');
  return deepFreeze({path:file.path,filename:safeDownloadFilename(file.path),mediaType:file.mediaType,content:file.content,byteLength:file.byteLength,contentHash:file.contentHash});
}

export function safeDownloadFilename(path) {
  if(typeof path!=='string'||!path||path.includes('\\'))throw rejection('LFEA_FILE_PATH_UNSAFE','Supplied file path is unsafe.');
  const segments=path.split('/');if(segments.some((segment)=>!segment||segment==='.'||segment==='..'))throw rejection('LFEA_FILE_PATH_UNSAFE','Supplied file path contains an unsafe segment.');
  const final=segments.at(-1).replace(/[^A-Za-z0-9._-]/g,'_');if(!final||final==='.'||final==='..')throw rejection('LFEA_FILE_PATH_UNSAFE','Supplied file has no safe download name.');return final;
}

function acceptReview(review, context) {
  const validation=validateEngineeringReview(review);if(!validation.ok)throw rejection('LFEA_REVIEW_INVALID',validation.errors[0]);
  if(review.status!==REVIEW_STATUSES.QUALIFIED)throw rejection('LFEA_REVIEW_NOT_QUALIFIED','Engineering review is not QUALIFIED_FOR_REVIEW.');
  enforceReviewCapacity(review,context.profile);
  return deepFreeze({sourceName:context.sourceName,sourceKind:LFEA_SOURCE_KINDS.ENGINEERING_REVIEW,sourceByteLength:context.sourceByteLength,review,export:null,suppliedFiles:[]});
}

function acceptExport(exportValue, context) {
  const validation=validateEvidenceExport(exportValue);if(!validation.ok)throw rejection('LFEA_EXPORT_INVALID',validation.errors[0]);
  if(exportValue.status!==EXPORT_STATUS.QUALIFIED)throw rejection('LFEA_EXPORT_NOT_QUALIFIED','Evidence export is not QUALIFIED_EXPORT.');
  if(exportValue.files.length>context.profile.maximumSuppliedExportFiles)throw capacity('maximumSuppliedExportFiles',exportValue.files.length,context.profile.maximumSuppliedExportFiles,'Supplied export contains too many files.');
  const reviewFiles=exportValue.files.filter((row)=>row.path==='review.json');
  if(reviewFiles.length!==1)throw rejection(reviewFiles.length?'LFEA_EXPORT_REVIEW_DUPLICATE':'LFEA_EXPORT_REVIEW_MISSING','Qualified export must contain exactly one review.json.');
  const reviewFile=reviewFiles[0];
  if(reviewFile.mediaType!=='application/json'||reviewFile.encoding!=='UTF-8')throw rejection('LFEA_EXPORT_REVIEW_ENCODING_INVALID','review.json must be application/json UTF-8.');
  if(reviewFile.contentHash!==hashUtf8(reviewFile.content))throw rejection('LFEA_EXPORT_REVIEW_HASH_MISMATCH','review.json content hash mismatch.');
  if(reviewFile.byteLength!==utf8ByteLength(reviewFile.content))throw rejection('LFEA_EXPORT_REVIEW_BYTE_LENGTH_MISMATCH','review.json byte length mismatch.');
  let review;try{review=JSON.parse(reviewFile.content);}catch{throw rejection('LFEA_EXPORT_REVIEW_JSON_INVALID','review.json is malformed.');}
  const reviewValidation=validateEngineeringReview(review);if(!reviewValidation.ok)throw rejection('LFEA_EXPORT_REVIEW_INVALID',reviewValidation.errors[0]);
  if(review.status!==REVIEW_STATUSES.QUALIFIED)throw rejection('LFEA_EXPORT_REVIEW_NOT_QUALIFIED','review.json is not qualified.');
  if(review.semanticHash!==exportValue.reviewSemanticHash)throw rejection('LFEA_EXPORT_REVIEW_HASH_MISMATCH','Review/export semantic hashes do not match.');
  if(review.reviewIdentity!==exportValue.reviewIdentity)throw rejection('LFEA_EXPORT_REVIEW_IDENTITY_MISMATCH','Review/export identities do not match.');
  assertReviewManifestEvidence(reviewFile,exportValue);
  enforceReviewCapacity(review,context.profile);
  return deepFreeze({sourceName:context.sourceName,sourceKind:LFEA_SOURCE_KINDS.EVIDENCE_EXPORT,sourceByteLength:context.sourceByteLength,review,export:exportValue,suppliedFiles:exportValue.files});
}

function assertReviewManifestEvidence(file,exportValue){const manifest=manifestObject(exportValue);const row=manifest.files?.find((entry)=>entry.path==='review.json');if(!row||row.contentHash!==file.contentHash||row.byteLength!==file.byteLength)throw rejection('LFEA_EXPORT_MANIFEST_MISMATCH','Manifest evidence does not match review.json.');}
function manifestObject(exportValue){const file=exportValue?.files?.find((row)=>row.path==='manifest.json');if(!file)throw rejection('LFEA_EXPORT_MANIFEST_MISSING','Qualified export is missing manifest.json.');try{return JSON.parse(file.content);}catch{throw rejection('LFEA_EXPORT_MANIFEST_INVALID','Manifest JSON is invalid.');}}
function enforceReviewCapacity(review,profile){
  const checks=[
    ['maximumNodes',review.geometryReview?.nodes?.length||0,profile.maximumNodes],['maximumElements',review.geometryReview?.elements?.length||0,profile.maximumElements],
    ['maximumRawStressRows',review.rawStressReview?.rows?.length||0,profile.maximumRawStressRows],
    ['maximumProjectedStressRows',(review.projectedStressReview?.elementCornerValues?.length||0)+(review.projectedStressReview?.nodalValues?.length||0),profile.maximumProjectedStressRows],
    ['maximumConvergenceRows',(review.convergenceReview?.levels?.length||0)+(review.convergenceReview?.quantities?.length||0),profile.maximumConvergenceRows],
  ];
  for(const[field,requested,limit]of checks)if(requested>limit)throw capacity(field,requested,limit,`${field} capacity exceeded.`);
}
function assertProfile(profile){const validation=validateLfeaConsumerProfile(profile);if(!validation.ok)throw new TypeError(validation.errors[0]);}
function rejection(code,message){const error=new TypeError(message);error.code=code;return error;}
function capacity(field,requested,limit,message){const error=rejection('LFEA_CAPACITY_BLOCKED',message);error.capacityField=field;error.requested=requested;error.limit=limit;return error;}
