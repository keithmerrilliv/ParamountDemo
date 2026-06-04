// Ambient declarations for the window globals the certified shell injects
// (`__SHELL__`) and the player handle the app shares for telemetry
// (`shakaPlayer`). Mirrors the per-file `declare global` idiom in player.ts.

import type { Platform } from '../shared/handshake';

export interface ShellConfig {
  version?: string;
  platform?: Platform;
  resolverBaseUrl?: string;
}

declare global {
  interface Window {
    __SHELL__?: ShellConfig;
    shakaPlayer?: ReturnType<typeof import('./player').createShakaPlayer>;
  }
}
