// Bench fixtures for capability profiles. These are illustrative inputs for the
// resolver, NOT a substitute for on-device validation: capability detection is
// client-side, so only real hardware can prove the probes measure correctly.
// The lgC9 fixture below is seeded from the captured field profile in
// docs/REAL_DEVICE_REPORT.md — the original hand-written values disagreed with
// the real device until three probes were fixed.

import type { CapabilityProfile, Platform } from '../../shared/handshake';

const webosPlatform: Platform = { kind: 'webos', webosVersion: '4.5' };

/**
 * LG C9 — Chromium-53-class engine, excellent decode/HDR/HW-Widevine hardware
 * but an antique JS engine. Values match the verified on-device /resolve capture
 * in docs/REAL_DEVICE_REPORT.md (after the probe fixes):
 * - Smooth HEVC + H.264 decode on dedicated TV silicon
 * - Widevine HW_SECURE_DECODE
 * - HDR PQ and HLG supported (HDR OLED)
 * - WebGL1 only (no WebGL2); maxTextureSize 8192
 * - NO ES2020 runtime features (Chromium-53 genuinely lacks them)
 *
 * Expected resolution:
 * - tier: standard
 * - multi-angle: correctly DENIED by predicate "runtime.es2020" — the engine
 *   really lacks ES2020 (a true negative, not a probe artefact)
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
    maxTextureSize: 8192,
    extensions: ['WEBGL_compressed_texture_s3tc', 'WEBGL_debug_renderer_info']
  },
  runtime: {
    es2020: false // Chromium-53 genuinely lacks ES2020 — the axis that denies multi-angle
  },
  display: {
    hdr: ['pq', 'hlg'] // HDR support confirmed on-device
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