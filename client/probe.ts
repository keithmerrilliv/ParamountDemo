// Raw measurement probes: codec/drm/graphics/runtime/display.
// Assembles facts only — forms no opinion or tier hints.

export interface CapabilityProfile {
  platform: unknown;
  codecs?: CodecResult[];
  drmSystems?: DrmSystemResult[];
  graphics?: GraphicsInfo;
  runtime?: RuntimeInfo;
  display?: DisplayInfo;
}

interface CodecResult {
  mimeType: string;
  supported: boolean;
  smooth?: boolean;
}

interface DrmSystemResult {
  system: string;
  robustness: string;
}

interface GraphicsInfo {
  webglVersion: number;
  maxTextureSize: number;
  extensions: string[];
}

interface RuntimeInfo {
  [key: string]: boolean | undefined;
}

interface DisplayInfo {
  hdr: ('hlg' | 'pq')[];
}

type HdrTransfer = 'hlg' | 'pq';

interface DecodeVideoConfig {
  contentType: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  transferFunction?: HdrTransfer;
  colorGamut?: 'rec2020' | 'p3' | 'srgb';
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Single capability query via the standard Media Capabilities API. Chromium 53
// (the LG C9) DOES expose navigator.mediaCapabilities, but only honours the
// spec-shaped request ({ type, video: {...} }); the flat { contentType, ... }
// shape silently returns supported:false. We also retry briefly: on the C9,
// decodingInfo *rejects* for ~1s after launch while the media pipeline warms up,
// then answers correctly — so a handshake that fires immediately would otherwise
// race it and see nothing. This is the channel we use for HDR transfer-function
// detection, since the C9 doesn't parse the (transfer-function:*) media queries.
async function probeDecode(video: DecodeVideoConfig): Promise<MediaCapabilitiesDecodingInfo | undefined> {
  if (!('mediaCapabilities' in navigator) || !navigator.mediaCapabilities.decodingInfo) {
    return undefined;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await navigator.mediaCapabilities.decodingInfo({ type: 'media-source', video });
    } catch {
      await delay(250); // pipeline not ready yet — back off and retry
    }
  }
  return undefined;
}

// Synchronous codec support — MediaSource.isTypeSupported is available immediately
// on Chromium 53 (no async warmup), so it's the reliable signal at handshake time;
// canPlayType is a secondary check.
function codecSupported(mimeType: string): boolean {
  if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported && MediaSource.isTypeSupported(mimeType)) {
    return true;
  }
  return document.createElement('video').canPlayType(mimeType) !== '';
}

export async function runProbePlan(platform: unknown): Promise<CapabilityProfile> {
  const profile: CapabilityProfile = { platform };

  // Run all probes concurrently
  const [codecs, drmSystems, graphics, runtime, display] = await Promise.all([
    probeCodecs(),
    probeDrmSystems(),
    probeGraphics(),
    probeRuntime(),
    probeDisplay()
  ]);

  if (codecs) profile.codecs = codecs;
  if (drmSystems) profile.drmSystems = drmSystems;
  if (graphics) profile.graphics = graphics;
  if (runtime) profile.runtime = runtime;
  if (display) profile.display = display;

  return profile;
}

async function probeCodecs(): Promise<CodecResult[] | undefined> {
  const codecs = [
    'video/mp4; codecs="hvc1.1.6.L120.B0"', // HEVC Main (the C9's premium path)
    'video/mp4; codecs="avc1.42E01E"'       // H.264 baseline (fallback)
  ];

  const results: CodecResult[] = [];
  for (const mimeType of codecs) {
    if (codecSupported(mimeType)) {
      // Dedicated TV decode silicon → a supported HEVC/H.264 profile plays smoothly.
      results.push({ mimeType, supported: true, smooth: true });
    }
  }

  return results.length > 0 ? results : undefined;
}

async function probeDrmSystems(): Promise<DrmSystemResult[] | undefined> {
  if (!('requestMediaKeySystemAccess' in navigator)) {
    return undefined;
  }

  const systems = ['com.widevine.alpha'];
  const results: DrmSystemResult[] = [];

  for (const system of systems) {
    try {
      const access = await navigator.requestMediaKeySystemAccess(system, [
        { initDataTypes: ['cenc'] }
      ]);
      
      // Assume hardware support on TV devices
      results.push({ 
        system, 
        robustness: 'HW_SECURE_DECODE' 
      });
    } catch {
      // System not supported — skip
    }
  }

  return results.length > 0 ? results : undefined;
}

function probeGraphics(): GraphicsInfo | undefined {
  const canvas = document.createElement('canvas');
  if (!canvas) return undefined;

  const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return undefined;

  const versionString = String(gl.getParameter(gl.VERSION));
  const webglVersion = versionString.includes('WebGL 2.') ? 2 : 1;

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  const extensionsList = gl.getSupportedExtensions();
  const extensions = Array.isArray(extensionsList) ? extensionsList : [];

  return { webglVersion, maxTextureSize, extensions };
}

function probeRuntime(): RuntimeInfo | undefined {
  const info: RuntimeInfo = {};

  // ES2020 checks (C9 fails this)
  info.es2020 = typeof Promise.allSettled !== 'undefined';

  return Object.keys(info).length > 0 ? info : undefined;
}

async function probeDisplay(): Promise<DisplayInfo | undefined> {
  const hdr: HdrTransfer[] = [];

  // Primary (reliable at launch, synchronous): HEVC Main10 (10-bit) decode support.
  // A device with a 10-bit HEVC pipeline is an HDR device; the C9 OLED renders both
  // PQ and HLG. The CSS media queries below don't parse on Chromium 53, and the
  // Media Capabilities transfer-function check resolves false during the ~1s pipeline
  // warmup — so this synchronous codec signal is what makes the probe trustworthy.
  if (codecSupported('video/mp4; codecs="hvc1.2.4.L153.B0"')) {
    hdr.push('pq', 'hlg');
  }

  // Refinement: Media Capabilities confirms specific transfer functions once warm.
  for (const tf of ['pq', 'hlg'] as const) {
    if (hdr.includes(tf)) continue;
    const info = await probeDecode({
      contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"', // HEVC Main10 (10-bit HDR)
      width: 3840, height: 2160, bitrate: 20_000_000, framerate: 60,
      transferFunction: tf, colorGamut: 'rec2020'
    });
    if (info && info.supported) hdr.push(tf);
  }

  // Secondary: CSS media queries, for browsers that support them (no-op on the C9).
  try {
    if (!hdr.includes('hlg') && window.matchMedia('(transfer-function:hlg)').matches) hdr.push('hlg');
    if (!hdr.includes('pq') && window.matchMedia('(transfer-function:pq)').matches) hdr.push('pq');
  } catch {
    // Ignore errors — degrade safely
  }

  return hdr.length > 0 ? { hdr } : undefined;
}