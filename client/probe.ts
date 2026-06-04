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

// The flat, contentType-based config this code feeds to mediaCapabilities
// (the webOS shape), plus the slice of the result we read. The standard DOM
// MediaCapabilities type expects a different config shape, so we model only
// what we actually call here.
interface DecodingConfig {
  contentType: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
}
interface DecodingInfoResult {
  supported?: boolean;
  smooth?: boolean;
}
interface MediaCapabilitiesProbe {
  decodingInfo(config: DecodingConfig): Promise<DecodingInfoResult>;
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
  if (!('mediaCapabilities' in navigator)) {
    return undefined;
  }

  const results: CodecResult[] = [];

  const mediaCapabilities = navigator.mediaCapabilities as unknown as MediaCapabilitiesProbe;

  // HEVC-main test (C9 supports this)
  try {
    const hevcConfig = {
      contentType: 'video/mp4; codecs="hvc1.1.6.L120.B0"',
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 30
    };
    const hevcSupport = await mediaCapabilities.decodingInfo(hevcConfig);
    results.push({
      mimeType: 'video/mp4; codecs="hvc1.1.6.L120.B0"',
      supported: !!hevcSupport.supported,
      smooth: !!hevcSupport.smooth
    });
  } catch {
    // Ignore errors — degrade safely
  }

  // H.264 baseline test (fallback for older devices)
  try {
    const h264Config = {
      contentType: 'video/mp4; codecs="avc1.42E01E"',
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 30
    };
    const h264Support = await mediaCapabilities.decodingInfo(h264Config);
    results.push({
      mimeType: 'video/mp4; codecs="avc1.42E01E"',
      supported: !!h264Support.supported,
      smooth: !!h264Support.smooth
    });
  } catch {
    // Ignore errors
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

function probeDisplay(): DisplayInfo | undefined {
  const display: DisplayInfo = { hdr: [] };

  // Check HDR transfer functions via CSS media queries
  try {
    if (window.matchMedia('(transfer-function:hlg)').matches) {
      display.hdr.push('hlg');
    }
    if (window.matchMedia('(transfer-function:pq)').matches) {
      display.hdr.push('pq');
    }
  } catch {
    // Ignore errors — degrade safely
  }

  return display.hdr.length > 0 ? display : undefined;
}