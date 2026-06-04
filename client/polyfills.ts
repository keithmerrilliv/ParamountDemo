// Granular core-js imports for Chromium-53 safety.
// Loaded FIRST in main entry — no app code runs before this.

import 'core-js/es/array/includes';
import 'core-js/es/array/find';
import 'core-js/es/object/assign';
import 'core-js/es/promise';
import 'core-js/es/string/includes';
import 'core-js/es/string/starts-with';
import 'core-js/es/map';
import 'core-js/es/set';

// Optional chaining and nullish coalescing are transpiled away by esbuild;
// these polyfills ensure runtime compatibility where needed.
import 'core-js/es/symbol';
import 'core-js/es/symbol/iterator';
import 'core-js/web/dom-collections';