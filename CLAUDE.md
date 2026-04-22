# CLAUDE.md

@README.md covers the bug, how to run it, how agent loading works, and the load-bearing implementation details (`index.html` preambles, behavioral wrapper detection, per-browser pills).

Below are design-rationale notes that don't belong in a support-facing README but matter when editing the repro.

## Don't refactor these

### `createGlobalStyle`, not `styled.div<{ $css }>`

`DemoRules` (`src/Demo.tsx`) uses `createGlobalStyle`. This is load-bearing: a `styled.div<{ $css: string }>` caches rules per generated class and keeps them in the sheet across prop changes, so toggling pills never fires `clearGroup` and never exercises `deleteRule`. `createGlobalStyle` explicitly clears and re-inserts its rule group on every render with new props, which is the path that surfaces the drift as `IndexSizeError` inside styled-components' own commit-phase cleanup. Because that throw originates from styled-components (not a hand-rolled effect), the error boundary catch mirrors what a real app sees.

### Why wrapper detection is behavioral, not structural

`insertRuleSuppresses()` uses a behavioral probe (insert invalid CSS, observe whether `SyntaxError` propagates) because the two obvious structural checks both fail:

- `CSSStyleSheet.prototype.insertRule === nativeFromIframe` is **always false** — each realm has its own `CSSStyleSheet` object; even two unmodified prototypes compare unequal across frames.
- `fn.toString().includes('[native code]')` is **fooled by Proxies**. Pendo wraps via `new Proxy(fn, { apply })`, and Proxies transparently forward `.toString()` to the target; the wrapped method still stringifies as `[native code]`.

### Don't use the `@pendo/web-sdk` npm package

The npm package's `setup.js` sets `config.loadAsModule = true` before calling `loadAgent`. That branches through `createPendoObject` to `windowOrMountPoint = loadAsModule(config) ? {} : window`, mounting Pendo on a throwaway empty object. Session replay never boots, so the CSSOM wrapper never installs, so the regression never reproduces.

The bundled files (and CDN-loaded files) are the CDN-served IIFE format — the same format the real production install snippet loads.

## Reminders

- Preserve the "minimal, self-contained, deterministic" property. This repo is a support-ticket attachment, not a product.
- The two `index.html` preambles are load-bearing; don't reorder or remove them.
- No tests — the repro is the artifact.
