// Policy data — the single source of truth for the feature catalog and tier
// bands. server/resolver.ts imports FEATURE_SPECS and TIER_BANDS from here;
// they are intentionally declared in exactly one place so the two copies can
// never drift. The predicate/spec vocabulary lives in ../shared/policy.

import {
  makeCodecPredicate,
  makeWebGlPredicate,
  makeDrmPredicate,
  makeHdrPredicate,
  makeRuntimePredicate,
  type FeatureSpec,
  type TierBand
} from '../shared/policy';

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
