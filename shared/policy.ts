// Policy vocabulary: predicate constructors, the policy-catalog types, and the
// robustness-ladder helper. This is the single home for the predicate/spec
// vocabulary — server/catalog.ts (the policy data) and server/resolver.ts (the
// evaluation logic) build on it instead of re-declaring it.

import type { Predicate, RobustnessLevel, TierName } from './handshake';
import { ROBUSTNESS_LADDER } from './handshake';

export function isRobustnessAtLeast(actual: RobustnessLevel, required: RobustnessLevel): boolean {
  const actualIdx = ROBUSTNESS_LADDER.indexOf(actual);
  const requiredIdx = ROBUSTNESS_LADDER.indexOf(required);
  return actualIdx >= requiredIdx && requiredIdx !== -1;
}

// --- Predicate constructors -------------------------------------------------

export function makeCodecPredicate(id: string, mimeType: string, requiredSmooth?: boolean): Predicate {
  return { kind: 'codec', id, mimeType, requiredSmooth };
}

export function makeWebGlPredicate(id: string, minVersion: 1 | 2): Predicate {
  return { kind: 'webgl', id, minVersion };
}

export function makeGlExtensionPredicate(id: string, extension: string): Predicate {
  return { kind: 'gl-extension', id, extension };
}

export function makeDrmPredicate(id: string, system: string, minRobustness?: RobustnessLevel): Predicate {
  return { kind: 'drm', id, system, minRobustness };
}

export function makeHdrPredicate(id: string, transferFunctions: ('hlg' | 'pq')[]): Predicate {
  return { kind: 'hdr', id, transferFunctions };
}

export function makeRuntimePredicate(id: string, check: string): Predicate {
  return { kind: 'runtime', id, check };
}

export function andPredicate(id: string, requires: Predicate[]): Predicate {
  return { kind: 'and', id, requires };
}

export function orPredicate(id: string, alternatives: Predicate[]): Predicate {
  return { kind: 'or', id, alternatives };
}

// --- Policy-catalog types ---------------------------------------------------
// Server-internal shapes for the feature catalog. The client never sees these;
// it only ever receives the resolved Verdict (see shared/handshake.ts).

export interface RungSpec {
  id: string;
  when: Predicate;
  params?: unknown;
}

export interface FeatureSpec {
  id: string;
  requires: Predicate[];
  rungs: RungSpec[];
  policy?: {
    requiresEntitlement?: string;
    denyFirmware?: string[];
    rolloutPercent?: number;
  };
}

export interface TierBand {
  tier: TierName;
  requiredFeatures: string[];
}
