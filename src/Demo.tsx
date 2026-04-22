import { useState } from 'react';
import styled, { createGlobalStyle, StyleSheetManager } from 'styled-components';

export const DEMO_CLASS = 'demo-box';

const DemoBox = styled.div`
  padding: 24px;
  border: 2px solid #7c9eb2;
  border-radius: 6px;
  margin: 12px 0;
  min-height: 48px;
  background: #f0f7fb;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  color: #1a3a4a;
  line-height: 1.5;
`;

// createGlobalStyle (not styled.div) is required for this repro:
// styled-components caches rules per generated class and keeps them in the sheet even
// when props change, so styled.div<{ $css }> doesn't fire clearGroup
// on pill toggle. createGlobalStyle explicitly clears + re-inserts its
// rule group on every render with new props, which is the path that
// exercises CSSOMTag.deleteRule and surfaces the drift.
const DemoRules = createGlobalStyle<{ $css: string }>`
  ${(p) => p.$css}
`;

// Global sheet demo: DemoRules injects into the shared page-wide sheet.
// Drifted deleteRule calls land on other components' rules in the same
// sheet, causing visible corruption (page styling breaks).
export function GlobalSheetDemo({ activeCSS }: { activeCSS: string }) {
  return (
    <>
      <DemoRules $css={activeCSS} />
      <DemoBox className={DEMO_CLASS}>
        The visual rules to the left change this box. The vendor-prefixed rules have no visual
        effect but still drift the counter when rejected.
      </DemoBox>
    </>
  );
}

// Isolated sheet demo: DemoRules injects into a dedicated <style> element
// via StyleSheetManager. The small sheet means drifted deleteRule indices
// immediately overshoot → IndexSizeError.
export function IsolatedSheetDemo({ activeCSS }: { activeCSS: string }) {
  const [target] = useState(() => {
    const el = document.createElement('style');
    el.setAttribute('data-demo', 'isolated');
    document.head.appendChild(el);
    return el;
  });

  return (
    <StyleSheetManager target={target}>
      <DemoRules $css={activeCSS} />
      <DemoBox className={DEMO_CLASS}>
        The visual rules to the left change this box. The vendor-prefixed rules have no visual
        effect but still drift the counter when rejected.
      </DemoBox>
    </StyleSheetManager>
  );
}
