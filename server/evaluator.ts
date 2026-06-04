// Pure recursive predicate evaluator against a CapabilityProfile.
// Exhaustive switch on predicate.kind — no default clause.

import type {
  Predicate,
  CodecPredicate,
  WebGlPredicate,
  GlExtensionPredicate,
  DrmPredicate,
  HdrPredicate,
  RuntimePredicate,
  AndPredicate,
  OrPredicate,
  EvaluationResult,
  CapabilityProfile,
} from '../shared/handshake';
import { isRobustnessAtLeast } from '../shared/policy';

function evaluateCodec(predicate: CodecPredicate, profile: CapabilityProfile): EvaluationResult {
  const codecs = profile.codecs || [];
  const match = codecs.find(c => c.mimeType === predicate.mimeType);
  if (!match) {
    return { success: false, predicateId: predicate.id, failureReason: 'codec not found' };
  }
  if (predicate.requiredSmooth && !match.smooth) {
    return { success: false, predicateId: predicate.id, failureReason: 'not smooth' };
  }
  return { success: true, predicateId: predicate.id };
}

function evaluateWebGl(predicate: WebGlPredicate, profile: CapabilityProfile): EvaluationResult {
  const graphics = profile.graphics;
  if (!graphics) {
    return { success: false, predicateId: predicate.id, failureReason: 'no graphics info' };
  }
  if (graphics.webglVersion < predicate.minVersion) {
    return { success: false, predicateId: predicate.id, failureReason: `webgl ${graphics.webglVersion} < ${predicate.minVersion}` };
  }
  return { success: true, predicateId: predicate.id };
}

function evaluateGlExtension(predicate: GlExtensionPredicate, profile: CapabilityProfile): EvaluationResult {
  const graphics = profile.graphics;
  if (!graphics) {
    return { success: false, predicateId: predicate.id, failureReason: 'no graphics info' };
  }
  if (!graphics.extensions.includes(predicate.extension)) {
    return { success: false, predicateId: predicate.id, failureReason: `extension ${predicate.extension} missing` };
  }
  return { success: true, predicateId: predicate.id };
}

function evaluateDrm(predicate: DrmPredicate, profile: CapabilityProfile): EvaluationResult {
  const drmSystems = profile.drmSystems || [];
  const match = drmSystems.find(d => d.system === predicate.system);
  if (!match) {
    return { success: false, predicateId: predicate.id, failureReason: 'drm system not found' };
  }
  if (predicate.minRobustness && !isRobustnessAtLeast(match.robustness, predicate.minRobustness)) {
    return { success: false, predicateId: predicate.id, failureReason: `robustness ${match.robustness} < ${predicate.minRobustness}` };
  }
  return { success: true, predicateId: predicate.id };
}

function evaluateHdr(predicate: HdrPredicate, profile: CapabilityProfile): EvaluationResult {
  const display = profile.display;
  if (!display) {
    return { success: false, predicateId: predicate.id, failureReason: 'no display info' };
  }
  for (const tf of predicate.transferFunctions) {
    if (!display.hdr.includes(tf as 'hlg' | 'pq')) {
      return { success: false, predicateId: predicate.id, failureReason: `HDR transfer function ${tf} missing` };
    }
  }
  return { success: true, predicateId: predicate.id };
}

function evaluateRuntime(predicate: RuntimePredicate, profile: CapabilityProfile): EvaluationResult {
  const runtime = profile.runtime;
  if (!runtime) {
    return { success: false, predicateId: predicate.id, failureReason: 'no runtime info' };
  }
  // Check known checks
  switch (predicate.check) {
    case 'es2020':
      if (!runtime.es2020) {
        return { success: false, predicateId: predicate.id, failureReason: 'es2020 not supported' };
      }
      break;
    default:
      // Unknown check — fail safely
      return { success: false, predicateId: predicate.id, failureReason: `unknown runtime check ${predicate.check}` };
  }
  return { success: true, predicateId: predicate.id };
}

export function evaluatePredicate(pred: Predicate, profile: CapabilityProfile): EvaluationResult {
  switch (pred.kind) {
    case 'codec':
      return evaluateCodec(pred as CodecPredicate, profile);
    case 'webgl':
      return evaluateWebGl(pred as WebGlPredicate, profile);
    case 'gl-extension':
      return evaluateGlExtension(pred as GlExtensionPredicate, profile);
    case 'drm':
      return evaluateDrm(pred as DrmPredicate, profile);
    case 'hdr':
      return evaluateHdr(pred as HdrPredicate, profile);
    case 'runtime':
      return evaluateRuntime(pred as RuntimePredicate, profile);
    case 'and': {
      const andPred = pred as AndPredicate;
      for (const req of andPred.requires) {
        const res = evaluatePredicate(req, profile);
        if (!res.success) {
          return res; // First failing leaf
        }
      }
      return { success: true, predicateId: andPred.id };
    }
    case 'or': {
      const orPred = pred as OrPredicate;
      let lastFailure: EvaluationResult | null = null;
      for (const alt of orPred.alternatives) {
        const res = evaluatePredicate(alt, profile);
        if (res.success) {
          return res;
        }
        lastFailure = res;
      }
      return lastFailure || { success: false, predicateId: orPred.id, failureReason: 'no alternative matched' };
    }
  }
}