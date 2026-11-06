/**
 * KukuFM Microdrama Promo Candidate Evaluator (Phase 3).
 *
 * Evaluates candidate promo clips from data/promo_candidates.json against
 * the three core assignment criteria:
 *   1. HOOK (first ~3 seconds)
 *   2. CLIFFHANGER (ending beat)
 *   3. STANDALONE CONTEXT (clarity for new viewers)
 *
 * Uses OpenAI API (gpt-4o-mini) for semantic evaluation, validated by
 * strict integer scores (0-5) and grounded explanations.
 * Saves results to data/evaluated_promo_candidates.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type {
  PromoCandidatesDataset,
  PromoCandidate,
  CandidateEvaluation,
  EvaluatedPromoCandidate,
  EvaluatedEpisodeCandidates,
  EvaluatedPromoCandidatesDataset
} from './types.ts';
import { validateEvaluations, formatEvaluationValidationReport } from './validate_evaluations.ts';

// Resolve project directories relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(PROJECT_ROOT, 'data', 'promo_candidates.json');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'data', 'evaluated_promo_candidates.json');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

// Load .env file natively if present
if (fs.existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // Ignore error if loadEnvFile fails
  }
}

export interface EvaluatorRunOptions {
  model?: string;
  sampleSize?: number;             // If set, evaluate only N candidates (for testing)
  concurrency?: number;            // Number of concurrent API requests (default: 3)
  useMock?: boolean;               // If true or if OPENAI_API_KEY is not set, use deterministic mock
  delayMs?: number;                // Delay between batches to respect rate limits (default: 100ms)
}

/**
 * Builds the OpenAI evaluation prompt for a candidate.
 */
export function buildEvaluationPrompt(candidate: PromoCandidate): { system: string; user: string } {
  const system = `You are evaluating short promotional clips from a microdrama screenplay. Evaluate only the supplied candidate content. Do not invent events, dialogue, characters, motivations, endings, or plot details.

Evaluate the clip against exactly three criteria, each scored on a 0 to 5 integer scale:

1. HOOK (Focus strictly on the opening ~3 seconds of the clip):
   Does the beginning immediately grab attention, present an immediate conflict, shocking situation, intriguing question, or strong emotional moment?
   - 0: No meaningful hook (mundane transition, silent pause)
   - 1: Very weak (slow setup, generic remark)
   - 2: Weak (mild curiosity, low stakes)
   - 3: Moderate (clear situation or engaging statement)
   - 4: Strong (high conflict, sharp accusation, or dramatic entry)
   - 5: Very strong (jaw-dropping reveal, visceral betrayal, intense shock)

2. CLIFFHANGER (Focus strictly on how the clip ends):
   Does the ending leave an unresolved conflict, unanswered question, sudden reveal, threat, decision, or compelling reason to continue watching?
   - 0: No cliffhanger (scene resolves cleanly or cuts arbitrarily)
   - 1: Very weak (minimal forward momentum)
   - 2: Weak (minor lingering tension)
   - 3: Moderate (unresolved dialogue exchange or notable question)
   - 4: Strong (urgent threat, high-stakes refusal, dramatic ultimatum)
   - 5: Very strong (major plot twist, peak confrontation cut to black, climactic sound swell)

3. STANDALONE CONTEXT (Focus on whether a new viewer can follow):
   Can someone watching this clip with zero prior series knowledge understand who is involved, what is happening, and why this moment matters?
   - 0: Impossible to understand (disorienting fragments without meaning)
   - 1: Very unclear (requires deep prior lore)
   - 2: Limited context (basic relationships or conflict vague)
   - 3: Understandable (core dynamic and present conflict are evident)
   - 4: Good context (clear who is opposing whom and why stakes matter)
   - 5: Very clear standalone context (instantly graspable self-contained dramatic arc)

You must respond ONLY with a valid JSON object matching this schema:
{
  "hookScore": <integer 0 to 5>,
  "hookExplanation": "<concise explanation referencing actual opening content>",
  "cliffhangerScore": <integer 0 to 5>,
  "cliffhangerExplanation": "<concise explanation referencing actual ending content>",
  "contextScore": <integer 0 to 5>,
  "contextExplanation": "<concise explanation assessing standalone viewer clarity>"
}`;

  const elementsText = candidate.content.map(el => {
    let line = `[${el.startTime} - ${el.endTime}] ${el.type.toUpperCase()}`;
    if (el.type === 'dialogue') {
      const charPart = el.character || 'UNKNOWN';
      const delPart = el.delivery ? ` (${el.delivery})` : '';
      const osPart = el.isOffScreen ? ' [O.S.]' : '';
      line += ` ${charPart}${delPart}${osPart}: "${el.text}"`;
    } else {
      line += `: ${el.text}`;
    }
    return line;
  }).join('\n');

  const user = `Candidate ID: ${candidate.candidateId}
Episode: ${candidate.episodeNumber}
Time window: ${candidate.startTime} to ${candidate.endTime} (Duration: ${candidate.durationSeconds}s)
Scenes spanned: Scene ${candidate.sceneNumbers.join(', ')}

Screenplay Content (${candidate.content.length} elements):
${elementsText}

Evaluate this clip now. Output strictly JSON.`;

  return { system, user };
}

/**
 * Validates the raw JSON parsed from an LLM response.
 */
export function validateEvaluationPayload(data: unknown): CandidateEvaluation {
  if (!data || typeof data !== 'object') {
    throw new Error('LLM response is not a valid JSON object');
  }

  const obj = data as Record<string, unknown>;

  const hookScore = Number(obj.hookScore);
  const cliffhangerScore = Number(obj.cliffhangerScore);
  const contextScore = Number(obj.contextScore);

  if (!Number.isInteger(hookScore) || hookScore < 0 || hookScore > 5) {
    throw new Error(`Invalid hookScore: ${obj.hookScore}. Must be an integer between 0 and 5.`);
  }

  if (!Number.isInteger(cliffhangerScore) || cliffhangerScore < 0 || cliffhangerScore > 5) {
    throw new Error(`Invalid cliffhangerScore: ${obj.cliffhangerScore}. Must be an integer between 0 and 5.`);
  }

  if (!Number.isInteger(contextScore) || contextScore < 0 || contextScore > 5) {
    throw new Error(`Invalid contextScore: ${obj.contextScore}. Must be an integer between 0 and 5.`);
  }

  const hookExplanation = typeof obj.hookExplanation === 'string' ? obj.hookExplanation.trim() : '';
  const cliffhangerExplanation = typeof obj.cliffhangerExplanation === 'string' ? obj.cliffhangerExplanation.trim() : '';
  const contextExplanation = typeof obj.contextExplanation === 'string' ? obj.contextExplanation.trim() : '';

  if (!hookExplanation) throw new Error('Missing or empty hookExplanation.');
  if (!cliffhangerExplanation) throw new Error('Missing or empty cliffhangerExplanation.');
  if (!contextExplanation) throw new Error('Missing or empty contextExplanation.');

  return {
    hookScore,
    hookExplanation,
    cliffhangerScore,
    cliffhangerExplanation,
    contextScore,
    contextExplanation
  };
}

/**
 * Deterministic mock evaluator used when OPENAI_API_KEY is not configured
 * or for offline testing/verification. Grounded strictly in candidate elements.
 */
export function evaluateCandidateMock(candidate: PromoCandidate): CandidateEvaluation {
  const openingBeats = candidate.content.filter(
    el => el.startSeconds <= candidate.startSeconds + 3.8
  );
  const endingBeats = candidate.content.filter(
    el => el.endSeconds >= candidate.endSeconds - 3.8
  );
  const dialogues = candidate.content.filter(el => el.type === 'dialogue');
  const sounds = candidate.content.filter(el => el.type === 'sound_fx');
  const characters = Array.from(new Set(dialogues.map(d => d.character).filter(Boolean)));

  // 1. Hook evaluation (opening ~3s)
  let hookScore = 2;
  let hookExplanation = 'The opening introduces the scene with moderate visual or narrative setup.';

  const openingDialogue = openingBeats.find(el => el.type === 'dialogue');
  const openingAction = openingBeats.find(el => el.type === 'action');

  if (openingDialogue) {
    const text = openingDialogue.text.toLowerCase();
    const delivery = (openingDialogue.delivery || '').toLowerCase();
    const dramaticWords = ['turn around', 'why', 'gerald', 'stop', 'fire', 'alexander', 'betray', 'marry', 'kill', 'never', 'no'];
    const hasDrama = dramaticWords.some(w => text.includes(w)) || delivery.includes('cold') || delivery.includes('shaken') || delivery.includes('alarmed');

    if (hasDrama) {
      hookScore = 4;
      hookExplanation = `Opens immediately with ${openingDialogue.character}'s striking line ("${openingDialogue.text}"), establishing high tension within the first 3 seconds.`;
    } else {
      hookScore = 3;
      hookExplanation = `Opens with dialogue from ${openingDialogue.character} ("${openingDialogue.text}"), introducing an active conversation.`;
    }
  } else if (openingAction) {
    hookScore = 3;
    hookExplanation = `Opens on a character action beat: ${openingAction.text.slice(0, 75)}...`;
  } else if (openingBeats.some(el => el.type === 'camera')) {
    hookScore = 2;
    hookExplanation = 'Opens on atmospheric camera framing before dialogue begins.';
  }

  // 2. Cliffhanger evaluation (ending beat)
  let cliffhangerScore = 2;
  let cliffhangerExplanation = 'The candidate ends on an ordinary scene transition with mild forward momentum.';

  const endingSound = endingBeats.find(el => el.type === 'sound_fx');
  const endingDialogue = endingBeats.find(el => el.type === 'dialogue');
  const endingCamera = endingBeats.find(el => el.type === 'camera');

  if (endingSound && endingSound.text.toLowerCase().includes('cliffhanger')) {
    cliffhangerScore = 5;
    cliffhangerExplanation = `Concludes with a climactic audio cue: "${endingSound.text}", creating maximum urgency to continue watching.`;
  } else if (endingDialogue) {
    const text = endingDialogue.text.trim();
    if (text.endsWith('?') || text.endsWith('...') || text.includes('never') || text.includes('cannot') || text.includes('die')) {
      cliffhangerScore = 4;
      cliffhangerExplanation = `Ends abruptly on ${endingDialogue.character}'s unresolved statement: "${endingDialogue.text}", leaving an immediate unanswered question.`;
    } else {
      cliffhangerScore = 3;
      cliffhangerExplanation = `Ends on dialogue by ${endingDialogue.character} without complete narrative resolution.`;
    }
  } else if (endingCamera && endingCamera.text.toLowerCase().includes('cut to black')) {
    cliffhangerScore = 4;
    cliffhangerExplanation = 'Ends sharply with a dramatic cut to black following the preceding confrontation.';
  }

  // 3. Standalone Context evaluation
  let contextScore = 3;
  let contextExplanation = 'The core interpersonal dynamic is understandable from the dialogue exchanges.';

  if (characters.length >= 2 && dialogues.length >= 4) {
    contextScore = 4;
    contextExplanation = `Features clear two-party dialogue between ${characters.slice(0, 2).join(' and ')}, allowing a new viewer to readily understand the conflict and stakes.`;
  } else if (dialogues.length <= 1) {
    contextScore = 2;
    contextExplanation = 'Contains sparse dialogue, making the underlying backstory and stakes somewhat limited for a first-time viewer.';
  }

  return {
    hookScore,
    hookExplanation,
    cliffhangerScore,
    cliffhangerExplanation,
    contextScore,
    contextExplanation
  };
}

/**
 * Evaluates a single candidate using OpenAI or mock.
 */
export async function evaluateCandidate(
  candidate: PromoCandidate,
  client: OpenAI | null,
  model: string
): Promise<CandidateEvaluation> {
  if (!client) {
    return evaluateCandidateMock(candidate);
  }

  const { system, user } = buildEvaluationPrompt(candidate);

  // Call OpenAI Chat Completions API with JSON mode
  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Received empty completion content from OpenAI API.');
  }

  const parsedJson = JSON.parse(content);
  return validateEvaluationPayload(parsedJson);
}

/**
 * Main evaluation pipeline:
 * Ingests promo_candidates.json, runs evaluations, validates, and outputs evaluated_promo_candidates.json.
 */
export async function runEvaluator(options: EvaluatorRunOptions = {}): Promise<{
  success: boolean;
  outputFilePath: string;
  totalEvaluated: number;
}> {
  const {
    model = 'gpt-4o-mini',
    sampleSize,
    concurrency = 3,
    useMock = false,
    delayMs = 50
  } = options;

  console.log(`\nLoading promo candidates from: ${INPUT_FILE}...`);
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Candidates file not found at ${INPUT_FILE}. Please run 'npm run candidates' first.`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(INPUT_FILE, 'utf-8');
  const sourceDataset: PromoCandidatesDataset = JSON.parse(rawJson);

  const apiKey = process.env.OPENAI_API_KEY;
  const isMock = useMock || !apiKey;

  let client: OpenAI | null = null;
  if (isMock) {
    if (!apiKey) {
      console.log('Notice: OPENAI_API_KEY is not set. Running in deterministic mock mode for offline testing/validation.');
    } else {
      console.log('Notice: Running in explicit mock mode (--mock flag).');
    }
  } else {
    console.log(`OpenAI API Key detected. Using live OpenAI SDK model: ${model}`);
    client = new OpenAI({ apiKey });
  }

  // Determine candidate list to evaluate
  const allCandidates: PromoCandidate[] = [];
  sourceDataset.episodes.forEach(ep => {
    ep.candidates.forEach(c => allCandidates.push(c));
  });

  const targetCandidates = sampleSize && sampleSize > 0
    ? allCandidates.slice(0, sampleSize)
    : allCandidates;

  console.log(`Evaluating ${targetCandidates.length} candidate(s) (concurrency=${concurrency})...`);

  const evaluationMap = new Map<string, {
    status: 'success' | 'failed';
    evaluation?: CandidateEvaluation;
    errorMessage?: string;
  }>();

  // Process in controlled batches
  for (let i = 0; i < targetCandidates.length; i += concurrency) {
    const batch = targetCandidates.slice(i, i + concurrency);

    await Promise.all(batch.map(async cand => {
      try {
        const ev = await evaluateCandidate(cand, client, model);
        evaluationMap.set(cand.candidateId, {
          status: 'success',
          evaluation: ev
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Evaluation failed for ${cand.candidateId}: ${msg}`);
        evaluationMap.set(cand.candidateId, {
          status: 'failed',
          errorMessage: msg
        });
      }
    }));

    if (delayMs > 0 && i + concurrency < targetCandidates.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }

    if ((i + batch.length) % 50 === 0 || i + batch.length === targetCandidates.length) {
      console.log(`Processed ${i + batch.length} / ${targetCandidates.length} candidates...`);
    }
  }

  // Construct EvaluatedPromoCandidatesDataset
  const evaluatedEpisodes: EvaluatedEpisodeCandidates[] = sourceDataset.episodes.map(ep => {
    const evaluatedCands: EvaluatedPromoCandidate[] = ep.candidates.map(cand => {
      const res = evaluationMap.get(cand.candidateId);
      if (res && res.status === 'success' && res.evaluation) {
        return {
          ...cand,
          evaluationStatus: 'success',
          evaluation: res.evaluation,
          evaluatedAt: new Date().toISOString()
        };
      }
      return {
        ...cand,
        evaluationStatus: 'failed',
        errorMessage: res?.errorMessage || 'Not evaluated',
        evaluatedAt: new Date().toISOString()
      };
    });

    return {
      episodeNumber: ep.episodeNumber,
      episodeId: ep.episodeId,
      sourceFile: ep.sourceFile,
      candidateCount: evaluatedCands.length,
      candidates: evaluatedCands
    };
  });

  // Calculate summary metrics
  let totalCandidatesCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let hookSum = 0;
  let cliffSum = 0;
  let contextSum = 0;

  evaluatedEpisodes.forEach(ep => {
    totalCandidatesCount += ep.candidates.length;
    ep.candidates.forEach(c => {
      if (c.evaluationStatus === 'success' && c.evaluation) {
        successCount++;
        hookSum += c.evaluation.hookScore;
        cliffSum += c.evaluation.cliffhangerScore;
        contextSum += c.evaluation.contextScore;
      } else {
        failedCount++;
      }
    });
  });

  const summary = {
    totalEpisodes: evaluatedEpisodes.length,
    totalCandidates: totalCandidatesCount,
    successfullyEvaluated: successCount,
    failedEvaluations: failedCount,
    averageHookScore: successCount > 0 ? Number((hookSum / successCount).toFixed(2)) : 0,
    averageCliffhangerScore: successCount > 0 ? Number((cliffSum / successCount).toFixed(2)) : 0,
    averageContextScore: successCount > 0 ? Number((contextSum / successCount).toFixed(2)) : 0
  };

  const outputDataset: EvaluatedPromoCandidatesDataset = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    model: isMock ? 'deterministic-grounded-mock' : model,
    totalEpisodes: evaluatedEpisodes.length,
    totalCandidates: totalCandidatesCount,
    summary,
    episodes: evaluatedEpisodes
  };

  // Validate the evaluated dataset
  const valResult = validateEvaluations({
    evaluatedDataset: outputDataset,
    sourceCandidateDataset: sourceDataset
  });

  // Save data/evaluated_promo_candidates.json
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputDataset, null, 2), 'utf-8');
  console.log(`Structured evaluated candidates written to: ${OUTPUT_FILE}`);

  // Print validation report
  console.log('\n' + formatEvaluationValidationReport(valResult) + '\n');

  return {
    success: valResult.isValid,
    outputFilePath: OUTPUT_FILE,
    totalEvaluated: targetCandidates.length
  };
}

// Parse CLI arguments when run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const options: EvaluatorRunOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mock' || args[i] === '--dry-run') {
      options.useMock = true;
    } else if (args[i] === '--sample' && args[i + 1]) {
      options.sampleSize = parseInt(args[++i], 10);
    } else if (args[i] === '--model' && args[i + 1]) {
      options.model = args[++i];
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      options.concurrency = parseInt(args[++i], 10);
    }
  }

  runEvaluator(options)
    .then(res => {
      if (!res.success) process.exit(1);
    })
    .catch(err => {
      console.error('Fatal evaluation error:', err);
      process.exit(1);
    });
}

