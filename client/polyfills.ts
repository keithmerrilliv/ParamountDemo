// Granular core-js imports for Chromium-53 safety.
// Loaded FIRST in main entry — no app code runs before this.

import 'core-js/es/array/includes';
import 'core-js/es/array/find';
import 'core-js/es/object/assign';
// NOTE: Promise is deliberately NOT polyfilled. Chromium 53 ships a spec-complete
// ES2015 Promise, and `core-js/es/promise` would add Promise.allSettled — the exact
// feature the runtime.es2020 probe inspects — which would make the C9 falsely report
// es2020=true and mis-tier the device. A polyfill must never mask what a probe measures.
import 'core-js/es/string/includes';
import 'core-js/es/string/starts-with';
import 'core-js/es/map';
import 'core-js/es/set';

// Optional chaining and nullish coalescing are transpiled away by esbuild;
// these polyfills ensure runtime compatibility where needed.
import 'core-js/es/symbol';
import 'core-js/es/symbol/iterator';
import 'core-js/web/dom-collections';