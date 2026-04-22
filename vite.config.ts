import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

function pendoAgentDiscovery(): Plugin {
  const virtualId = 'virtual:pendo-agents';
  const resolvedId = '\0' + virtualId;
  return {
    name: 'pendo-agent-discovery',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        const publicDir = path.resolve(__dirname, 'public');
        let labels: string[] = [];
        if (fs.existsSync(publicDir)) {
          labels = fs
            .readdirSync(publicDir)
            .filter((f) => /^pendo-.+\.js$/.test(f))
            .map((f) => f.replace(/^pendo-/, '').replace(/\.js$/, ''))
            .sort();
        }
        return `export default ${JSON.stringify(labels)};`;
      }
    },
  };
}

function excludeGitkeep(): Plugin {
  return {
    name: 'exclude-gitkeep',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dirname, 'dist');
      const gitkeep = path.join(outDir, '.gitkeep');
      if (fs.existsSync(gitkeep)) fs.unlinkSync(gitkeep);
    },
  };
}

export default defineConfig({
  plugins: [pendoAgentDiscovery(), react(), viteSingleFile(), excludeGitkeep()],
});
