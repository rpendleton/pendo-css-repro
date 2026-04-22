declare module 'virtual:pendo-agents' {
  const labels: string[];
  export default labels;
}

interface PendoAgent {
  VERSION?: string;
  initialize: (options?: Record<string, unknown>) => unknown;
  identify?: (options: Record<string, unknown>) => unknown;
  updateOptions?: (options: Record<string, unknown>) => unknown;
  track?: (event: string, props?: Record<string, unknown>) => unknown;
  enableDebugging?: () => unknown;
  validateInstall?: () => unknown;
  recording?: unknown;
  [key: string]: unknown;
}

interface Window {
  pendo?: PendoAgent;
}
