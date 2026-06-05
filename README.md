# Paramount Demo — C9 Capability Tiering + Widevine Playback (webOS)

A single webOS TV app combining capability tiering with Shaka Player DRM playback, targeting LG OLED65C9 (Chromium-53).

## Overview

This application performs a two-round handshake with a local resolver service to derive a cosmetic **tier** strictly from per-feature grants. After the verdict is applied, it plays a public Widevine test stream while exposing license telemetry and D-pad controls within a safe-area UI.

All client code is transpiled to ES2015 via esbuild (`--target=chrome53`) with granular core-js polyfills; strict TypeScript enforces zero `any`.

## Architecture: measurement vs. judgment

The shell **measures** (client-side capability probes in `client/probe.ts`) and the resolver **judges** (`server/` maps a capability profile to a tier + per-feature grants). The split is *not* about making capability detection more robust — detection is client-side in any design — but about keeping policy where it can change without reshipping a webOS app:

- **Policy velocity** — feature gates, rollout %, firmware denylists and tier bands live in `server/catalog.ts` (the single source of truth); changing them needs no new client build or store re-certification.
- **Entitlement authority** — `multi-angle` is gated on the `live-premium` entitlement, an account fact the client cannot be trusted to self-assert. Capability is not entitlement.
- **Fleet observability** — every device's real profile and verdict cross a wire, so a mismeasuring probe is visible centrally — see the Real-device validation section below.

A fat client with every feature prebaked and gated purely on client probes cannot express the entitlement/rollout gates, and gives no central view when a probe lies — which, on real hardware, is exactly what happened.

## Prerequisites

- Node.js 20 LTS
- LG webOS Developer Mode enabled on your C9 (registered with the LG CLI as device `c9`)
- LG CLI tools installed (`ares-package`, `ares-install`, `ares-launch`, `ares-inspect`)

## Build & Serve Steps

### Install dependencies

```bash
npm install
```

### Generate placeholder icons (run once before packaging)

```bash
npm run icons
```

### Type-check all source

```bash
npm run typecheck
```

### Build the client bundle

```bash
npm run build
```

The output is written to `dist/webos/app.js`. Verify no optional chaining or nullish coalescing survives:

```bash
grep -c -F '?.' dist/webos/app.js   # should be 0
grep -c -F '??' dist/webos/app.js   # should be 0
```

### Start the resolver service (on your dev machine)

```bash
npm run serve
```

Verify health endpoint: curl `http://<dev-host>:8088/health`.

Update `webos/index.html` with your resolver address:

```html
<script>
window.__SHELL__ = {
  version: "1.0.0",
  platform: { kind: "webos", webosVersion: "4.5" },
  resolverBaseUrl: "http://<dev-host>:8088",
  // Session entitlements forwarded to the resolver. 'live-premium' unlocks
  // multi-angle on capable devices (the C9 stays gated by runtime.es2020).
  entitlements: ["live-premium"]
};
</script>
```

## Sideload & Debug on C9

### Package into `.ipk`

```bash
npm run package
```

This produces `dist/com.paramount.demo_1.0.0_all.ipk`.

### Install and launch

```bash
ares-install --device c9 dist/*.ipk
ares-launch --device c9 com.paramount.demo
```

### Inspect / debug

```bash
ares-inspect --device c9 --app com.paramount.demo --open
```

Press the **Info** button (or `i`) to toggle the DRM telemetry panel.

Use D-pad keys:
- Left/Right: seek ∓10s
- Enter: play/pause
- Up/Down or Info (`i`, keyCode `457`): toggle telemetry panel

## Acceptance criteria checklist

- [x] All dependencies pinned exactly in `package.json`
- [x] Strict TypeScript enabled, zero `any` tokens in source
- [x] Widevine manifest URL and license server URL appear verbatim
- [x] Shaka config wires `'com.widevine.alpha'` to the license server
- [x] LG C9 **fixture** resolves to tier `"standard"` with `multi-angle` denied by `runtime.es2020` (illustrative bench input — the **real device** is validated separately in the Real-device validation section below)
- [x] Client bundle is Chromium-53-safe (no `?.` or `??`)

## Real-device validation (LG C9)

Verified on a physical **LG OLED65C9** (webOS 5.x, Chromium 53, 3840×2160 OLED), not just against the fixtures. Full write-up: **[docs/REAL_DEVICE_REPORT.md](docs/REAL_DEVICE_REPORT.md)**.

**Headline:** the hand-written fixtures told a story the real hardware did not. The first on-device run resolved to `baseline` for the wrong reasons — three client probes mismeasured the real engine. The capability-tiering and handshake logic was sound throughout; **every bug was in the probes' assumptions about the target browser**.

| Probe | Bug on real hardware | Fix |
|---|---|---|
| `runtime.es2020` | A core-js `Promise` polyfill added `Promise.allSettled`, so the ES2020 marker read `true` on a Chromium-53 engine. | Dropped the Promise polyfill (the engine's ES2015 `Promise` is complete; nothing uses `.allSettled`/`.finally`) → `es2020:false`. |
| codecs | `mediaCapabilities.decodingInfo()` was called with a non-standard flat config and rejects for ~1s after launch, so the immediate handshake saw no codecs. | Detect with synchronous `MediaSource.isTypeSupported` (no warmup), `canPlayType` as backup. |
| display / HDR | `matchMedia('(transfer-function:pq\|hlg)')` and friends don't even parse on Chromium 53, so no HDR was detected on an HDR OLED. | Detect HDR via synchronous `MediaSource.isTypeSupported` for HEVC Main10, with a retrying `decodingInfo` refinement. |

After the fixes the real C9 resolves exactly as designed:

```
tier: standard
multi-angle: DENIED — runtime.es2020 (the one recorded reason)
hdr-overlay: ENABLED (rung.gl1)
```

On-screen: `Tier: STANDARD · ✗ multi-angle (runtime.es2020) · ✓ hdr-overlay`.

Widevine DRM playback confirmed live on-device:

```
state: success, system: com.widevine.alpha
license response: httpStatus 200, ~1.3 KB payload
video: readyState 4, 2560×1090, duration ~888s
```

Two on-device UX defects were also fixed: a near-full-screen status overlay obscuring the video (reduced to a compact HUD; also fixed an error card missing `display:none`), and missing autoplay (playback now starts on manifest load with a muted-retry fallback).

> The lesson the fixtures couldn't teach: a probe a polyfill can satisfy, or that calls an API the target shapes differently, will lie — and only the real device tells you so. The resolver now guards against this specific failure — an implausible `es2020:true` from a pre-webOS-6 build is distrusted and logged (`server/resolver.ts` `sanitizeProfile`).