// DOM rendering: tier banner, feature list, telemetry panel, error card.
// D-pad key handling for webOS remote.

import type { Verdict, FeatureGrant } from '../shared/handshake';

interface UIState {
  verdict: Verdict;
  showTelemetryPanel: boolean;
  showErrorCard: boolean;
  errorMessage?: string;
  errorCodeName?: string;
}

class AppUI {
  private container: HTMLElement | null = null;
  private state: UIState;

  constructor() {
    this.state = {
      verdict: { tier: 'baseline', features: {}, bundles: [], ttlSeconds: 0, fallback: false },
      showTelemetryPanel: false,
      showErrorCard: false
    };
  }

  init(containerId: string): void {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);
    this.container = el;

    // Compact HUD pinned to the top-left safe area — it sits over the video as a
    // status panel rather than covering it. Width/height hug the content so the
    // Sintel playback stays visible behind and beside it.
    const wrapper = document.createElement('div');
    wrapper.id = 'paramount-ui-wrapper';
    wrapper.style.cssText = `
      position: fixed;
      top: 5%;
      left: 5%;
      width: auto;
      max-width: 34%;
      max-height: 90%;
      display: flex;
      flex-direction: column;
      font-family: sans-serif;
      color: white;
      background-color: rgba(0, 0, 0, 0.55);
      border-radius: 12px;
      overflow: hidden;
      z-index: 9999;
    `;

    // Tier banner
    const tierBanner = document.createElement('div');
    tierBanner.id = 'tier-banner';
    tierBanner.style.cssText = `
      padding: 16px 24px;
      background-color: #333;
      font-size: 24px;
      font-weight: bold;
      text-align: center;
    `;
    wrapper.appendChild(tierBanner);

    // Feature list container
    const featureList = document.createElement('div');
    featureList.id = 'feature-list';
    featureList.style.cssText = `
      overflow-y: auto;
      padding: 12px 20px;
    `;
    wrapper.appendChild(featureList);

    // Telemetry panel (toggleable)
    const telemetryPanel = document.createElement('div');
    telemetryPanel.id = 'telemetry-panel';
    telemetryPanel.style.cssText = `
      display: none;
      padding: 16px 24px;
      background-color: rgba(0, 0, 0, 0.5);
      border-top: 1px solid #555;
    `;
    
    const telemetryContent = document.createElement('pre');
    telemetryContent.id = 'telemetry-content';
    telemetryContent.style.cssText = `
      white-space: pre-wrap;
      word-break: break-word;
      font-family: monospace;
      font-size: 18px;
    `;
    telemetryPanel.appendChild(telemetryContent);
    wrapper.appendChild(telemetryPanel);

    // Error card (full-screen overlay) — hidden until an error actually occurs.
    const errorCard = document.createElement('div');
    errorCard.id = 'error-card';
    errorCard.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.9);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const errorContent = document.createElement('div');
    errorContent.id = 'error-content';
    errorContent.style.cssText = `
      padding: 40px;
      text-align: center;
      max-width: 600px;
    `;

    const errorMsg = document.createElement('p');
    errorMsg.id = 'error-message';
    errorMsg.style.cssText = `
      font-size: 24px;
      margin-bottom: 16px;
    `;
    
    const errorCodeNameEl = document.createElement('p');
    errorCodeNameEl.id = 'error-code-name';
    errorCodeNameEl.style.cssText = `
      font-family: monospace;
      color: #ff5555;
      font-size: 20px;
    `;

    errorContent.appendChild(errorMsg);
    errorContent.appendChild(errorCodeNameEl);
    errorCard.appendChild(errorContent);
    wrapper.appendChild(errorCard);

    el.appendChild(wrapper);
  }

  render(verdict: Verdict): void {
    this.state.verdict = verdict;

    // Update tier banner
    const tierBanner = document.getElementById('tier-banner');
    if (tierBanner) {
      tierBanner.textContent = `Tier: ${verdict.tier.toUpperCase()}${verdict.fallback ? ' (fallback)' : ''}`;
      tierBanner.style.backgroundColor = verdict.fallback ? '#8b0000' : '#333';
    }

    // Render feature list
    const featureList = document.getElementById('feature-list');
    if (featureList) {
      featureList.innerHTML = '';
      
      for (const [name, grant] of Object.entries(verdict.features)) {
        const item = document.createElement('div');
        item.style.cssText = `
          padding: 12px;
          margin-bottom: 8px;
          border-radius: 6px;
          background-color: ${grant.enabled ? '#4caf50' : '#f44336'};
          font-size: 20px;
        `;
        
        const status = grant.enabled ? '✓ Enabled' : '✗ Denied';
        let reason = '';
        if (!grant.enabled && grant.deniedBy?.predicateId) {
          reason = ` (${grant.deniedBy.predicateId})`;
        }
        
        item.textContent = `${status}: ${name}${reason}`;
        featureList.appendChild(item);
      }
    }

    this.updateTelemetryPanel();
  }

  updateTelemetryPanel(): void {
    const telemetryContent = document.getElementById('telemetry-content');
    if (telemetryContent) {
      const telemetry = window.shakaPlayer?.getTelemetry?.() || {};
      telemetryContent.textContent = JSON.stringify(telemetry, null, 2);
    }
  }

  toggleTelemetryPanel(): void {
    this.state.showTelemetryPanel = !this.state.showTelemetryPanel;
    
    const panel = document.getElementById('telemetry-panel');
    if (panel) {
      panel.style.display = this.state.showTelemetryPanel ? 'block' : 'none';
    }
  }

  showError(message: string, codeName?: string): void {
    this.state.showErrorCard = true;

    const errorMsg = document.getElementById('error-message');
    const errorCodeNameEl = document.getElementById('error-code-name');

    if (errorMsg) errorMsg.textContent = message;
    if (errorCodeNameEl) errorCodeNameEl.textContent = codeName ? `Error Code: ${codeName}` : '';

    // Show full-screen error card
    const errorCard = document.getElementById('error-card');
    if (errorCard) {
      errorCard.style.display = 'flex';
    }
  }

  hideError(): void {
    this.state.showErrorCard = false;
    const errorCard = document.getElementById('error-card');
    if (errorCard) {
      errorCard.style.display = 'none';
    }
  }

  addKeyHandler(handler: (keyCode: number) => boolean): void {
    document.addEventListener('keydown', (e) => {
      handler(e.keyCode);
    });
  }
}

export function createAppUI(): AppUI {
  return new AppUI();
}