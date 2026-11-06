/**
 * KukuFM Microdrama Promo Candidate Cleaner & Finalizer (Phase 5).
 *
 * Ingests ranked candidate data from data/ranked_promo_candidates.json,
 * executes transparent, deterministic cleanup:
 *   1. Removes invalid candidates
 *   2. Removes failed evaluations
 *   3. Removes exact duplicate windows
 *   4. Removes near-duplicate overlapping candidates (overlapRatio >= 0.80 within episode)
 *   5. Removes weak candidates (finalScore < 50)
 *
 * Deterministically recalculates rank numbers (1 to N) without modifying finalScore
 * or Phase 3 evaluation rationales, and writes data/final_promo_candidates.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  RankedPromoCandidatesDataset,
  RankedPromoCandidate,
  FinalPromoCandidatesDataset,
  CleanupSummary
} from './types.ts';
import {
  calculateCandidateOverlapRatio,
  validateFinalDataset,
  formatFinalValidationReport
} from './validate_final.ts';
import { compareRankedCandidates } from './ranker.ts';

// Resolve project directories relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(PROJECT_ROOT, 'data', 'ranked_promo_candidates.json');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'data', 'final_promo_candidates.json');

export const CLEANUP_THRESHOLDS = {
  overlapRatioThreshold: 0.80,    // 80% overlap relative to shorter candidate
  minFinalScoreThreshold: 50.00   // Filter candidates with finalScore < 50
};

/**
 * Executes the complete 5-step candidate cleanup pipeline.
 */
export function cleanCandidates(sourceDataset: RankedPromoCandidatesDataset): {
  finalDataset: FinalPromoCandidatesDataset;
} {
  const inputCandidates = sourceDataset.candidates;

  // Step 1: Remove invalid candidates
  const validCandidates: RankedPromoCandidate[] = [];
  let invalidRemoved = 0;

  inputCandidates.forEach(cand => {
    if (
      !cand.candidateId ||
      !cand.episodeNumber ||
      cand.startSeconds === undefined ||
      cand.endSeconds === undefined ||
      cand.durationSeconds < 20.0 ||
      cand.durationSeconds > 60.0 ||
      !cand.content ||
      cand.content.length === 0
    ) {
      invalidRemoved++;
    } else {
      validCandidates.push(cand);
    }
  });

  // Step 2: Remove failed evaluations
  const evaluatedCandidates: RankedPromoCandidate[] = [];
  let failedEvaluationRemoved = 0;

  validCandidates.forEach(cand => {
    if (
      cand.evaluationStatus !== 'success' ||
      !cand.evaluation ||
      cand.finalScore === null ||
      cand.finalScore === undefined
    ) {
      failedEvaluationRemoved++;
    } else {
      evaluatedCandidates.push(cand);
    }
  });

  // Step 3: Remove exact duplicates (same episode, startSeconds, endSeconds)
  // Ensure candidates are sorted so the highest-scoring / best-ranked copy is prioritized
  evaluatedCandidates.sort(compareRankedCandidates);

  const exactUnique: RankedPromoCandidate[] = [];
  const seenExact = new Set<string>();
  let exactDuplicatesRemoved = 0;

  evaluatedCandidates.forEach(cand => {
    const key = `${cand.episodeNumber}_${cand.startSeconds}_${cand.endSeconds}`;
    if (seenExact.has(key)) {
      exactDuplicatesRemoved++;
    } else {
      seenExact.add(key);
      exactUnique.push(cand);
    }
  });

  // Step 4: Remove near-duplicate overlapping candidates within the same episode
  // Group by episodeNumber
  const epCandidateMap = new Map<number, RankedPromoCandidate[]>();
  exactUnique.forEach(cand => {
    if (!epCandidateMap.has(cand.episodeNumber)) {
      epCandidateMap.set(cand.episodeNumber, []);
    }
    epCandidateMap.get(cand.episodeNumber)!.push(cand);
  });

  const nonOverlappingCandidates: RankedPromoCandidate[] = [];
  let overlapDuplicatesRemoved = 0;

  for (const [, epCandidates] of epCandidateMap.entries()) {
    // epCandidates are already sorted by rank/score (highest priority first)
    const keptInEpisode: RankedPromoCandidate[] = [];

    for (const cand of epCandidates) {
      // Check if this candidate overlaps >= 80% with any candidate already kept in this episode
      let isNearDuplicate = false;

      for (const accepted of keptInEpisode) {
        const ratio = calculateCandidateOverlapRatio(cand, accepted);
        if (ratio >= CLEANUP_THRESHOLDS.overlapRatioThreshold) {
          isNearDuplicate = true;
          break;
        }
      }

      if (isNearDuplicate) {
        overlapDuplicatesRemoved++;
      } else {
        keptInEpisode.push(cand);
      }
    }

    keptInEpisode.forEach(c => nonOverlappingCandidates.push(c));
  }

  // Step 5: Remove weak candidates (finalScore < 50)
  const strongCandidates: RankedPromoCandidate[] = [];
  let weakCandidatesRemoved = 0;

  nonOverlappingCandidates.forEach(cand => {
    if (cand.finalScore! < CLEANUP_THRESHOLDS.minFinalScoreThreshold) {
      weakCandidatesRemoved++;
    } else {
      strongCandidates.push(cand);
    }
  });

  // Step 6: Recalculate deterministic ranks (1 to N)
  strongCandidates.sort(compareRankedCandidates);

  strongCandidates.forEach((cand, idx) => {
    cand.rank = idx + 1;
  });

  // Compute final score statistics
  const scores = strongCandidates.map(c => c.finalScore!);
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest = scores.length > 0 ? Math.min(...scores) : 0;
  const avg = scores.length > 0
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
    : 0;

  const summary: CleanupSummary = {
    inputCandidates: inputCandidates.length,
    invalidRemoved,
    failedEvaluationRemoved,
    exactDuplicatesRemoved,
    overlapDuplicatesRemoved,
    weakCandidatesRemoved,
    finalCandidates: strongCandidates.length,
    highestScore: highest,
    lowestScore: lowest,
    averageScore: avg
  };

  const finalDataset: FinalPromoCandidatesDataset = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    filteringThresholds: {
      overlapRatioThreshold: CLEANUP_THRESHOLDS.overlapRatioThreshold,
      minFinalScoreThreshold: CLEANUP_THRESHOLDS.minFinalScoreThreshold
    },
    summary,
    candidates: strongCandidates
  };

  return { finalDataset };
}

/**
 * Main execution function for Phase 5.
 */
export function runCleaner(): {
  success: boolean;
  outputFilePath: string;
  finalCandidatesCount: number;
} {
  console.log(`\nLoading ranked candidates from: ${INPUT_FILE}...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Ranked candidates file not found at ${INPUT_FILE}. Please run 'npm run rank' first.`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(INPUT_FILE, 'utf-8');
  const rankedDataset: RankedPromoCandidatesDataset = JSON.parse(rawJson);

  console.log(`Loaded ${rankedDataset.candidates.length} ranked candidates. Executing Phase 5 cleanup...`);

  const { finalDataset } = cleanCandidates(rankedDataset);

  // Validate the final dataset
  const valResult = validateFinalDataset({
    finalDataset,
    sourceRankedDataset: rankedDataset,
    overlapThreshold: CLEANUP_THRESHOLDS.overlapRatioThreshold,
    minFinalScore: CLEANUP_THRESHOLDS.minFinalScoreThreshold
  });

  // Write output to data/final_promo_candidates.json
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalDataset, null, 2), 'utf-8');
  console.log(`Structured finalized candidates written to: ${OUTPUT_FILE}`);

  // Print validation report
  console.log('\n' + formatFinalValidationReport(valResult) + '\n');

  return {
    success: valResult.isValid,
    outputFilePath: OUTPUT_FILE,
    finalCandidatesCount: finalDataset.candidates.length
  };
}

// Execute when run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const result = runCleaner();
  if (!result.success) {
    process.exit(1);
  }
}

