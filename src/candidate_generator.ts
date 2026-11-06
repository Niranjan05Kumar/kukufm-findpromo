/**
 * KukuFM Microdrama Promo Candidate Generator (Phase 2).
 *
 * Implements a simple, deterministic sliding-window algorithm that generates
 * 20–60 second promo candidate windows across the 50 screenplay episodes.
 *
 * Ingests Phase 1 structured data (data/parsed_episodes.json) as ground truth,
 * identifies element-aligned boundaries, associates overlapping screenplay beats,
 * validates dataset integrity, and saves data/promo_candidates.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DatasetOutput,
  Episode,
  PromoCandidate,
  EpisodeCandidates,
  PromoCandidatesDataset,
  CandidateContentItem
} from './types.ts';
import { validateCandidates, formatCandidateValidationReport } from './validate_candidates.ts';

// Resolve directory paths relative to this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(PROJECT_ROOT, 'data', 'parsed_episodes.json');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'data', 'promo_candidates.json');

export interface CandidateGenerationOptions {
  minDurationSeconds?: number;     // Minimum candidate duration (default: 20.0s)
  maxDurationSeconds?: number;     // Maximum candidate duration (default: 60.0s)
  minStartStepSeconds?: number;    // Min spacing between consecutive start points (default: 12.0s)
  minDurationGapSeconds?: number;  // Min duration difference between short & long window (default: 15.0s)
}

/**
 * Generates promo candidates for a single episode using a deterministic sliding-window.
 */
export function generateCandidatesForEpisode(
  episode: Episode,
  options: CandidateGenerationOptions = {}
): PromoCandidate[] {
  const {
    minDurationSeconds = 20.0,
    maxDurationSeconds = 60.0,
    minStartStepSeconds = 12.0,
    minDurationGapSeconds = 15.0
  } = options;

  // 1. Flatten all screenplay elements across scenes in chronological order
  const allElements = episode.scenes.flatMap(sc =>
    sc.elements.map(el => ({
      ...el,
      sceneNumber: sc.sceneNumber
    }))
  );

  allElements.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);

  const candidates: PromoCandidate[] = [];
  let lastStartSec = -999;

  // 2. Iterate through element starting boundaries
  for (let i = 0; i < allElements.length; i++) {
    const startEl = allElements[i];
    const candStart = startEl.startSeconds;

    // Rule: Avoid generating starting points that are too close to each other
    if (candStart - lastStartSec < minStartStepSeconds) {
      continue;
    }

    // Stop if remaining episode runtime cannot satisfy the minimum 20s duration
    if (episode.endSeconds - candStart < minDurationSeconds) {
      break;
    }

    // 3. Find valid element-aligned ending boundaries within [20s, 60s]
    let shortBoundary: { endEl: typeof allElements[0]; candEnd: number; duration: number } | null = null;
    let longBoundary: { endEl: typeof allElements[0]; candEnd: number; duration: number } | null = null;

    for (let j = i; j < allElements.length; j++) {
      const endEl = allElements[j];
      const candEnd = endEl.endSeconds;
      const duration = Number((candEnd - candStart).toFixed(3));

      if (duration < minDurationSeconds) {
        continue;
      }
      if (duration > maxDurationSeconds) {
        // Elements are ordered chronologically; stop searching for this start
        break;
      }

      // First valid boundary reaching >= 20s forms our concise window
      if (!shortBoundary) {
        shortBoundary = { endEl, candEnd, duration };
      } else {
        // Expand to find a distinct longer window if it exceeds shortBoundary by minDurationGap
        if (duration - shortBoundary.duration >= minDurationGapSeconds) {
          longBoundary = { endEl, candEnd, duration };
        }
      }
    }

    const selectedBoundaries = [shortBoundary, longBoundary].filter(
      (b): b is NonNullable<typeof b> => b !== null
    );

    // 4. Construct candidate objects for selected boundaries
    selectedBoundaries.forEach(b => {
      const candEnd = b.candEnd;
      const duration = b.duration;

      // Overlapping elements rule:
      // An element is included iff element.start < candidate.end AND element.end > candidate.start
      const overlapping = allElements.filter(el =>
        el.startSeconds < candEnd && el.endSeconds > candStart
      );

      if (overlapping.length === 0) return;

      const sceneNumbers = Array.from(
        new Set(overlapping.map(el => el.sceneNumber))
      ).sort((a, b) => a - b);

      const elementIds = overlapping.map(el => el.id);

      const content: CandidateContentItem[] = overlapping.map(el => {
        const item: CandidateContentItem = {
          id: el.id,
          type: el.type,
          startTime: el.startTime,
          endTime: el.endTime,
          startSeconds: el.startSeconds,
          endSeconds: el.endSeconds,
          durationSeconds: el.durationSeconds,
          text: el.text
        };
        if (el.type === 'dialogue') {
          item.character = el.character;
          if (el.delivery) item.delivery = el.delivery;
          if (el.isOffScreen) item.isOffScreen = true;
        }
        return item;
      });

      const candIndex = candidates.length + 1;
      const candId = `ep${String(episode.episodeNumber).padStart(3, '0')}-cand-${String(candIndex).padStart(3, '0')}`;

      candidates.push({
        candidateId: candId,
        episodeNumber: episode.episodeNumber,
        startTime: startEl.startTime,
        endTime: b.endEl.endTime,
        startSeconds: candStart,
        endSeconds: candEnd,
        durationSeconds: duration,
        sceneNumbers,
        elementIds,
        content
      });
    });

    if (selectedBoundaries.length > 0) {
      lastStartSec = candStart;
    }
  }

  return candidates;
}

/**
 * Main execution function:
 * 1. Reads Phase 1 output (data/parsed_episodes.json)
 * 2. Generates candidate windows across all 50 episodes
 * 3. Validates the candidate dataset against all 11 rules
 * 4. Writes data/promo_candidates.json
 * 5. Prints validation report
 */
export function run(options?: CandidateGenerationOptions): {
  success: boolean;
  totalCandidates: number;
  outputFilePath: string;
} {
  console.log(`\nReading parsed episodes from: ${INPUT_FILE}...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Phase 1 output not found at ${INPUT_FILE}. Please run 'npm run parse' first.`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(INPUT_FILE, 'utf-8');
  const datasetOutput: DatasetOutput = JSON.parse(rawJson);
  const sourceEpisodes = datasetOutput.episodes;

  console.log(`Loaded ${sourceEpisodes.length} episodes. Generating 20–60s promo candidates...`);

  const episodeCandidateEntries: EpisodeCandidates[] = [];
  let totalCandidatesCount = 0;

  sourceEpisodes.forEach(ep => {
    const candidates = generateCandidatesForEpisode(ep, options);
    totalCandidatesCount += candidates.length;

    episodeCandidateEntries.push({
      episodeNumber: ep.episodeNumber,
      episodeId: ep.episodeId,
      sourceFile: ep.sourceFile,
      candidateCount: candidates.length,
      candidates
    });
  });

  // Calculate summary metrics
  const durations: number[] = [];
  const counts: number[] = [];

  episodeCandidateEntries.forEach(epEntry => {
    counts.push(epEntry.candidateCount);
    epEntry.candidates.forEach(c => durations.push(c.durationSeconds));
  });

  const summary = {
    totalEpisodes: sourceEpisodes.length,
    totalCandidates: totalCandidatesCount,
    minDurationSeconds: durations.length > 0 ? Math.min(...durations) : 0,
    maxDurationSeconds: durations.length > 0 ? Math.max(...durations) : 0,
    avgDurationSeconds: durations.length > 0
      ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2))
      : 0,
    minCandidatesPerEpisode: counts.length > 0 ? Math.min(...counts) : 0,
    maxCandidatesPerEpisode: counts.length > 0 ? Math.max(...counts) : 0,
    avgCandidatesPerEpisode: counts.length > 0
      ? Number((totalCandidatesCount / counts.length).toFixed(1))
      : 0
  };

  const candidateDataset: PromoCandidatesDataset = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalEpisodes: sourceEpisodes.length,
    totalCandidates: totalCandidatesCount,
    summary,
    episodes: episodeCandidateEntries
  };

  // Validate the dataset
  const valResult = validateCandidates({
    dataset: candidateDataset,
    sourceEpisodes,
    expectedEpisodes: 50
  });

  // Save structured JSON output
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(candidateDataset, null, 2), 'utf-8');
  console.log(`Structured promo candidates written to: ${OUTPUT_FILE}`);

  // Print validation report
  console.log('\n' + formatCandidateValidationReport(valResult) + '\n');

  return {
    success: valResult.isValid,
    totalCandidates: totalCandidatesCount,
    outputFilePath: OUTPUT_FILE
  };
}

// Execute when run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const result = run();
  if (!result.success) {
    process.exit(1);
  }
}

