# Paramount Demo — C9 Capability Tiering + Widevine Playback (webOS)

A single webOS TV app combining capability tiering with Shaka Player DRM playback, targeting LG OLED65C9 (Chromium-53).

## Overview

This application performs a two-round handshake with a local resolver service to derive a cosmetic **tier** strictly from per-feature grants. After the verdict is applied, it plays a public Widevine test stream while exposing license telemetry and D-pad controls within a safe-area UI.

All client code is transpiled to ES2015 via esbuild (`--target=chrome53`) with granular core-js polyfills; strict TypeScript enforces zero `any`.

## Prerequisites

- Node.js 20 LTS
- LG webOS Developer Mode enabled on your C9 (registered as `c9` at `192.168.50.223`)
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

### Start the resolver service (on dev machine, e.g., `192.168.50.101`)

```bash
npm run serve
```

Verify health endpoint: curl `http://192.168.50.101:8088/health`.

Update `webos/index.html` with your resolver address:

```html
<script>
window.__SHELL__ = {
  version: "1.0.0",
  platform: { kind: "webos", webosVersion: "4.5" },
  resolverBaseUrl: "http://192.168.50.101:8088",
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
- [x] LG C9 fixture yields tier `"standard"` with `multi-angle` denied by `runtime.es2020`
- [x] Client bundle is Chromium-53-safe (no `?.` or `??`)