// Resolve logic: three-phase feature resolution + deriveTier. Pure functions
// only — the tier is derived strictly from feature grants, never used as input.
// Policy data lives in ./catalog; the predicate/spec vocabulary in ../shared/policy.

import type { CapabilityProfile, Verdict, FeatureGrant, TierName } from '../shared/handshake';
import type { RungSpec } from '../shared/policy';
import { evaluatePredicate } from './evaluator';
import { FEATURE_SPECS, TIER_BANDS } from './catalog';

/**
 * Session/account context, kept separate from the device CapabilityProfile so
 * capability logic and policy logic can't bleed into each other. Entitlements
 * are held by the session (content licensing) — never derived from the platform.
 */
export interface ResolveContext {
  entitlements?: string[];
}

/**
 * A capability claim that contradicts the device's known engine, recorded for
 * fleet observability. The probes are the one part of the handshake the server
 * cannot re-measure, so the resolver is where a lying probe gets caught.
 */
export interface ProfileAnomaly {
  field: string;
  claimed: unknown;
  corrected: unknown;
  reason: string;
}

// webOS shipped Chromium 53 (v4) and 68 (v5). ES2020 runtime features
// (Promise.allSettled, etc.) first appear on the Chromium 79 engine in webOS 6,
// so `runtime.es2020 === true` on a pre-6 build is implausible — exactly the
// failure docs/REAL_DEVICE_REPORT.md found, where a core-js polyfill made the
// Chromium-53 C9 report es2020:true.
const MIN_WEBOS_MAJOR_FOR_ES2020 = 6;

/**
 * Engine-plausibility guard. Distrusts capability claims that contradict the
 * device's known engine and fails *safe* — neutralising an inflated claim to its
 * conservative value so a feature is never granted on hardware that can't run it
 * — while reporting the contradiction as an anomaly. The fix for a lying probe is
 * still to fix the probe; this only stops the lie from over-granting in the
 * meantime, and surfaces it so the fleet-wide regression is visible.
 */
export function sanitizeProfile(profile: CapabilityProfile): { profile: CapabilityProfile; anomalies: ProfileAnomaly[] } {
  const anomalies: ProfileAnomaly[] = [];
  // Shallow copy so the caller's input is never mutated.
  const out: CapabilityProfile = { ...profile };

  const platform = profile.platform;
  if (platform && platform.kind === 'webos' && profile.runtime && profile.runtime.es2020 === true) {
    const major = parseWebosMajor(platform.webosVersion);
    if (major !== null && major < MIN_WEBOS_MAJOR_FOR_ES2020) {
      out.runtime = { ...profile.runtime, es2020: false };
      anomalies.push({
        field: 'runtime.es2020',
        claimed: true,
        corrected: false,
        reason: `webOS ${platform.webosVersion} ships a pre-ES2020 engine (Chromium < 79); es2020:true is implausible and was likely produced by a polyfill`
      });
    }
  }

  return { profile: out, anomalies };
}

function parseWebosMajor(version: string): number | null {
  const match = /^(\d+)/.exec(version);
  if (!match) {
    return null;
  }
  const major = Number(match[1]);
  return Number.isFinite(major) ? major : null;
}

// Three-phase resolve
export function resolve(rawProfile: CapabilityProfile, context: ResolveContext = {}): Verdict {
  // Distrust capability claims that contradict the device's known engine before
  // evaluating anything, so a lying probe can never over-grant a feature.
  const profile = sanitizeProfile(rawProfile).profile;
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
