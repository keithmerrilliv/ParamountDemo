// Inline policy data: FEATURE_SPECS and TIER_BANDS.
// Shared by server resolver logic.

import type { FeatureSpec, TierBand } from './resolver';
import type { Predicate, RobustnessLevel } from '../shared/handshake';

export const FEATURE_SPECS: Record<string, FeatureSpec> = {
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

export const TIER_BANDS: TierBand[] = [
  { tier: 'flagship', requiredFeatures: ['multi-angle', 'hdr-overlay'] },
  { tier: 'standard', requiredFeatures: ['hdr-overlay'] },
  { tier: 'baseline', requiredFeatures: [] }
];

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