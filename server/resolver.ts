// Three-phase resolver logic + deriveTier.
// Pure functions only — tier derived strictly from feature grants.

import type { Predicate, CapabilityProfile, Verdict, FeatureGrant, TierName, RobustnessLevel } from '../shared/handshake';
import { evaluatePredicate } from './evaluator';

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

const FEATURE_SPECS: Record<string, FeatureSpec> = {
  'multi-angle': {
    id: 'multi-angle',
    requires: [
      makeCodecPredicate('ma.codec.hevc', 'video/mp4; codecs="hvc1.1.6.L120.B0"', true),
      makeRuntimePredicate('runtime.es2020', 'es2020'),
      makeDrmPredicate('drm.widevine', 'com.widevine.alpha', 'HW_SECURE_DECODE')
    ],
    rungs: [
      { id: 'rung.flagship', when: makeWebGlPredicate('webgl.webgl2', 2), params: { maxAngles: 4 } },
      { id: 'rung.standard', when: makeWebGlPredicate('webgl.webgl1', 1), params: { maxAngles: 2 } }
    ],
    policy: { requiresEntitlement: 'live-premium' }
  },
  'hdr-overlay': {
    id: 'hdr-overlay',
    requires: [
      makeHdrPredicate('hdr.hlg-pq', ['hlg', 'pq']),
      makeWebGlPredicate('webgl.min1', 1)
    ],
    rungs: [
      { id: 'rung.gl2', when: makeWebGlPredicate('webgl.webgl2', 2), params: { minMaxTextureSize: 4096 } },
      { id: 'rung.gl1', when: makeWebGlPredicate('webgl.webgl1', 1) }
    ]
  }
};

const TIER_BANDS: TierBand[] = [
  { tier: 'flagship', requiredFeatures: ['multi-angle', 'hdr-overlay'] },
  { tier: 'standard', requiredFeatures: ['hdr-overlay'] },
  { tier: 'baseline', requiredFeatures: [] }
];

/**
 * Session/account context, kept separate from the device CapabilityProfile so
 * capability logic and policy logic can't bleed into each other. Entitlements
 * are held by the session (content licensing) — never derived from the platform.
 */
export interface ResolveContext {
  entitlements?: string[];
}

// Three-phase resolve
export function resolve(profile: CapabilityProfile, context: ResolveContext = {}): Verdict {
  const features: Record<string, FeatureGrant> = {};

  for (const spec of Object.values(FEATURE_SPECS)) {
    // Phase 1 — hard gates (AND of requires)
    let allPassed = true;
    let failingId = '';
    
    for (const req of spec.requires) {
      const res = evaluatePredicate(req, profile);
      if (!res.success) {
        allPassed = false;
        failingId = res.predicateId;
        break;
      }
    }
    
    if (!allPassed) {
      features[spec.id] = { enabled: false, deniedBy: { predicateId: failingId } };
      continue;
    }

    // Phase 2 — rung selection
    let selectedRung: RungSpec | undefined;
    for (const rung of spec.rungs) {
      if (evaluatePredicate(rung.when, profile).success) {
        selectedRung = rung;
        break;
      }
    }

    // Phase 3 — policy overrides (entitlement, rollout)
    let granted = true;
    let policyDenial = '';

    if (granted && spec.policy?.requiresEntitlement) {
      const held = context.entitlements ?? [];
      if (!held.includes(spec.policy.requiresEntitlement)) {
        granted = false;
        policyDenial = 'policy.entitlement';
      }
    }

    if (granted && spec.policy?.rolloutPercent !== undefined) {
      const notInRollout = deterministicRollout(profile.platform, spec.id, spec.policy.rolloutPercent);
      if (notInRollout) {
        granted = false;
        policyDenial = 'policy.rollout';
      }
    }

    features[spec.id] = granted
      ? { enabled: true, params: selectedRung?.params, rungId: selectedRung?.id }
      : { enabled: false, deniedBy: { predicateId: policyDenial }, rungId: selectedRung?.id };
  }

  const tier = deriveTier(features);

  return {
    tier,
    features,
    bundles: ['main'],
    ttlSeconds: 3600,
    fallback: false
  };
}

/**
 * Never-brick fallback: a conservative Baseline verdict the service returns when
 * resolution can't run at all (malformed or garbage profile). Short TTL so the
 * shell retries soon, but it always boots with a usable verdict instead of an error.
 */
export function makeFallbackVerdict(): Verdict {
  return {
    tier: 'baseline',
    features: {
      'multi-angle': { enabled: false, deniedBy: { predicateId: 'resolver.fallback' } },
      'hdr-overlay': { enabled: false, deniedBy: { predicateId: 'resolver.fallback' } }
    },
    bundles: ['main'],
    ttlSeconds: 60,
    fallback: true
  };
}

// Deterministic FNV-1a rollout hash on platform + feature ID
export function deterministicRollout(platform: unknown, featureId: string, percent: number): boolean {
  let hash = 2166136261 >>> 0; // FNV offset basis
  for (const ch of JSON.stringify(platform)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  for (const ch of featureId) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const normalized = ((hash / 4294967295) * 100);
  return normalized >= percent;
}

// Derive tier from grants — never use tier as input
export function deriveTier(features: Record<string, FeatureGrant>): TierName {
  const enabledIds = Object.entries(features)
    .filter(([_, grant]) => grant.enabled)
    .map(([id]) => id);

  for (const band of TIER_BANDS) {
    if (band.requiredFeatures.every(f => enabledIds.includes(f))) {
      return band.tier;
    }
  }
  return 'baseline';
}

// Predicate helpers (inline to avoid circular deps with shared/policy.ts)
function makeCodecPredicate(id: string, mimeType: string, requiredSmooth?: boolean): Predicate {
  return { kind: 'codec', id, mimeType, requiredSmooth };
}

function makeWebGlPredicate(id: string, minVersion: 1 | 2): Predicate {
  return { kind: 'webgl', id, minVersion };
}

function makeDrmPredicate(id: string, system: string, minRobustness?: RobustnessLevel): Predicate {
  return { kind: 'drm', id, system, minRobustness };
}

function makeHdrPredicate(id: string, transferFunctions: ('hlg' | 'pq')[]): Predicate {
  return { kind: 'hdr', id, transferFunctions };
}

function makeRuntimePredicate(id: string, check: string): Predicate {
  return { kind: 'runtime', id, check };
}