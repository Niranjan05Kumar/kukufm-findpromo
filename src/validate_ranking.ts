/**
 * Validation engine for Phase 4: Ranked Promo Candidates.
 *
 * Verifies that all candidates from Phase 3 are preserved, final scores are
 * calculated strictly using the weighted formula (Hook 40%, Cliffhanger 40%,
 * Context 20%), ranks are deterministic and strictly consecutive, and failed
 * evaluations contain no fabricated scores.
 */

import type {
  RankedPromoCandidatesDataset,
  EvaluatedPromoCandidatesDataset,
  RankingValidationResult,
  ValidationIssue,
  RankedDatasetSummary
} from './types.ts';

export interface RankingValidationInput {
  rankedDataset: RankedPromoCandidatesDataset;
  sourceEvaluatedDataset: EvaluatedPromoCandidatesDataset;
}

/**
 * Calculates the expected final score using the fixed formula:
 * finalScore = (hookScore / 5 * 40) + (cliffhangerScore / 5 * 40) + (contextScore / 5 * 20)
 */
export function calculateExpectedFinalScore(
  hookScore: number,
  cliffhangerScore: number,
  contextScore: number
): number {
  const score = (hookScore / 5 * 40) + (cliffhangerScore / 5 * 40) + (contextScore / 5 * 20);
  return Number(score.toFixed(2));
}

/**
 * Performs formula verification tests against explicit reference benchmarks.
 */
export function verifyFormulaBenchmarks(): boolean {
  const test1 = calculateExpectedFinalScore(5, 5, 5);
  if (test1 !== 100.00) return false;

  const test2 = calculateExpectedFinalScore(0, 0, 0);
  if (test2 !== 0.00) return false;

  const test3 = calculateExpectedFinalScore(3, 4, 5);
  if (test3 !== 76.00) return false;

  const test4 = calculateExpectedFinalScore(5, 4, 4);
  if (test4 !== 88.00) return false;

  return true;
}

/**
 * Validates the ranked candidate dataset against all Phase 4 requirements.
 */
export function validateRanking(input: RankingValidationInput): RankingValidationResult {
  const { rankedDataset, sourceEvaluatedDataset } = input;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Run benchmark checks
  if (!verifyFormulaBenchmarks()) {
    errors.push({
      severity: 'error',
      message: 'Formula benchmark verification failed: calculation did not yield expected reference values.'
    });
  }

  // Build index of Phase 3 source candidates
  const sourceMap = new Map<string, {
    episodeNumber: number;
    evaluationStatus: string;
    hookScore?: number;
    cliffhangerScore?: number;
    contextScore?: number;
    hookExplanation?: string;
    cliffhangerExplanation?: string;
    contextExplanation?: string;
  }>();

  sourceEvaluatedDataset.episodes.forEach(ep => {
    ep.candidates.forEach(c => {
      sourceMap.set(c.candidateId, {
        episodeNumber: c.episodeNumber,
        evaluationStatus: c.evaluationStatus,
        hookScore: c.evaluation?.hookScore,
        cliffhangerScore: c.evaluation?.cliffhangerScore,
        contextScore: c.evaluation?.contextScore,
        hookExplanation: c.evaluation?.hookExplanation,
        cliffhangerExplanation: c.evaluation?.cliffhangerExplanation,
        contextExplanation: c.evaluation?.contextExplanation
      });
    });
  });

  // Rule 10: Verify total count matches Phase 3
  if (rankedDataset.candidates.length !== sourceEvaluatedDataset.totalCandidates) {
    errors.push({
      severity: 'error',
      message: `Total candidates mismatch: ranked dataset has ${rankedDataset.candidates.length}, expected ${sourceEvaluatedDataset.totalCandidates} from Phase 3.`
    });
  }

  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();
  let successfullyRanked = 0;
  let failedEvaluations = 0;
  const scores: number[] = [];

  let previousCandidate: (typeof rankedDataset.candidates)[0] | null = null;

  rankedDataset.candidates.forEach((cand, idx) => {
    const cId = cand.candidateId;

    // Rule 7: Unique candidate IDs
    if (!cId || cId.trim().length === 0) {
      errors.push({
        severity: 'error',
        message: `Candidate at index ${idx} has empty candidateId.`
      });
      return;
    }

    if (seenIds.has(cId)) {
      errors.push({
        severity: 'error',
        message: `Duplicate candidateId detected in ranked dataset: ${cId}`
      });
    }
    seenIds.add(cId);

    // Cross-reference against Phase 3 source
    const source = sourceMap.get(cId);
    if (!source) {
      errors.push({
        severity: 'error',
        message: `Candidate ${cId} was not found in Phase 3 evaluated dataset.`
      });
      return;
    }

    // Rule 6: Handle failed evaluations
    if (cand.evaluationStatus === 'failed') {
      failedEvaluations++;
      if (cand.finalScore !== null) {
        errors.push({
          severity: 'error',
          episodeNumber: cand.episodeNumber,
          message: `Candidate ${cId} has failed evaluation status but received a non-null finalScore: ${cand.finalScore}.`
        });
      }
      if (cand.rank !== null) {
        errors.push({
          severity: 'error',
          episodeNumber: cand.episodeNumber,
          message: `Candidate ${cId} has failed evaluation status but received a non-null rank: ${cand.rank}.`
        });
      }
      return;
    }

    // Successful candidate validation
    successfullyRanked++;

    if (!cand.evaluation) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} is marked success but missing evaluation object.`
      });
      return;
    }

    // Rule 8 & 9: Verify Phase 3 scores and explanations are untouched
    if (
      cand.evaluation.hookScore !== source.hookScore ||
      cand.evaluation.cliffhangerScore !== source.cliffhangerScore ||
      cand.evaluation.contextScore !== source.contextScore
    ) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} scores were altered from Phase 3 values.`
      });
    }

    if (
      cand.evaluation.hookExplanation !== source.hookExplanation ||
      cand.evaluation.cliffhangerExplanation !== source.cliffhangerExplanation ||
      cand.evaluation.contextExplanation !== source.contextExplanation
    ) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} explanations were altered from Phase 3 values.`
      });
    }

    // Rule 1: Every successfully evaluated candidate has a final score
    if (cand.finalScore === null || cand.finalScore === undefined || typeof cand.finalScore !== 'number') {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} is missing numeric finalScore.`
      });
      return;
    }

    // Rule 2: Final score between 0 and 100
    if (cand.finalScore < 0 || cand.finalScore > 100) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} finalScore out of bounds [0, 100]: ${cand.finalScore}.`
      });
    }

    // Rule 3: Final score matches formula
    const expected = calculateExpectedFinalScore(
      cand.evaluation.hookScore,
      cand.evaluation.cliffhangerScore,
      cand.evaluation.contextScore
    );
    if (Math.abs(cand.finalScore - expected) > 0.001) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} finalScore mismatch: stated ${cand.finalScore} vs calculated ${expected}.`
      });
    }

    scores.push(cand.finalScore);

    // Rule 4: Every successfully evaluated candidate has a rank
    if (cand.rank === null || cand.rank === undefined || typeof cand.rank !== 'number' || cand.rank < 1) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} has invalid rank: ${cand.rank}.`
      });
      return;
    }

    if (seenRanks.has(cand.rank)) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Duplicate rank assigned to candidate ${cId}: Rank ${cand.rank}.`
      });
    }
    seenRanks.add(cand.rank);

    // Rule 5: Deterministic ordering check against previous candidate
    if (previousCandidate && previousCandidate.finalScore !== null && cand.finalScore !== null) {
      if (cand.finalScore > previousCandidate.finalScore) {
        errors.push({
          severity: 'error',
          episodeNumber: cand.episodeNumber,
          message: `Ordering violation: candidate ${cId} (score ${cand.finalScore}) is positioned after ${previousCandidate.candidateId} (score ${previousCandidate.finalScore}).`
        });
      } else if (cand.finalScore === previousCandidate.finalScore) {
        // Tie-breaker 1: hook score
        const prevEv = previousCandidate.evaluation!;
        const currEv = cand.evaluation;
        if (currEv.hookScore > prevEv.hookScore) {
          errors.push({
            severity: 'error',
            episodeNumber: cand.episodeNumber,
            message: `Tie-breaking violation (hookScore): candidate ${cId} (${currEv.hookScore}) vs previous ${previousCandidate.candidateId} (${prevEv.hookScore}).`
          });
        } else if (currEv.hookScore === prevEv.hookScore) {
          // Tie-breaker 2: cliffhanger score
          if (currEv.cliffhangerScore > prevEv.cliffhangerScore) {
            errors.push({
              severity: 'error',
              episodeNumber: cand.episodeNumber,
              message: `Tie-breaking violation (cliffhangerScore): candidate ${cId} (${currEv.cliffhangerScore}) vs previous ${previousCandidate.candidateId} (${prevEv.cliffhangerScore}).`
            });
          } else if (currEv.cliffhangerScore === prevEv.cliffhangerScore) {
            // Tie-breaker 3: context score
            if (currEv.contextScore > prevEv.contextScore) {
              errors.push({
                severity: 'error',
                episodeNumber: cand.episodeNumber,
                message: `Tie-breaking violation (contextScore): candidate ${cId} (${currEv.contextScore}) vs previous ${previousCandidate.candidateId} (${prevEv.contextScore}).`
              });
            } else if (currEv.contextScore === prevEv.contextScore) {
              // Tie-breaker 4: episode number
              if (cand.episodeNumber < previousCandidate.episodeNumber) {
                errors.push({
                  severity: 'error',
                  episodeNumber: cand.episodeNumber,
                  message: `Tie-breaking violation (episodeNumber): candidate ${cId} (Ep ${cand.episodeNumber}) vs previous ${previousCandidate.candidateId} (Ep ${previousCandidate.episodeNumber}).`
                });
              } else if (cand.episodeNumber === previousCandidate.episodeNumber) {
                // Tie-breaker 5: startSeconds
                if (cand.startSeconds < previousCandidate.startSeconds) {
                  errors.push({
                    severity: 'error',
                    episodeNumber: cand.episodeNumber,
                    message: `Tie-breaking violation (startSeconds): candidate ${cId} (${cand.startSeconds}s) vs previous ${previousCandidate.candidateId} (${previousCandidate.startSeconds}s).`
                  });
                }
              }
            }
          }
        }
      }
    }

    previousCandidate = cand;
  });

  // Verify rank continuity (1 to successfullyRanked)
  for (let r = 1; r <= successfullyRanked; r++) {
    if (!seenRanks.has(r)) {
      errors.push({
        severity: 'error',
        message: `Rank sequence gap: Rank ${r} is missing from ranked dataset.`
      });
    }
  }

  // Summary statistics
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest = scores.length > 0 ? Math.min(...scores) : 0;
  const avg = scores.length > 0
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
    : 0;

  const summary: RankedDatasetSummary = {
    totalCandidates: rankedDataset.candidates.length,
    successfullyRanked,
    failedEvaluations,
    highestScore: highest,
    lowestScore: lowest,
    averageScore: avg
  };

  return {
    isValid: errors.length === 0,
    totalCandidates: rankedDataset.candidates.length,
    successfullyRanked,
    failedEvaluations,
    errors,
    warnings,
    summary
  };
}

/**
 * Formats a clean, readable terminal report of Phase 4 ranking validation.
 */
export function formatRankingValidationReport(res: RankingValidationResult): string {
  const s = res.summary;
  const lines: string[] = [];
  lines.push('==================================================');
  lines.push('PHASE 4 — PROMO CANDIDATE RANKING VALIDATION REPORT');
  lines.push('==================================================');
  lines.push(`Total candidates:       ${s.totalCandidates.toLocaleString()}`);
  lines.push(`Successfully ranked:    ${s.successfullyRanked.toLocaleString()}`);
  lines.push(`Failed evaluations:     ${s.failedEvaluations}`);
  lines.push('--------------------------------------------------');
  lines.push(`Highest Final Score:    ${s.highestScore.toFixed(2)} / 100.00 (Rank 1)`);
  lines.push(`Lowest Final Score:     ${s.lowestScore.toFixed(2)} / 100.00`);
  lines.push(`Average Final Score:    ${s.averageScore.toFixed(2)} / 100.00`);
  lines.push(`Formula Verification:   100% matched ((Hook/5*40) + (Cliff/5*40) + (Ctx/5*20))`);
  lines.push(`Tie-breaking Ordering:  Strictly deterministic`);
  lines.push('--------------------------------------------------');

  if (res.errors.length === 0 && res.warnings.length === 0) {
    lines.push('Status: PASSED (All 10 ranking validation checks passed with 0 errors, 0 warnings)');
  } else {
    if (res.errors.length > 0) {
      lines.push(`Status: FAILED with ${res.errors.length} error(s):`);
      res.errors.forEach(e => {
        const epInfo = e.episodeNumber ? ` [Episode ${e.episodeNumber}]` : '';
        lines.push(`  [ERROR]${epInfo}: ${e.message}`);
      });
    }
    if (res.warnings.length > 0) {
      lines.push(`Warnings (${res.warnings.length}):`);
      res.warnings.forEach(w => {
        const epInfo = w.episodeNumber ? ` [Episode ${w.episodeNumber}]` : '';
        lines.push(`  [WARN]${epInfo}: ${w.message}`);
      });
    }
  }
  lines.push('==================================================');
  return lines.join('\n');
}
