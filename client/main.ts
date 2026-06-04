// Entry point: load polyfills -> run handshake -> render UI -> init player.
// Loads polyfills FIRST, before the rest of the app runs.

import './polyfills';
import type { ShellConfig } from './globals';

async function main(): Promise<void> {
  // Get shell config from injected window.__SHELL__
  const shellConfig: ShellConfig = window.__SHELL__ || {};
  
  if (!shellConfig.platform) {
    console.warn('No platform info in __SHELL__, using defaults');
  }

  const platform = shellConfig.platform || { kind: 'browser' as const, userAgent: navigator.userAgent };

  // Perform capability handshake with fallback to baseline on error
  const { verdict } = await import('./handshakeClient.js').then(m => 
    m.performHandshake(platform, shellConfig.resolverBaseUrl)
  );

  // Initialize UI and render tier banner + feature list
  const uiModule = await import('./ui.js');
  const ui = uiModule.createAppUI();
  ui.init('app-container');

  // Render the verdict — this shows tier and per-feature grants
  ui.render(verdict);

  // Initialize Shaka Player for Widevine playback
  try {
    const playerModule = await import('./player.js');
    const shakaPlayer = playerModule.createShakaPlayer();
    
    // Store reference for telemetry updates
    window.shakaPlayer = shakaPlayer;

    // Create video element
    const videoEl = document.createElement('video');
    videoEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background-color: black;
    `;
    document.body.appendChild(videoEl);

    // Initialize player with video element
    await shakaPlayer.initialize(videoEl);
    
    // Load manifest
    await shakaPlayer.loadManifest();

    // Set up D-pad key handling
    ui.addKeyHandler((keyCode) => {
      switch (keyCode) {
        case 37: // Left - seek backward 10s
          if (!videoEl.paused && !isNaN(videoEl.duration)) {
            videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
          }
          return true;
        case 39: // Right - seek forward 10s
          if (!videoEl.paused && !isNaN(videoEl.duration)) {
            videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 10);
          }
          return true;
        case 13: // Enter - play/pause
          if (videoEl.paused) {
            videoEl.play().catch(() => {});
          } else {
            videoEl.pause();
          }
          return true;
        case 456: // Up/Down or Info button on webOS remote
        case 457:
        case 73: // 'i' key
          ui.toggleTelemetryPanel();
          return true;
        default:
          return false;
      }
    });
  } catch (e: unknown) {
    const shakaError = e instanceof Error ? 
      { codeName: String(e.name), message: e.message } : 
      { codeName: 'UNKNOWN_ERROR', message: String(e) };
    
    ui.showError(shakaError.message, shakaError.codeName);
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}