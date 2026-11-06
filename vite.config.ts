import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { analyzeScreenplayText } from './src/single_episode_analyzer.ts';

function analyzeApiPlugin(): Plugin {
  return {
    name: 'analyze-api-plugin',
    configureServer(server) {
      server.middlewares.use('/api/analyze', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer | string) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body);
            const { content, filename } = parsed || {};
            const apiKey = process.env.OPENAI_API_KEY;
            const result = await analyzeScreenplayText(content, filename || 'uploaded_episode.txt', { apiKey });
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = result.success ? 200 : 400;
            res.end(JSON.stringify(result));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: msg }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), analyzeApiPlugin()],
  server: {
    port: 3000,
    open: false,
  },
  build: {
    chunkSizeWarningLimit: 3500,
  },
});
