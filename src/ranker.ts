/**
 * KukuFM Microdrama Promo Candidate Ranker (Phase 4).
 *
 * Ingests evaluated candidate data from data/evaluated_promo_candidates.json,
 * calculates a single weighted final promo score (0–100) using the exact formula:
 *   finalScore = (hookScore / 5 * 40) + (cliffhangerScore / 5 * 40) + (contextScore / 5 * 20)
 *
 * Deterministically ranks all successfully evaluated candidates from highest to
 * lowest score with strict tie-breaking, preserves all screenplay and evaluation
 * content, and saves the output to data/ranked_promo_candidates.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  EvaluatedPromoCandidatesDataset,
  RankedPromoCandidate,
  RankedPromoCandidatesDataset,
  ScoringWeights
} from './types.ts';
import {
  calculateExpectedFinalScore,
  validateRanking,
  formatRankingValidationReport
} from './validate_ranking.ts';

// Resolve project directories relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(PROJECT_ROOT, 'data', 'evaluated_promo_candidates.json');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'data', 'ranked_promo_candidates.json');

export const SCORING_WEIGHTS: ScoringWeights = {
  hookWeight: 0.40,
  cliffhangerWeight: 0.40,
  contextWeight: 0.20
};

/**
 * Calculates final score for an evaluated promo candidate.
 */
export function computeFinalScore(
  hookScore: number,
  cliffhangerScore: number,
  contextScore: number
): number {
  return calculateExpectedFinalScore(hookScore, cliffhangerScore, contextScore);
}

/**
 * Deterministic tie-breaking comparator for ranked promo candidates.
 * Order:
 *   1. Higher final score
 *   2. Higher hook score
 *   3. Higher cliffhanger score
 *   4. Higher context score
 *   5. Earlier episode number
 *   6. Earlier start timestamp
 *   7. Candidate ID (alphabetical)
 */
export function compareRankedCandidates(
  a: RankedPromoCandidate,
  b: RankedPromoCandidate
): number {
  // 1. Higher final score
  if (b.finalScore !== null && a.finalScore !== null && b.finalScore !== a.finalScore) {
    return b.finalScore - a.finalScore;
  }

  // If one is null (failed), successful comes first
  if (a.finalScore === null && b.finalScore !== null) return 1;
  if (b.finalScore === null && a.finalScore !== null) return -1;

  if (a.evaluation && b.evaluation) {
    // 2. Higher hook score
    if (b.evaluation.hookScore !== a.evaluation.hookScore) {
      return b.evaluation.hookScore - a.evaluation.hookScore;
    }
    // 3. Higher cliffhanger score
    if (b.evaluation.cliffhangerScore !== a.evaluation.cliffhangerScore) {
      return b.evaluation.cliffhangerScore - a.evaluation.cliffhangerScore;
    }
    // 4. Higher context score
    if (b.evaluation.contextScore !== a.evaluation.contextScore) {
      return b.evaluation.contextScore - a.evaluation.contextScore;
    }
  }

  // 5. Earlier episode number
  if (a.episodeNumber !== b.episodeNumber) {
    return a.episodeNumber - b.episodeNumber;
  }

  // 6. Earlier start timestamp (seconds)
  if (a.startSeconds !== b.startSeconds) {
    return a.startSeconds - b.startSeconds;
  }

  // 7. Candidate ID
  return a.candidateId.localeCompare(b.candidateId);
}

/**
 * Main execution function for Phase 4 ranking pipeline.
 */
export function runRanker(): {
  success: boolean;
  outputFilePath: string;
  totalRanked: number;
} {
  console.log(`\nLoading evaluated candidates from: ${INPUT_FILE}...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Evaluated candidates file not found at ${INPUT_FILE}. Please run 'npm run evaluate' first.`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(INPUT_FILE, 'utf-8');
  const evaluatedDataset: EvaluatedPromoCandidatesDataset = JSON.parse(rawJson);

  console.log(`Loaded ${evaluatedDataset.totalCandidates} evaluated candidates across ${evaluatedDataset.totalEpisodes} episodes.`);

  // Flatten candidates across episodes
  const successfulCandidates: RankedPromoCandidate[] = [];
  const failedCandidates: RankedPromoCandidate[] = [];

  evaluatedDataset.episodes.forEach(ep => {
    ep.candidates.forEach(cand => {
      if (cand.evaluationStatus === 'success' && cand.evaluation) {
        const finalScore = computeFinalScore(
          cand.evaluation.hookScore,
          cand.evaluation.cliffhangerScore,
          cand.evaluation.contextScore
        );

        successfulCandidates.push({
          ...cand,
          finalScore,
          rank: null // will be assigned after deterministic sort
        });
      } else {
        failedCandidates.push({
          ...cand,
          finalScore: null,
          rank: null
        });
      }
    });
  });

  // Sort successful candidates using deterministic comparator
  successfulCandidates.sort(compareRankedCandidates);

  // Assign consecutive ranks (1 to N)
  successfulCandidates.forEach((cand, idx) => {
    cand.rank = idx + 1;
  });

  // Combine successful candidates and any failed candidates
  const allRankedCandidates: RankedPromoCandidate[] = [
    ...successfulCandidates,
    ...failedCandidates
  ];

  // Calculate summary metrics
  const scores = successfulCandidates.map(c => c.finalScore!);
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest = scores.length > 0 ? Math.min(...scores) : 0;
  const avg = scores.length > 0
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
    : 0;

  const rankedDataset: RankedPromoCandidatesDataset = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    scoringWeights: SCORING_WEIGHTS,
    summary: {
      totalCandidates: allRankedCandidates.length,
      successfullyRanked: successfulCandidates.length,
      failedEvaluations: failedCandidates.length,
      highestScore: highest,
      lowestScore: lowest,
      averageScore: avg
    },
    candidates: allRankedCandidates
  };

  // Validate the ranked dataset against all Phase 4 rules
  const valResult = validateRanking({
    rankedDataset,
    sourceEvaluatedDataset: evaluatedDataset
  });

  // Write output to data/ranked_promo_candidates.json
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(rankedDataset, null, 2), 'utf-8');
  console.log(`Structured ranked candidates written to: ${OUTPUT_FILE}`);

  // Print validation report
  console.log('\n' + formatRankingValidationReport(valResult) + '\n');

  return {
    success: valResult.isValid,
    outputFilePath: OUTPUT_FILE,
    totalRanked: successfulCandidates.length
  };
}

// Execute when run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const result = runRanker();
  if (!result.success) {
    process.exit(1);
  }
}

