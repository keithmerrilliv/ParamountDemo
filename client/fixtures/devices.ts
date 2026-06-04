// Bench fixtures for capability profiles.
// lgC9 fixture documented to yield tier "standard" with multi-angle denied by runtime.es2020.

import type { CapabilityProfile, Platform } from '../../shared/handshake';

const webosPlatform: Platform = { kind: 'webos', webosVersion: '4.5' };

/**
 * LG C9 — Chromium-53-class engine, excellent decode/HDR/HW-Widevine hardware but antique JS engine
 * 
 * This profile represents a real C9 device:
 * - Excellent decode/HDR/Widevine hardware support
 * - WebGL1 only (no WebGL2)
 * - Widevine HW_SECURE_DECODE
 * - HDR PQ and HLG formats supported  
 * - NO ES2020 runtime features (Chromium-53 is old JS engine)
 * 
 * Expected resolution:
 * - tier: standard
 * - multi-angle: DENIED by predicate "runtime.es2020" (false positive due to antique JS engine)
 * - hdr-overlay: ENABLED (WebGL1 + HDR both present)
 */
export const lgC9: CapabilityProfile = {
  platform: webosPlatform,
  codecs: [
    {
      mimeType: 'video/mp4; codecs="hvc1.1.6.L120.B0"',
      supported: true,
      smooth: true
    },
    {
      mimeType: 'video/mp4; codecs="avc1.42E01E"',
      supported: true,
      smooth: true
    }
  ],
  drmSystems: [
    {
      system: 'com.widevine.alpha',
      robustness: 'HW_SECURE_DECODE' as const
    }
  ],
  graphics: {
    webglVersion: 1,
    maxTextureSize: 4096,
    extensions: ['WEBGL_compressed_texture_s3tc', 'WEBGL_debug_renderer_info']
  },
  runtime: {
    es2020: false // C9 fails this — the axis that denies multi-angle
  },
  display: {
    hdr: ['pq', 'hlg'] // HDR support confirmed
  }
};

// Flagship-capable device — a modern browser that clears every capability gate.
// It reaches tier "flagship" only when the session also holds the 'live-premium'
// entitlement (supplied via ResolveContext); without it, multi-angle is denied by
// policy and the device resolves to "standard". Capability is not entitlement.
export const flagshipDevice: CapabilityProfile = {
  platform: { kind: 'browser' as const, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
  codecs: [
    {
      mimeType: 'video/mp4; codecs="hvc1.1.6.L120.B0"',
      supported: true,
      smooth: true
    }
  ],
  drmSystems: [
    {
      system: 'com.widevine.alpha',
      robustness: 'HW_SECURE_ALL' as const
    }
  ],
  graphics: {
    webglVersion: 2,
    maxTextureSize: 16384,
    extensions: ['WEBGL_compressed_texture_s3tc', 'WEBGL_debug_renderer_info', 'EXT_disjoint_timer_query_webgl2']
  },
  runtime: {
    es2020: true
  },
  display: {
    hdr: ['pq', 'hlg']
  }
};

// Baseline device — minimal capabilities
export const baselineDevice: CapabilityProfile = {
  platform: { kind: 'android' as const, androidVersion: '9.0' },
  codecs: [
    {
      mimeType: 'video/mp4; codecs="avc1.42E01E"',
      supported: true,
      smooth: false
    }
  ],
  drmSystems: [],
  graphics: {
    webglVersion: 1,
    maxTextureSize: 2048,
    extensions: []
  },
  runtime: {
    es2020: false
  },
  display: {
    hdr: []
  }
};