// Shaka Player integration with DRM telemetry state machine.
// Uses networking-engine filters for license tracking.

import { DASH_MANIFEST_URL, LICENSE_SERVER_URL } from './widevineConfig';

type LicenseState = 'idle' | 'requesting' | 'success' | 'error';

interface DrmTelemetry {
  state: LicenseState;
  system?: string;
  robustnessLevel?: string;
  lastLicenseResponse?: { httpStatus: number; payloadSizeBytes: number };
}

// Minimal structural types for the subset of the global Shaka Player API we use.
// Shaka is loaded as a global <script> (window.shaka); its shipped d.ts is a
// global-namespace declaration rather than an ES module, so we model the surface
// we touch here instead of importing it.
interface ShakaRequest {
  uris?: string[];
}
interface ShakaResponse {
  data?: ArrayBuffer;
  status?: number;
}
interface ShakaNetworkingEngine {
  registerRequestFilter(filter: (type: number, request: ShakaRequest) => void): void;
  registerResponseFilter(filter: (type: number, response: ShakaResponse) => void): void;
}
interface ShakaDrmInfo {
  keySystem?: string;
  videoRobustness?: string;
}
interface ShakaPlayer {
  configure(config: unknown): void;
  load(uri: string): Promise<void>;
  getNetworkingEngine(): ShakaNetworkingEngine | null;
  drmInfo(): ShakaDrmInfo | null;
  destroy(): Promise<void>;
}
interface ShakaPlayerCtor {
  new (video?: HTMLVideoElement): ShakaPlayer;
  isBrowserSupported(): boolean;
}
interface ShakaStatic {
  Player: ShakaPlayerCtor;
  polyfill?: { installAll(): void };
  net: { NetworkingEngine: { RequestType: { LICENSE: number } } };
}

declare global {
  interface Window {
    shaka?: ShakaStatic;
  }
}

class ShakaPlayerWrapper {
  private player: ShakaPlayer | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private telemetry: DrmTelemetry = { state: 'idle' };

  async initialize(videoEl: HTMLVideoElement): Promise<void> {
    this.videoElement = videoEl;

    const shaka = window.shaka;
    if (shaka && shaka.polyfill) {
      shaka.polyfill.installAll();
    }

    if (!shaka || !shaka.Player.isBrowserSupported()) {
      throw new Error('Shaka Player not supported in this browser');
    }

    const player = new shaka.Player(videoEl);
    this.player = player;

    // Configure Widevine DRM servers exactly as specified.
    player.configure({
      drm: {
        servers: {
          'com.widevine.alpha': LICENSE_SERVER_URL
        }
      }
    });

    // Set up networking-engine filters for license tracking. Shaka has no
    // license events; the request/response filters on RequestType.LICENSE are
    // the documented way to observe the handshake.
    const netEngine = player.getNetworkingEngine();
    if (netEngine) {
      const RequestType = shaka.net.NetworkingEngine.RequestType;

      netEngine.registerRequestFilter((type: number, _request: ShakaRequest) => {
        if (type === RequestType.LICENSE) {
          this.telemetry.state = 'requesting';
        }
      });

      netEngine.registerResponseFilter((type: number, response: ShakaResponse) => {
        if (type === RequestType.LICENSE) {
          if (response && response.data) {
            this.telemetry.lastLicenseResponse = {
              httpStatus: response.status ?? 200,
              payloadSizeBytes: response.data.byteLength
            };
            this.telemetry.state = 'success';
          } else {
            this.telemetry.state = 'error';
          }
        }
      });
    }
  }

  async loadManifest(): Promise<void> {
    if (!this.player || !this.videoElement) {
      throw new Error('Player not initialized');
    }

    try {
      await this.player.load(DASH_MANIFEST_URL);

      // Read CDM info after load resolves (robustness comes from drmInfo(),
      // not from an event). On a dev Chromium this is typically SW_SECURE_*;
      // on the real C9 it should report HW_SECURE_*.
      const drmInfo = this.player.drmInfo();
      if (drmInfo) {
        this.telemetry.system = drmInfo.keySystem ?? 'com.widevine.alpha';
        this.telemetry.robustnessLevel = drmInfo.videoRobustness;
      }
    } catch (e) {
      this.telemetry.state = 'error';
      throw e;
    }
  }

  getTelemetry(): DrmTelemetry {
    return { ...this.telemetry };
  }

  destroy(): void {
    if (this.player) {
      void this.player.destroy().catch(() => {});
      this.player = null;
    }
  }
}

export function createShakaPlayer(): ShakaPlayerWrapper {
  return new ShakaPlayerWrapper();
}
