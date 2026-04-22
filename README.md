# Pendo Web SDK `insertRule` regression

Minimal reproduction of a regression in **Pendo Web SDK 2.321.0** (Beta channel, 2026-04-20) that breaks **styled-components v6**. The previous Stable build, 2.320.2, is unaffected.

`pnpm build` produces a self-contained static artifact (`dist/index.html`) that can be hosted on S3, GitHub Pages, or opened locally.

## The bug

Pendo 2.321.0's session-replay code wraps `CSSStyleSheet.prototype.insertRule` with a `try/catch` that silently suppresses native throws:

```js
// 2.321.0 — CSSStyleSheet.prototype.insertRule wrapper
new Proxy(insertRule, {
  apply: (target, thisArg, args) => {
    // ... recording mirror elided ...
    try {
      return target.apply(thisArg, args);
    } catch (e) {} // throws suppressed
  },
});

// 2.320.2 — same wrapper, no try/catch
new Proxy(insertRule, {
  apply: (target, thisArg, args) => {
    return target.apply(thisArg, args); // throws propagate
  },
});
```

`styled-components` v6's `CSSOMTag.insertRule` ([Tag.ts:35-43](https://github.com/styled-components/styled-components/blob/styled-components@6.4.1/packages/styled-components/src/sheet/Tag.ts#L35-L43)) uses its own try/catch to detect rejected rules and only advances its internal `length` when the native call doesn't throw. When Pendo suppresses the throw, styled-components counts a phantom insert and its tracked length diverges from the real sheet. A later `deleteRule(N)` (during unmount / `clearGroup`) then either throws `IndexSizeError` out of the React commit — surfacing as an error-boundary fallback — or silently deletes a rule belonging to an unrelated component, corrupting page styling without any thrown error.

The page shows both failure modes side-by-side: **Demo 1** uses an isolated `StyleSheetManager` target where drift immediately overshoots and throws; **Demo 2** shares the page-wide sheet where drifted deletes land on other components' rules.

## Running it

```sh
pnpm install
pnpm dev         # dev server on http://localhost:5173
pnpm build       # tsc + vite build → dist/index.html (self-contained)
pnpm lint        # eslint
pnpm preview     # serve dist/ locally
```

No tests — the repro is the artifact.

## Loading a Pendo agent

The page offers three ways to load a Pendo agent:

1. **No Pendo** (default) — baseline comparison; styled-components' try/catch works correctly.
2. **Bundled agents** — if you drop Pendo agent files into `public/` as `pendo-{label}.js` (e.g. `pendo-2.321.0.js`), they appear as selectable options on the page. Each click navigates to `/?agent={label}`.
3. **Load from CDN** — enter your Pendo API key in the dialog; the page navigates to `/?key={yourKey}` and loads `https://cdn.pendo.io/agent/static/{key}/pendo.js`.

Switching between agents reloads the page (the CSSOM prototype wrapper can't be uninstalled without a fresh page load).

The status pill shows the detected state: whether a wrapper is installed and whether it suppresses throws (detected behaviorally — see `insertRuleSuppresses` in `src/App.tsx`).

## Bundled agent files

This repo ships without agent files. To bundle your own:

1. Download the agent from Pendo's CDN: `https://cdn.pendo.io/agent/static/{apiKey}/pendo.js`
2. Save it as `public/pendo-{label}.js` (e.g. `public/pendo-2.321.0.js`)
3. Restart the dev server — the file appears as a selectable option

A Vite plugin (`pendoAgentDiscovery` in `vite.config.ts`) scans `public/` at build time for files matching `pendo-*.js` and exposes their labels via `virtual:pendo-agents`. If `public/` has no matching files, no bundled options appear.

## Implementation notes

### `index.html` preambles

Two inline `<script>` blocks in `index.html` run before any other code and must not be reordered or removed:

- **Native CSSOM capture** (`index.html:16-19`): stashes `CSSStyleSheet.prototype.insertRule` / `deleteRule` on `window.__nativeInsertRule` / `__nativeDeleteRule` before Pendo has a chance to wrap them. `isRuleRejectedByBrowser()` uses this to classify each rule against the real native parser, independent of whatever wrapper is later installed.
- **`window.SC_DISABLE_SPEEDY = false`** (`index.html:28`): forces styled-components onto the `CSSOMTag` (`insertRule`) path even in dev. The dev default is `TextTag` (text-node injection), which bypasses `insertRule` entirely — the bug silently doesn't reproduce under `pnpm dev` without this. Must run before the styled-components module initializer.

### Wrapper detection is behavioral

`insertRuleSuppresses()` (in `src/App.tsx`) detects whether a Pendo-style wrapper is masking throws by inserting invalid CSS into a throwaway `<style>` and observing whether a `SyntaxError` propagates. Structural checks (prototype identity, `.toString()`) don't work reliably across realms and Proxies.

### Rule validity is per-browser

The rule set (`RULE_SPECS` in `src/App.tsx`) mixes ordinary visual rules with foreign vendor-prefixed pseudo-element rules (`::-moz-placeholder`, `::-ms-input-placeholder`, etc.) modeled on MUI v5's cross-browser input styling. Each rule's `invalid` flag is computed at load time against the captured native `insertRule`, so rows marked ✗ reflect what this specific browser actually rejects — Chrome rejects most foreign vendor prefixes, Firefox accepts more as web-compat aliases.

### Deploying

`pnpm build` produces `dist/index.html` with all app JS/CSS inlined by `vite-plugin-singlefile`. If bundled agent files exist in `public/`, they're copied to `dist/` alongside the HTML. For CDN-only use, `index.html` alone is sufficient.
