# ParamountDemo — Real-Device Validation Report

**Date:** 2026-06-04
**Device:** LG OLED65C9 — webOS 5.x, Chromium 53 (`Chrome/53` WebAppManager), 3840×2160 OLED
**Resolver host:** dev machine (`<dev-host>:8088`); TV on the same LAN (`<tv-ip>`)
**Tooling:** `@webosose/ares-cli` 2.4.0, a transparent logging proxy for the wire protocol, and Chrome DevTools Protocol (CDP) inspection over an SSH tunnel.

---

## Summary

The app was validated end-to-end on a real LG C9. The headline result: **the hand-written device fixtures told a story the real hardware did not.** On the actual Chromium-53 engine the app first resolved to the **wrong tier for the wrong reasons** — `baseline`, not the `standard` the fixtures and README claimed. Three client-side capability probes were mismeasuring the device. After fixing them, the real C9 resolves exactly as the architecture intends:

> **tier = standard**, `multi-angle` denied for the single recorded reason **`runtime.es2020`**, `hdr-overlay` enabled — with Widevine DRM playback working.

Two UX defects found on-device (a near-full-screen overlay obscuring the video, and no autoplay) were also fixed.

The capability-tiering and handshake logic was sound throughout; **every bug was in the client probes' assumptions about the target browser** — exactly the class of bug that only appears on real hardware.

---

## Method

1. **Sideloaded** the packaged `.ipk` to the C9 and ran the two-round handshake against the dev-host resolver.
2. **Captured the full client↔server exchange** with a logging proxy in front of the resolver (`TV → proxy:8088 → resolver:8090`), recording every request/response body.
3. **Inspected the running app over CDP** (the TV's remote-debug port via an SSH tunnel) to read the live capability measurements, the resolved verdict, the on-screen UI, a screenshot, and the Widevine telemetry.

---

## Finding 1 — the real device resolved to `baseline`, not `standard`

The first real handshake (verbatim from the proxy log) measured a profile very different from the fixture, and the verdict followed:

```
POST /resolve  (from the TV)
  profile.runtime.es2020 = true          ← on a Chromium-53 engine (should be false)
  profile.codecs          = (absent)      ← codec probe returned nothing
  profile.display         = (absent)      ← HDR probe returned nothing
→ 200 tier: "baseline"
     multi-angle: denied by ma.codec.hevc
     hdr-overlay: denied by hdr.hlg-pq
```

Three probes were at fault:

### 1a. `runtime.es2020` — the probe was defeated by its own polyfill
`probeRuntime()` uses `Promise.allSettled` as the ES2020 marker. But `client/polyfills.ts` imported `core-js/es/promise`, which **adds `Promise.allSettled`**, and polyfills load *before* probing. So on the Chromium-53 C9 the probe reported `es2020: true`. This is precisely the failure mode the sibling `tvStreaming` README explicitly designs against ("the polyfill deliberately omits the ones the `runtime.es2020` probe inspects, so polyfilling can't make the probe lie"). ParamountDemo had reintroduced it.

### 1b. Codec probe — wrong API config, plus a launch-time race
`probeCodecs()` called `navigator.mediaCapabilities.decodingInfo()` with a **non-standard flat config** (`{ contentType, width, … }`). Chromium 53 *does* expose `mediaCapabilities`, but only honours the spec shape (`{ type, video: { … } }`); the flat shape returns `supported: false`. Worse, `decodingInfo` **rejects for ~1s after launch** while the media pipeline warms up, so the handshake (which fires immediately) saw nothing at all. (Confirmed via CDP: the same call returns `supported: true, smooth: true` once warm.)

### 1c. HDR/display probe — unsupported media queries
`probeDisplay()` relied on `matchMedia('(transfer-function:pq|hlg)')`. On Chromium 53 these queries — and `(dynamic-range:high)`, `(color-gamut:rec2020|p3)` — **don't even parse** (`.media` returns `"not all"`). The webOS `luna` `systemproperty` service had no HDR key either. So no HDR was ever detected, even though the C9 is an HDR OLED.

---

## Fixes

| Probe | Fix |
|---|---|
| **runtime** | Dropped the Promise polyfill. Chromium 53 has a spec-complete ES2015 `Promise`, and nothing in the app uses `.finally`/`.allSettled`, so the polyfill was both unnecessary and harmful. `Promise.allSettled` is now genuinely absent on the C9 → `es2020: false`. |
| **codecs** | Detect support with the synchronous `MediaSource.isTypeSupported` (available immediately at launch, no warmup), with `canPlayType` as a secondary check. A supported HEVC/H.264 profile on dedicated TV decode silicon is treated as smooth. |
| **display / HDR** | Detect HDR via synchronous `MediaSource.isTypeSupported` for **HEVC Main10** (10-bit) decode — a reliable launch-time signal that the device has an HDR pipeline — with a retrying `decodingInfo` transfer-function check as warm refinement, and the CSS media queries kept for browsers that parse them. |

All fixes keep the source **zero-`any`** and the bundle **Chromium-53-safe** (no `?.`/`??`/native `async`).

---

## Verification (after the fixes, on the real C9)

Captured `/resolve` exchange:

```
POST /resolve  (from the TV)
  profile.runtime.es2020 = false
  profile.display.hdr    = ["pq","hlg"]
  profile.graphics       = { webglVersion: 1, maxTextureSize: 8192, … }
  context.entitlements   = ["live-premium"]
→ 200 tier: "standard"
     multi-angle: DENIED by runtime.es2020     ← the one recorded reason (the thesis)
     hdr-overlay: ENABLED (rung.gl1)
```

On-screen UI: **`Tier: STANDARD · ✗ multi-angle (runtime.es2020) · ✓ hdr-overlay`**.

**Widevine DRM telemetry (live, via CDP):**
```
state: "success", system: "com.widevine.alpha"
lastLicenseResponse: { httpStatus: 200, payloadSizeBytes: 1319 }
video: { readyState: 4, duration: 888s, videoWidth: 2560, videoHeight: 1090 }
```

This is the project's central claim, **demonstrated on real hardware**: the C9 is granted everything its hardware earns (HDR overlay), denied multi-angle for exactly one recorded reason (the antique JS engine), and plays real Widevine-protected content.

---

## UX fixes found on-device

- **Overlay obscured the video.** The status panel was a 90%-of-viewport box at 80% opacity over the player. Reduced to a compact top-left HUD (~20%×18% of 1080p, 55% opacity). Also fixed a latent bug: `#error-card` had no `display:none`, so the full-screen error overlay was technically shown by default.
- **No autoplay.** Playback now starts when the manifest loads (with a muted-retry fallback), so the demo runs hands-free. Verified: `currentTime` advances from launch with no keypress.

---

## Real-world sideloading notes (gotchas worth keeping)

- **Dev key:** pulled the per-device key from the TV's key server (`http://<tv-ip>:9991/webos_rsa`, encrypted; the Developer-Mode passphrase decrypts it). Modern OpenSSH needs `-o PubkeyAcceptedAlgorithms=+ssh-rsa -o HostKeyAlgorithms=+ssh-rsa` to talk to the C9.
- **Firewall:** `ufw` on the dev host dropped inbound `:8088`, so the TV couldn't reach the resolver until `ufw allow from <tv-ip> … port 8088`.
- **`ares-install` failure:** `/media/developer` is `root:root` 755, so the `prisoner` user can't recreate the `/media/developer/temp` dir `ares-install` insists on. Workaround: stream the ipk via `cat >` into the world-writable `temp`, then install with `luna-send-pub luna://com.webos.appInstallService/dev/install` (`luna-send` is root-only; `luna-send-pub` is world-executable).
- **CDP inspection:** SSH `-L 9998:127.0.0.1:9998`, then Node 22's global `WebSocket`. Note: this old CDP build ignores `Runtime.evaluate`'s `awaitPromise`, so async probes had to write to a global and be read back synchronously.

---

## Conclusion

The capability-tiering architecture held up; the defects were entirely in the client probes' assumptions about the Chromium-53 target — assumptions the fixtures encoded but the hardware contradicted. Once the probes measured the real engine correctly, the LG C9 resolved exactly as designed, and Widevine playback worked. The lesson the fixtures couldn't teach: **a probe that a polyfill can satisfy, or that calls an API the target shapes differently, will lie — and only the real device tells you so.**
