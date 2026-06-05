# Feature Policy & Real-Time Telemetry — A Producer's Brief

**Audience:** producers and product owners who manage complex feature matrices (which titles get multi-angle, HDR overlays, premium experiences) and the business policy around them (entitlements, regional rules, staged rollouts) across a fragmented device fleet.

**Thesis:** the device should *measure* what it can do; the service should *judge* what it's allowed to do. Keeping the judgment server-side is not an engineering nicety — it is what lets **you** change the feature matrix without a client release, and it is what turns every play attempt into a real-time signal you can act on.

> Engineering companion docs: [../README.md](../README.md) (Architecture: measurement vs. judgment) and [./REAL_DEVICE_REPORT.md](./REAL_DEVICE_REPORT.md) (a real incident this approach caught).

---

## The problem you actually have

Your feature matrix is a product of three things that all move independently:

1. **What a title supports** — a live event might offer multi-angle; a film might ship an HDR grade.
2. **What a device can do** — HEVC decode, HDR pipeline, hardware-secure DRM, GPU class, JS engine age. This varies wildly across a fleet of TVs that update slowly, if ever.
3. **What the business has decided** — who's entitled (e.g. `live-premium`), where it's licensed, whether a feature is still ramping, whether a firmware turned out buggy.

The hard part is that these three change on **different clocks**. Titles change weekly. The device fleet changes over years. Business policy can change in an afternoon — a rights deal lands, a rollout needs pausing, a bad firmware needs blocking. Any design that bakes all three into one place forces them all to move at the speed of the slowest one.

## Two ways to ship a feature matrix

**Option A — the fat client.** Ship an app that contains every feature and decides locally, from on-device probes, what to light up. Simple, but the decision logic — including your business policy — is now frozen into an app binary. On a TV platform, changing it means a new build, store re-certification, and waiting months for a fleet that largely never updates. And every decision happens silently on the device; you find out what happened only if you separately instrument it.

**Option B — measure, then judge.** The device measures its capabilities and sends that profile to a resolver service. The resolver holds the feature matrix and the business policy, and returns a **verdict**: which features are on, at what quality, and — when off — *why*. This is the approach this project uses.

The rest of this brief argues why B wins for your problem, and especially what it does for telemetry.

---

## Why judgment belongs on the server

- **You own the matrix, and you can change it without a release.** The entire feature matrix and tier structure live in one place the service reads live. Adjusting a requirement, gating a feature behind an entitlement, or pausing a rollout is a server change that the whole fleet picks up on its next check-in — no app build, no store review.
- **Business policy is a dial, not a build.** Entitlement gating, percentage rollouts, and firmware denylists are first-class policy knobs, separate from capability. You can ramp a feature from 1% → 100%, or slam it back to 0%, in minutes.
- **Capability is not entitlement.** "This TV *can* do multi-angle" and "this account is *allowed* multi-angle" are different facts. The device can honestly measure the first; it must never be trusted to assert the second. Keeping the verdict server-side keeps that line clean — a device cannot grant itself a premium feature it hasn't paid for.
- **One source of truth across every surface.** The same matrix serves this TV app today and any future surface (other TVs, web, mobile). A given device earns the same verdict everywhere, and the policy is tested once.

### The matrix, in this project today

| Feature | What the device must *prove* (capability) | Business policy *you* control | Quality rungs |
|---|---|---|---|
| **multi-angle** | smooth HEVC decode · ES2020-class runtime · Widevine `HW_SECURE_DECODE` | requires `live-premium` entitlement; supports % rollout & firmware denylist | flagship (WebGL2) → up to 4 angles · standard (WebGL1) → 2 angles |
| **hdr-overlay** | HDR (HLG + PQ) signalling · WebGL | (none today — pure capability) | gl2 (WebGL2, ≥4096 textures) · gl1 (WebGL1) |

| Tier | Earned when these features are enabled |
|---|---|
| **flagship** | multi-angle **and** hdr-overlay |
| **standard** | hdr-overlay |
| **baseline** | (the safe default) |

The tier is *derived from* the feature grants — never the other way round. You manage features and policy; the tier falls out.

---

## The telemetry payoff (the heart of it)

Because every device asks the resolver before it plays, **every feature decision crosses one wire**. That single chokepoint is the difference between guessing and knowing. With a fat client, the same decisions happen on millions of devices in private; here, they are a live event stream you can measure in real time.

### What you can now see

- **Reasoned denials, fleet-wide.** A verdict doesn't just say "multi-angle: off." It says *off, denied by `runtime.es2020`* — or `policy.entitlement`, or `policy.rollout`. Aggregate those reason codes and you get, in real time, the honest answer to "**why** isn't this feature reaching people?"

  > *e.g.* `multi-angle denied: 62% runtime.es2020 · 30% policy.entitlement · 8% codec` — instantly tells you the ceiling is old hardware, not your rollout.

- **A live capability census.** Aggregate the measured profiles and you know what your install base can *actually do*: the share supporting HEVC Main10, hardware-secure Widevine, WebGL2, an HDR pipeline. That is the number you want **before** green-lighting the cost of producing a feature — you're sizing the addressable audience from real devices, not a spec sheet.

- **A real-time policy feedback loop.** Change a rollout percentage server-side and watch the grant rate move within the cache window (verdicts carry a 1-hour TTL). Ramp a feature and see the curve climb live; if quality reports spike, set it back to 0% and watch grants drain — without shipping anything. This is the control loop a fat client simply cannot give you.

- **Stable cohorts for clean A/B.** Rollout assignment is a deterministic hash of the device, so a given TV stays in or out of a cohort across check-ins. Grant rates and downstream engagement are comparable cohort-to-cohort instead of flickering.

- **Tier and rung mix.** See how the fleet distributes across flagship/standard/baseline, and which quality rung devices land on (4 angles vs 2). That tells you where your audience really is and what experience to optimize for.

- **Anomaly detection — catching a lie before it ships a bug.** The resolver flags capability claims that contradict a device's known engine (an old TV "claiming" a modern runtime). Spikes in anomalies, sliced by app version, surface a broken capability probe **across the fleet at once** — long before it corrupts your feature numbers or ships a broken experience.

### A metric menu

| Question you ask | Metric off the resolve stream |
|---|---|
| Why isn't feature X reaching people? | denial-reason histogram per feature |
| Is it worth producing feature X at all? | capability prevalence across the fleet |
| How is the rollout going — pause it? | grant-rate curve vs `rolloutPercent`, live |
| Does the entitlement convert? | grant rate among entitled vs not |
| Where is my audience, quality-wise? | tier mix + rung distribution |
| Did the last app version break a probe? | anomaly rate by app/platform version |

### This isn't hypothetical

When this app first ran on a real LG C9, the resolver's central capture showed it resolving to the wrong tier for the wrong reasons — three on-device probes were mismeasuring the hardware. **The reason codes and the captured profiles are exactly what made that diagnosable**, and the fix was a probe change, verified against the same telemetry. A fat client would have made the same wrong decision silently, on every C9, with nothing to point at. The full story is in [./REAL_DEVICE_REPORT.md](./REAL_DEVICE_REPORT.md).

---

## What this approach does *not* solve (so we're honest)

- **Detection still happens on the device.** The server judges, but it can only judge what the device measured. A bad probe still produces a bad input — the server's role is to *catch* the implausible ones and give you the telemetry to spot the rest, not to make detection magically correct.
- **It adds a round trip.** Playback waits on a verdict. The service therefore always returns a safe, conservative verdict even if resolution fails, so a device never gets stuck — but the dependency is real and must stay fast and highly available.
- **Telemetry is only as good as your reason codes.** The value above comes from naming *why* a feature was denied. New policies should ship with new, distinct reason codes, or the histograms blur.

---

## Glossary (producer term → where it lives)

| You call it | The system calls it |
|---|---|
| Feature matrix | the feature specs the resolver reads (`server/catalog.ts`) |
| "Must have" requirements | capability **predicates** (codec / DRM robustness / HDR / GPU / runtime) |
| Entitlement / rights / rollout / firmware block | **policy** on a feature (entitlement, rollout %, denylist) |
| Quality levels of a feature | **rungs** |
| Device class | **tier** (flagship / standard / baseline) — *derived from* features |
| The per-device answer | the **verdict** (features on/off, quality, and the reason when off) |

---

**Bottom line:** put measurement on the device and judgment on the service, and your feature matrix stops being something frozen into an app you can't update. It becomes a control surface you change in minutes — and every play attempt becomes a real-time signal telling you what your audience can do, what they're getting, and exactly why anyone is missing out.
