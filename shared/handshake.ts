// Contract types for capability handshake between shell and resolver service.
// Shared source of truth — imported by both client and server modules.

export type Platform = {
  kind: 'webos';
  webosVersion: string;
} | {
  kind: 'android';
  androidVersion: string;
} | {
  kind: 'browser';
  userAgent: string;
};

export type ProbePlan = {
  codecs: boolean;
  drm: boolean;
  graphics: boolean;
  runtime: boolean;
  display: boolean;
  ttlSeconds: number;
};

export interface CapabilityProfile {
  platform: Platform;
  codecs?: CodecResult[];
  drmSystems?: DrmSystemResult[];
  graphics?: GraphicsInfo;
  runtime?: RuntimeInfo;
  display?: DisplayInfo;
}

export interface Verdict {
  tier: TierName;
  features: Record<string, FeatureGrant>;
  bundles: string[];
  ttlSeconds: number;
  fallback: boolean;
}

export interface FeatureGrant {
  enabled: boolean;
  params?: unknown;
  deniedBy?: { predicateId: string };
  rungId?: string;
}

export type TierName = 'flagship' | 'standard' | 'baseline';

// Predicate vocabulary (discriminated union)
export type Predicate =
  | CodecPredicate
  | WebGlPredicate
  | GlExtensionPredicate
  | DrmPredicate
  | HdrPredicate
  | RuntimePredicate
  | AndPredicate
  | OrPredicate;

export interface CodecPredicate {
  kind: 'codec';
  id: string;
  mimeType: string;
  requiredSmooth?: boolean;
}

export interface WebGlPredicate {
  kind: 'webgl';
  id: string;
  minVersion: 1 | 2;
}

export interface GlExtensionPredicate {
  kind: 'gl-extension';
  id: string;
  extension: string;
}

export interface DrmPredicate {
  kind: 'drm';
  id: string;
  system: string;
  minRobustness?: RobustnessLevel;
}

export interface HdrPredicate {
  kind: 'hdr';
  id: string;
  transferFunctions: ('hlg' | 'pq')[];
}

export interface RuntimePredicate {
  kind: 'runtime';
  id: string;
  check: string; // e.g., "es2020"
}

export interface AndPredicate {
  kind: 'and';
  id: string;
  requires: Predicate[];
}

export interface OrPredicate {
  kind: 'or';
  id: string;
  alternatives: Predicate[];
}

// Evaluation result for a single predicate (recursive)
export type EvaluationResult =
  | { success: true; predicateId: string }
  | { success: false; predicateId: string; failureReason: string };

// Raw probe results
export interface CodecResult {
  mimeType: string;
  supported: boolean;
  smooth?: boolean;
}

export interface DrmSystemResult {
  system: string;
  robustness: RobustnessLevel;
}

export interface GraphicsInfo {
  webglVersion: 1 | 2;
  maxTextureSize: number;
  extensions: string[];
}

export interface RuntimeInfo {
  es2020: boolean;
  [key: string]: unknown;
}

export interface DisplayInfo {
  hdr: ('hlg' | 'pq')[];
}

export const ROBUSTNESS_LADDER = [
  'SW_SECURE_CRYPTO',
  'SW_SECURE_DECODE',
  'HW_SECURE_CRYPTO',
  'HW_SECURE_DECODE',
  'HW_SECURE_ALL'
] as const;

export type RobustnessLevel = typeof ROBUSTNESS_LADDER[number];