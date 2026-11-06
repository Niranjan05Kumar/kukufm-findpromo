import { analyzeScreenplayText } from '../src/single_episode_analyzer.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { content, filename } = req.body || {};
    if (!content) {
      return res.status(400).json({ success: false, error: 'Missing screenplay content.' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const result = await analyzeScreenplayText(content, filename || 'uploaded_episode.txt', { apiKey });
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
}
