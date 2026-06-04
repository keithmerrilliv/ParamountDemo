// Two-round orchestration with injectable transport + baseline fallback.
// If resolver is unreachable, falls back to conservative baseline verdict.

import type { Platform, ProbePlan, CapabilityProfile, Verdict } from '../shared/handshake';
import { runProbePlan } from './probe';

interface Transport {
  post(url: string, body: unknown): Promise<unknown>;
}

class HttpTransport implements Transport {
  constructor(private baseUrl: string) {}

  async post(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(new URL(url, this.baseUrl).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }
}

function makeBaselineVerdict(): Verdict {
  return {
    tier: 'baseline',
    features: {},
    bundles: ['main'],
    ttlSeconds: 0,
    fallback: true
  };
}

export async function performHandshake(
  platform: Platform,
  resolverBaseUrl?: string
): Promise<{ verdict: Verdict; probePlan?: ProbePlan }> {
  // If no resolver base URL provided, use baseline immediately
  if (!resolverBaseUrl || !String(resolverBaseUrl).trim()) {
    return { verdict: makeBaselineVerdict() };
  }

  try {
    const transport = new HttpTransport(resolverBaseUrl);

    // Round 1 — get probe plan
    const probePlanRequest = {
      shellVersion: '1.0.0',
      platform
    };

    const probePlan = await transport.post('/probe-plan', probePlanRequest) as ProbePlan;

    // Run probes according to plan
    const profile = await runProbePlan(platform);

    // Round 2 — resolve to verdict
    const resolveRequest = {
      profile
    };

    const verdict = await transport.post('/resolve', resolveRequest) as Verdict;

    return { verdict, probePlan };
  } catch (e) {
    // Network error or timeout — fall back to baseline
    console.warn('Resolver handshake failed, using baseline:', e);
    return { verdict: makeBaselineVerdict() };
  }
}