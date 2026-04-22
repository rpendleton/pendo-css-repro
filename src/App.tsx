import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import localAgentLabels from 'virtual:pendo-agents';
import { GlobalSheetDemo, IsolatedSheetDemo, DEMO_CLASS } from './Demo';

declare global {
  interface Window {
    __nativeInsertRule?: typeof CSSStyleSheet.prototype.insertRule;
    __nativeDeleteRule?: typeof CSSStyleSheet.prototype.deleteRule;
  }
}

// Behaviorally test whether Pendo's suppressing wrapper is installed on
// CSSStyleSheet.prototype.insertRule. Can't use toString() or identity
// because Pendo wraps via `new Proxy(fn, { apply })` and Proxies forward
// toString() to the target — wrapped and native are indistinguishable
// structurally. Instead, poke at behavior: feed it deliberately invalid
// CSS and see whether it throws. Native throws SyntaxError; Pendo
// 2.321.0's wrapper suppresses; Pendo 2.320.2's wrapper propagates.
function insertRuleSuppresses(): boolean {
  const el = document.createElement('style');
  document.head.appendChild(el);
  let threw = false;
  try {
    el.sheet!.insertRule('@@@ not css', 0);
  } catch {
    threw = true;
  }
  el.remove();
  return !threw;
}

// Test whether a given CSS rule is rejected by the browser's own parser
// using the native insertRule reference captured in index.html before
// Pendo had a chance to wrap it. Independent of Pendo's wrap, so the
// result reflects what this browser would actually reject.
function isRuleRejectedByBrowser(rule: string): boolean {
  const nativeInsert = window.__nativeInsertRule ?? CSSStyleSheet.prototype.insertRule;
  const el = document.createElement('style');
  document.head.appendChild(el);
  try {
    nativeInsert.call(el.sheet!, rule, 0);
    return false;
  } catch {
    return true;
  } finally {
    el.remove();
  }
}

type RuleDef = {
  key: string;
  css: string;
  swatch?: string;
  invalid: boolean;
};

// Mix of ordinary visual rules and foreign-vendor pseudo-element rules.
// The visual rules work in every browser and produce a visible effect
// on the demo box. The vendor-prefixed rules come straight from what
// MUI v5 emits for cross-browser placeholder/focus-inner/ms-expand
// handling — Chrome rejects the foreign -moz-*/-ms-* variants at
// parse time; Firefox rejects fewer (it accepts most -webkit-* as
// web-compat aliases). Each rule's `invalid` flag is determined at
// runtime against the captured native insertRule.
const RULE_SPECS: Omit<RuleDef, 'invalid'>[] = [
  {
    key: 'bg-green',
    css: `.${DEMO_CLASS} { background: lightgreen }`,
    swatch: 'lightgreen',
  },
  {
    key: 'bg-blue',
    css: `.${DEMO_CLASS} { background: lightblue }`,
    swatch: 'lightblue',
  },
  {
    key: 'color-red',
    css: `.${DEMO_CLASS} { color: crimson }`,
    swatch: 'crimson',
  },
  {
    key: 'font-lg',
    css: `.${DEMO_CLASS} { font-size: 22px }`,
  },
  {
    key: 'italic',
    css: `.${DEMO_CLASS} { font-style: italic }`,
  },
  {
    key: 'moz-placeholder',
    css: `.${DEMO_CLASS}::-moz-placeholder { opacity: 0.5 }`,
  },
  {
    key: 'ms-placeholder',
    css: `.${DEMO_CLASS}::-ms-input-placeholder { opacity: 0.5 }`,
  },
  {
    key: 'moz-focus-inner',
    css: `.${DEMO_CLASS}::-moz-focus-inner { border-style: none }`,
  },
  {
    key: 'ms-expand',
    css: `.${DEMO_CLASS}::-ms-expand { display: none }`,
  },
];

const RULES: RuleDef[] = RULE_SPECS.map((spec) => ({
  ...spec,
  invalid: isRuleRejectedByBrowser(spec.css),
}));

const Page = styled.div`
  font-family: system-ui, sans-serif;
  padding: 24px;
  max-width: 1100px;
  line-height: 1.5;
  margin: 0 auto;
`;

const Intro = styled.p`
  font-size: 15px;
  color: #333;
  margin: 8px 0 20px;
`;

const SplitLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
  margin-top: 8px;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 16px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
`;

const PanelTitle = styled.h2`
  margin: 0 0 12px;
  font-size: 16px;
  display: flex;
  align-items: center;
`;

const Pre = styled.pre`
  background: #f4f4f4;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
`;

const Diff = styled.pre`
  background: #f4f4f4;
  padding: 12px 0;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.5;
  margin: 0;
`;

const DiffLine = styled.span<{ $type: 'add' | 'remove' | 'context' }>`
  display: block;
  padding: 0 12px;
  white-space: pre;
  ${(p) =>
    p.$type === 'add'
      ? 'background: #d7f5df; color: #063;'
      : p.$type === 'remove'
        ? 'background: #f8d7d7; color: #700;'
        : 'color: #444;'}
`;

function DiffBlock({ text }: { text: string }) {
  return (
    <Diff>
      {text.split('\n').map((line, i) => {
        const type = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'remove' : 'context';
        return (
          <DiffLine key={i} $type={type}>
            {line || '\u00a0'}
          </DiffLine>
        );
      })}
    </Diff>
  );
}

const Section = styled.section`
  margin-top: 24px;
`;

const Button = styled.button`
  padding: 8px 12px;
  margin: 0 8px 8px 0;
  cursor: pointer;
`;

const Pill = styled.span<{ $variant: 'neutral' | 'ok' | 'warn' | 'err' }>`
  display: inline-block;
  padding: 2px 8px;
  margin-left: 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  ${(p) =>
    p.$variant === 'ok'
      ? 'color:#063;background:#d7f5df;'
      : p.$variant === 'warn'
        ? 'color:#734c00;background:#fbe8bd;'
        : p.$variant === 'err'
          ? 'color:#700;background:#f8d7d7;'
          : 'color:#444;background:#e9e9e9;'}
`;

const ErrorFallbackBox = styled.div`
  padding: 16px;
  margin: 6px 0;
  border-radius: 4px;
  background: #fbe3e3;
  color: #7a1a1a;
  border: 1px solid #e6a8a8;
`;

const Swatch = styled.span<{ $color: string }>`
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: ${(p) => p.$color};
  border: 1px solid rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
`;

const RuleInspector = styled.div`
  background: #f7f7f7;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.65;
  overflow-x: auto;
`;

const InspectorFrame = styled.div`
  padding: 0 12px;
  color: #888;
  white-space: pre;
`;

const InspectorRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 12px 2px calc(12px + 8ch);
  cursor: pointer;
  user-select: none;
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const InspectorBlank = styled.div`
  height: 0.6em;
`;

const InspectorCheckbox = styled.input`
  margin: 0;
  flex-shrink: 0;
`;

const InspectorStatus = styled.span<{ $invalid: boolean }>`
  font-family: system-ui, sans-serif;
  font-weight: 700;
  font-size: 12px;
  min-width: 10px;
  text-align: center;
  color: ${(p) => (p.$invalid ? '#b33' : '#0a7e2e')};
  flex-shrink: 0;
`;

const InspectorRuleText = styled.span<{ $checked: boolean; $invalid: boolean }>`
  white-space: pre;
  color: ${(p) => (!p.$checked ? '#999' : p.$invalid ? '#a0374d' : '#124')};
  opacity: ${(p) => (p.$checked ? 1 : 0.7)};
`;

const ModeSection = styled.section`
  margin: 0 0 20px;
  h2 {
    margin: 0 0 8px;
  }
`;

const AgentPicker = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`;

const AgentOption = styled.a<{ $active: boolean }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  background: ${(p) => (p.$active ? '#124' : '#eee')};
  color: ${(p) => (p.$active ? '#fff' : '#222')};
  &:hover {
    background: ${(p) => (p.$active ? '#124' : '#ddd')};
  }
`;

const CdnDialog = styled.dialog`
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px 24px;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  &::backdrop {
    background: rgba(0, 0, 0, 0.3);
  }
`;

const CdnInput = styled.input`
  display: block;
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin: 12px 0;
  box-sizing: border-box;
`;

const SectionIntro = styled.p`
  margin: 0 0 10px;
  font-size: 13px;
  color: #555;
  line-height: 1.5;
  code {
    font-size: 12px;
  }
`;

const DriftStatus = styled.div<{ $state: 'armed' | 'ok' | 'neutral' }>`
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;
  margin-top: 8px;
  background: ${(p) => (p.$state === 'armed' ? '#fbe8bd' : p.$state === 'ok' ? '#d7f5df' : '#eee')};
  color: ${(p) => (p.$state === 'armed' ? '#734c00' : p.$state === 'ok' ? '#063' : '#555')};
  border: 1px solid
    ${(p) => (p.$state === 'armed' ? '#e0b243' : p.$state === 'ok' ? '#8ed4a1' : '#ccc')};
`;

type PendoState = {
  loaded: boolean;
  version: string | null;
  wrapperSuppresses: boolean;
};

function detectPendoState(): PendoState {
  const pendo = window.pendo;
  return {
    loaded: !!pendo,
    version: typeof pendo?.VERSION === 'string' ? pendo.VERSION : null,
    wrapperSuppresses: insertRuleSuppresses(),
  };
}

interface BoundaryProps {
  children: ReactNode;
  onError: () => void;
}

interface BoundaryState {
  error: Error | null;
}

class UnmountErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorFallbackBox>
          <strong>An unexpected error occurred. Please try again later.</strong>
          <div
            style={{
              marginTop: '8px',
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: '12px',
            }}
          >
            {this.state.error.name}: {this.state.error.message}
          </div>
        </ErrorFallbackBox>
      );
    }
    return this.props.children;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function cdnUrl(apiKey: string): string {
  return `https://cdn.pendo.io/agent/static/${apiKey}/pendo.js`;
}

function localAgentUrl(label: string): string {
  return new URL(`pendo-${label}.js`, document.baseURI).href;
}

export function App() {
  const [pendoState, setPendoState] = useState<PendoState>(() => detectPendoState());
  const [active, setActive] = useState<Set<string>>(() => new Set());

  const [globalMounted, setGlobalMounted] = useState(false);
  const [globalBoundaryKey, setGlobalBoundaryKey] = useState(0);
  const [globalErrored, setGlobalErrored] = useState(false);

  const [isolatedMounted, setIsolatedMounted] = useState(true);
  const [isolatedBoundaryKey, setIsolatedBoundaryKey] = useState(0);
  const [isolatedErrored, setIsolatedErrored] = useState(false);

  const cdnDialogRef = useRef<HTMLDialogElement>(null);
  const [cdnKey, setCdnKey] = useState('');

  // Auto-load agent from URL params on mount.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const key = params.get('key');
    const agent = params.get('agent');
    const src = key ? cdnUrl(key) : agent ? localAgentUrl(agent) : null;
    if (!src) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    loadScript(src)
      .then(() => {
        if (cancelled) return;
        window.pendo?.initialize({
          visitor: { id: 'sample-visitor' },
          account: { id: 'sample-account' },
        });
        const start = Date.now();
        interval = setInterval(() => {
          setPendoState(detectPendoState());
          if (Date.now() - start > 8000 && interval !== null) {
            clearInterval(interval);
            interval = null;
          }
        }, 250);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (interval !== null) clearInterval(interval);
    };
  }, []);

  const togglePill = (key: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetGlobal = () => {
    setActive(new Set());
    setGlobalMounted(false);
    setGlobalErrored(false);
    setGlobalBoundaryKey((k) => k + 1);
  };

  const resetIsolated = () => {
    setActive(new Set());
    setIsolatedMounted(true);
    setIsolatedErrored(false);
    setIsolatedBoundaryKey((k) => k + 1);
  };

  const openCdnDialog = useCallback(() => {
    cdnDialogRef.current?.showModal();
  }, []);

  const handleCdnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = cdnKey.trim();
    if (!key) return;
    location.search = `?key=${encodeURIComponent(key)}`;
  };

  const params = new URLSearchParams(location.search);
  const currentKey = params.get('key');
  const currentAgent = params.get('agent');
  const isNoPendo = currentKey == null && currentAgent == null;

  let pendoPill: { variant: 'neutral' | 'ok' | 'warn' | 'err'; text: string };
  if (!pendoState.loaded) {
    pendoPill = { variant: 'neutral', text: 'Pendo not loaded' };
  } else if (pendoState.wrapperSuppresses) {
    pendoPill = {
      variant: 'err',
      text: `Pendo ${pendoState.version ?? '(unknown version)'} — wrapper is suppressing`,
    };
  } else if (pendoState.version) {
    pendoPill = {
      variant: 'ok',
      text: `Pendo ${pendoState.version} — wrapper is not suppressing`,
    };
  } else {
    pendoPill = {
      variant: 'warn',
      text: 'Pendo agent loaded, waiting for session replay to initialize\u2026',
    };
  }

  const activeCSS = RULES.filter((r) => active.has(r.key))
    .map((r) => r.css)
    .join('\n');
  const activeInvalidCount = RULES.filter((r) => active.has(r.key) && r.invalid).length;
  const drifting = activeInvalidCount > 0 && pendoState.wrapperSuppresses;

  return (
    <Page>
      <h1>
        Pendo Web SDK <code>insertRule</code> regression
      </h1>

      <Intro>
        Pendo&rsquo;s Web SDK wraps <code>CSSStyleSheet.prototype.insertRule</code> with a Proxy as
        part of its <strong>session replay</strong> feature. Certain versions (e.g.&nbsp;2.321.0)
        introduce a regression that suppresses the browser&rsquo;s native <code>SyntaxError</code>{' '}
        on invalid rules instead of letting them propagate. The wrapper only installs when session
        recording is enabled — without it, the bug does not manifest.
      </Intro>
      <Intro>
        An example of an affected library is{' '}
        <a
          href="https://github.com/styled-components/styled-components"
          target="_blank"
          rel="noreferrer"
        >
          styled-components
        </a>{' '}
        v6, which relies on thrown errors to keep its internal sheet-length counter in sync with the
        real sheet. Without the throw, the counter drifts, and later cleanup either throws{' '}
        <code>IndexSizeError</code> which propagates to the nearest error boundary, or deletes
        unrelated components&rsquo; rules (<strong>silent corruption</strong>).
      </Intro>

      <ModeSection>
        <h2>Reproduce the bug</h2>
        <Intro style={{ marginBottom: '10px' }}>
          First, choose which Pendo agent to load. The bug only reproduces with an agent version
          whose wrapper suppresses native throws, and only when session replay is enabled on the
          subscription. Watch the status pill below — a red &ldquo;wrapper is suppressing&rdquo;
          confirms the bug will reproduce; green means it won&rsquo;t.
        </Intro>
        <AgentPicker>
          <AgentOption href="." $active={isNoPendo}>
            No Pendo
          </AgentOption>
          {localAgentLabels.map((label) => (
            <AgentOption
              key={label}
              href={`?agent=${encodeURIComponent(label)}`}
              $active={currentAgent === label}
            >
              {label}
            </AgentOption>
          ))}
          <AgentOption
            as="button"
            href={undefined}
            $active={currentKey != null}
            onClick={openCdnDialog}
            style={{ border: 'none', cursor: 'pointer' }}
          >
            Load from CDN
          </AgentOption>
          <Pill $variant={pendoPill.variant}>{pendoPill.text}</Pill>
        </AgentPicker>

        <CdnDialog
          ref={cdnDialogRef}
          onClick={(e) => {
            if (e.target === e.currentTarget) cdnDialogRef.current?.close();
          }}
        >
          <form onSubmit={handleCdnSubmit}>
            <strong>Load Pendo agent from CDN</strong>
            <CdnInput
              type="text"
              placeholder="Pendo API key"
              value={cdnKey}
              onChange={(e) => setCdnKey(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button type="button" onClick={() => cdnDialogRef.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" disabled={!cdnKey.trim()}>
                Load
              </Button>
            </div>
          </form>
        </CdnDialog>

        <Intro style={{ marginTop: '20px' }}>
          Next, toggle the following CSS rules on and off repeatedly. When errors are suppressed,
          unrelated styles are deleted from the page or <code>IndexSizeError</code> propagates to
          the nearest error boundary. An easy way to trigger both cases: mount both components, then
          check all the boxes top to bottom and uncheck them top to bottom — you may have to toggle
          an invalid rule on and off a few times to see the full extent of the issue.
        </Intro>
        <SplitLayout>
          <Panel>
            <PanelTitle>CSS rules (toggle to include)</PanelTitle>
            <RuleInspector>
              <InspectorFrame>
                {'const DemoRules = createGlobalStyle<{ $css: string }>`'}
              </InspectorFrame>
              <InspectorFrame>{'  ${(p) => p.$css}'}</InspectorFrame>
              <InspectorFrame>{'`'}</InspectorFrame>
              <InspectorBlank />
              <InspectorFrame>{'function DemoComponent() {'}</InspectorFrame>
              <InspectorFrame>{'  return ('}</InspectorFrame>
              <InspectorFrame>{'    <>'}</InspectorFrame>
              <InspectorFrame>{'      <DemoRules $css={`'}</InspectorFrame>
              {RULES.map((rule) => {
                const checked = active.has(rule.key);
                return (
                  <InspectorRow
                    key={rule.key}
                    title={
                      rule.invalid
                        ? 'rejected by this browser — drifts styled-components counter under 2.321.0'
                        : 'accepted by this browser'
                    }
                  >
                    <InspectorCheckbox
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePill(rule.key)}
                    />
                    <InspectorStatus $invalid={rule.invalid}>
                      {rule.invalid ? '✗' : '✓'}
                    </InspectorStatus>
                    {rule.swatch && <Swatch $color={rule.swatch} />}
                    <InspectorRuleText $checked={checked} $invalid={rule.invalid}>
                      {rule.css}
                    </InspectorRuleText>
                  </InspectorRow>
                );
              })}
              <InspectorFrame>{'      `} />'}</InspectorFrame>
              <InspectorFrame>{'      <DemoBox>...</DemoBox>'}</InspectorFrame>
              <InspectorFrame>{'    </>'}</InspectorFrame>
              <InspectorFrame>{'  )'}</InspectorFrame>
              <InspectorFrame>{'}'}</InspectorFrame>
            </RuleInspector>

            <SectionIntro style={{ margin: '12px 0 0' }}>
              The above is a simplification of what&rsquo;s being rendered to the right. Toggling
              the checkboxes changes which styles are passed to <code>createGlobalStyle</code>,
              which causes styled-components to clean up previous rules and re-insert the new set.
            </SectionIntro>
            <SectionIntro style={{ margin: '8px 0 0' }}>
              Rules marked{' '}
              <InspectorStatus $invalid={true} style={{ display: 'inline' }}>
                ✗
              </InspectorStatus>{' '}
              are rejected by this browser&rsquo;s native CSS parser — normally styled-components
              catches the <code>SyntaxError</code> and keeps its internal index in sync. When
              Pendo&rsquo;s wrapper suppresses the throw, the index drifts, and the next cleanup
              deletes rules at the wrong positions.
            </SectionIntro>
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Panel>
              <PanelTitle>
                Demo 1: IndexSizeError
                <Pill $variant={isolatedMounted ? (isolatedErrored ? 'err' : 'ok') : 'neutral'}>
                  {isolatedErrored ? 'error' : isolatedMounted ? 'mounted' : 'unmounted'}
                </Pill>
              </PanelTitle>
              <SectionIntro style={{ margin: '0 0 8px' }}>
                This demo uses an isolated sheet via <code>StyleSheetManager</code>. Small rule
                count means drift immediately overshoots, which leads to an{' '}
                <code>IndexSizeError</code> being propagated to the nearest error boundary.
              </SectionIntro>

              <UnmountErrorBoundary
                key={isolatedBoundaryKey}
                onError={() => setIsolatedErrored(true)}
              >
                {isolatedMounted && <IsolatedSheetDemo activeCSS={activeCSS} />}
              </UnmountErrorBoundary>

              <div style={{ marginTop: '8px' }}>
                <Button onClick={() => setIsolatedMounted((m) => !m)}>
                  {isolatedMounted ? 'Unmount' : 'Mount'}
                </Button>
                {isolatedErrored && <Button onClick={resetIsolated}>Reset</Button>}
              </div>
              <DriftStatus
                $state={
                  !isolatedMounted && !isolatedErrored
                    ? 'neutral'
                    : isolatedErrored
                      ? 'neutral'
                      : drifting
                        ? 'armed'
                        : 'ok'
                }
              >
                {!isolatedMounted && !isolatedErrored ? (
                  <>Mount the component to reproduce the issue.</>
                ) : isolatedErrored ? (
                  <>
                    <code>IndexSizeError</code> caught by error boundary. The drifted{' '}
                    <code>deleteRule</code> overshot the isolated sheet. Reset to try again.
                  </>
                ) : drifting ? (
                  <>
                    <strong>Counter drifted by +{activeInvalidCount}.</strong> Next re-render will
                    run <code>deleteRule</code> at wrong indices — this may silently delete other
                    components&rsquo; rules or throw <code>IndexSizeError</code>.
                  </>
                ) : (
                  <strong>No drift.</strong>
                )}
              </DriftStatus>
            </Panel>

            <Panel>
              <PanelTitle>
                Demo 2: Silent corruption
                <Pill $variant={globalMounted ? (globalErrored ? 'err' : 'ok') : 'neutral'}>
                  {globalErrored ? 'error' : globalMounted ? 'mounted' : 'unmounted'}
                </Pill>
              </PanelTitle>
              <SectionIntro style={{ margin: '0 0 8px' }}>
                Shares the page-wide styled-components sheet. Drifted deletes hit other
                components&rsquo; rules — watch the surrounding UI lose its styling until an
                out-of-bounds error is thrown.
              </SectionIntro>
              <SectionIntro style={{ margin: '0 0 8px' }}>
                Not mounted by default because it can disrupt this page&rsquo;s own UI — which is
                exactly the concern in a real application, where a shared styled-components sheet
                means the drift can silently corrupt styles anywhere on the page.
              </SectionIntro>

              <UnmountErrorBoundary key={globalBoundaryKey} onError={() => setGlobalErrored(true)}>
                {globalMounted && <GlobalSheetDemo activeCSS={activeCSS} />}
              </UnmountErrorBoundary>

              <div style={{ marginTop: '8px' }}>
                <Button onClick={() => setGlobalMounted((m) => !m)}>
                  {globalMounted ? 'Unmount' : 'Mount'}
                </Button>
                {globalErrored && <Button onClick={resetGlobal}>Reset</Button>}
              </div>
              <DriftStatus
                $state={
                  !globalMounted && !globalErrored
                    ? 'neutral'
                    : globalErrored
                      ? 'neutral'
                      : drifting
                        ? 'armed'
                        : 'ok'
                }
              >
                {!globalMounted && !globalErrored ? (
                  <>Mount the component to reproduce the issue.</>
                ) : globalErrored ? (
                  <>
                    Caught error. The drifted <code>deleteRule</code> deleted rules belonging to
                    other styled-components on the page. Reset to try again.
                  </>
                ) : drifting ? (
                  <>
                    <strong>Counter drifted by +{activeInvalidCount}.</strong> Next re-render will
                    run <code>deleteRule</code> at wrong indices — this may silently delete other
                    components&rsquo; rules or throw <code>IndexSizeError</code>.
                  </>
                ) : (
                  <strong>No drift.</strong>
                )}
              </DriftStatus>
            </Panel>
          </div>
        </SplitLayout>
      </ModeSection>

      <Section>
        <h2>Technical details</h2>

        <h3>What changed?</h3>
        <p>
          Version 2.320.2 of the Pendo Web SDK let native <code>insertRule</code> throws propagate;
          2.321.0 adds a <code>try/catch</code> inside the Proxy&rsquo;s apply trap with an empty
          catch block, silently suppressing every throw. Same wrapper shape, one behavioral change.
        </p>
        <DiffBlock
          text={`  win.CSSStyleSheet.prototype.insertRule = new Proxy(insertRule, {
    apply: callbackWrapper((target, thisArg, argumentsList) => {
      // ... record-to-mirror elided ...
-     return target.apply(thisArg, argumentsList);
+     try {
+       return target.apply(thisArg, argumentsList);
+     } catch (e2) {}
    }),
  });`}
        />

        <h3>Why this impacts styled-components</h3>
        <p>
          styled-components v6's <code>CSSOMTag.insertRule</code> is built to tolerate rejected
          rules: its try/catch is what decides whether to advance the internal <code>length</code>{' '}
          counter, so the counter stays in sync with the real sheet's actual rule count even when
          some inserts are rejected.
        </p>
        <Pre>
          {'// '}
          <a
            href="https://github.com/styled-components/styled-components/blob/styled-components@6.4.1/packages/styled-components/src/sheet/Tag.ts#L35-L43"
            target="_blank"
            rel="noreferrer"
          >
            packages/styled-components/src/sheet/Tag.ts:35-43
          </a>
          {`
insertRule(index, rule) {
  try {
    this.sheet.insertRule(rule, index)
    this.length++     // ← advances only on confirmed no-throw
    return true
  } catch {
    return false
  }
}

deleteRule(index) {
  this.sheet.deleteRule(index)
  this.length--
}`}
        </Pre>
        <p>
          When Pendo's wrapper suppresses the throw before styled-components sees it, the{' '}
          <code>this.length++</code> runs anyway. The counter drifts +1 per rejected insert. On the
          next pill toggle, remount, or unmount, styled-components's <code>clearRules</code> →{' '}
          <code>deleteRule</code> loop walks past the end of the real sheet and throws{' '}
          <code>IndexSizeError</code>, which propagates out of React's commit phase and is caught by
          the nearest error boundary.
        </p>

        <h3>Why you&rsquo;d want to use invalid rules to begin with</h3>
        <p>
          Inserting a rule that the browser rejects isn&rsquo;t an accident or a bug — it&rsquo;s a
          common, deliberate pattern for cross-browser styling. MUI v5's <code>InputBase</code>,{' '}
          <code>ButtonBase</code>, and <code>NativeSelect</code> (via{' '}
          <code>@mui/styled-engine-sc</code>) emit all four placeholder variants —{' '}
          <code>::-webkit-input-placeholder</code>, <code>::-moz-placeholder</code>,{' '}
          <code>:-ms-input-placeholder</code>, <code>::-ms-input-placeholder</code> — in every form
          component, so the styles apply correctly in Chrome, Firefox, IE, and Edge Legacy (a
          pattern that predates those browsers being EOL, but still ships today in MUI v5 for
          compatibility). Each browser accepts its own prefix and rejects the foreign ones, so a
          full-featured form mount racks up double-digit rejections in any given browser.
          styled-components's try/catch is built for exactly this. It only becomes visible — and
          catastrophic — when something upstream violates the contract and suppresses the throws.
        </p>
      </Section>
    </Page>
  );
}
