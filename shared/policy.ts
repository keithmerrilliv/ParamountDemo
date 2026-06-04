// Policy constants and predicate vocabulary helpers.

import type { Predicate, RobustnessLevel } from './handshake';

export function isRobustnessAtLeast(actual: RobustnessLevel, required: RobustnessLevel): boolean {
  const actualIdx = ROBUSTNESS_LADDER.indexOf(actual);
  const requiredIdx = ROBUSTNESS_LADDER.indexOf(required);
  return actualIdx >= requiredIdx && requiredIdx !== -1;
}

// Helper to create codec predicates
export function makeCodecPredicate(id: string, mimeType: string, requiredSmooth?: boolean): Predicate {
  return { kind: 'codec', id, mimeType, requiredSmooth };
}

// Helper to create WebGL predicates
export function makeWebGlPredicate(id: string, minVersion: 1 | 2): Predicate {
  return { kind: 'webgl', id, minVersion };
}

// Helper to create GL extension predicates
export function makeGlExtensionPredicate(id: string, extension: string): Predicate {
  return { kind: 'gl-extension', id, extension };
}

// Helper to create DRM predicates
export function makeDrmPredicate(id: string, system: string, minRobustness?: RobustnessLevel): Predicate {
  return { kind: 'drm', id, system, minRobustness };
}

// Helper to create HDR predicates
export function makeHdrPredicate(id: string, transferFunctions: ('hlg' | 'pq')[]): Predicate {
  return { kind: 'hdr', id, transferFunctions };
}

// Helper to create runtime predicates
export function makeRuntimePredicate(id: string, check: string): Predicate {
  return { kind: 'runtime', id, check };
}

// Composite predicate helpers
export function andPredicate(id: string, requires: Predicate[]): Predicate {
  return { kind: 'and', id, requires };
}

export function orPredicate(id: string, alternatives: Predicate[]): Predicate {
  return { kind: 'or', id, alternatives };
}

export const ROBUSTNESS_LADDER = [
  'SW_SECURE_CRYPTO',
  'SW_SECURE_DECODE',
  'HW_SECURE_CRYPTO',
  'HW_SECURE_DECODE',
  'HW_SECURE_ALL'
] as const;