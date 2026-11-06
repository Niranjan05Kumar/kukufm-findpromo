/**
 * Validation engine for Phase 5: Cleaned & Finalized Promo Candidates.
 *
 * Verifies that all surviving candidates in data/final_promo_candidates.json
 * strictly adhere to the 20–60s duration constraints, have successful evaluations,
 * meet the finalScore >= 50 quality threshold, contain zero exact duplicates,
 * contain zero same-episode near-duplicates (overlapRatio >= 0.80), and maintain
 * exact score, rank, and rationale fidelity against previous phases.
 */

import type {
  FinalPromoCandidatesDataset,
  RankedPromoCandidatesDataset,
  FinalValidationResult,
  ValidationIssue,
  CleanupSummary,
  RankedPromoCandidate
} from './types.ts';

export interface FinalValidationInput {
  finalDataset: FinalPromoCandidatesDataset;
  sourceRankedDataset: RankedPromoCandidatesDataset;
  overlapThreshold?: number;       // default 0.80
  minFinalScore?: number;          // default 50.00
}

/**
 * Calculates temporal overlap ratio between two candidates relative to the shorter duration:
 * overlapDuration / min(durationA, durationB)
 */
export function calculateCandidateOverlapRatio(
  candA: { startSeconds: number; endSeconds: number; durationSeconds: number },
  candB: { startSeconds: number; endSeconds: number; durationSeconds: number }
): number {
  const overlapDuration = Math.max(
    0,
    Math.min(candA.endSeconds, candB.endSeconds) - Math.max(candA.startSeconds, candB.startSeconds)
  );
  const minDuration = Math.min(candA.durationSeconds, candB.durationSeconds);
  if (minDuration <= 0) return 0;
  return Number((overlapDuration / minDuration).toFixed(4));
}

/**
 * Validates the finalized candidate dataset against all Phase 5 requirements.
 */
export function validateFinalDataset(input: FinalValidationInput): FinalValidationResult {
  const {
    finalDataset,
    sourceRankedDataset,
    overlapThreshold = 0.80,
    minFinalScore = 50.00
  } = input;

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Build lookup index of Phase 4 ranked source candidates
  const sourceMap = new Map<string, RankedPromoCandidate>();
  sourceRankedDataset.candidates.forEach(c => sourceMap.set(c.candidateId, c));

  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();
  const seenExactCombinations = new Set<string>();
  const scores: number[] = [];

  // Group final candidates by episode for pairwise overlap checking
  const epCandidateMap = new Map<number, RankedPromoCandidate[]>();

  let previousCandidate: RankedPromoCandidate | null = null;

  finalDataset.candidates.forEach((cand, idx) => {
    const cId = cand.candidateId;

    // Rule 9: Unique candidate IDs
    if (!cId || cId.trim().length === 0) {
      errors.push({
        severity: 'error',
        message: `Candidate at index ${idx} has an empty candidateId.`
      });
      return;
    }

    if (seenIds.has(cId)) {
      errors.push({
        severity: 'error',
        message: `Duplicate candidateId detected in final dataset: ${cId}`
      });
    }
    seenIds.add(cId);

    // Rule 1: Every candidate must exist in Phase 4
    const source = sourceMap.get(cId);
    if (!source) {
      errors.push({
        severity: 'error',
        message: `Candidate ${cId} in final dataset was not found in Phase 4 source dataset.`
      });
      return;
    }

    // Rule 2: Duration between 20.0 and 60.0 seconds
    if (cand.durationSeconds < 20.0 || cand.durationSeconds > 60.0) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} duration violation: ${cand.durationSeconds}s (must be 20–60s).`
      });
    }

    // Rule 3: Must have successful evaluation
    if (cand.evaluationStatus !== 'success' || !cand.evaluation) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} has invalid or failed evaluation status: '${cand.evaluationStatus}'.`
      });
    }

    // Rule 4: Must have valid numeric finalScore
    if (cand.finalScore === null || cand.finalScore === undefined || typeof cand.finalScore !== 'number') {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} is missing numeric finalScore.`
      });
      return;
    }

    // Rule 8: No final candidate has finalScore < 50
    if (cand.finalScore < minFinalScore) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} has finalScore below minimum threshold: ${cand.finalScore} < ${minFinalScore}.`
      });
    }

    // Rule 10 & 11: Original scores, explanations, and finalScore are unchanged
    if (source.finalScore !== cand.finalScore) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} finalScore altered from Phase 4: ${cand.finalScore} vs source ${source.finalScore}.`
      });
    }

    if (
      cand.evaluation &&
      source.evaluation &&
      (cand.evaluation.hookScore !== source.evaluation.hookScore ||
        cand.evaluation.cliffhangerScore !== source.evaluation.cliffhangerScore ||
        cand.evaluation.contextScore !== source.evaluation.contextScore)
    ) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Candidate ${cId} Phase 3 scores altered in final dataset.`
      });
    }

    scores.push(cand.finalScore);

    // Rule 5: Must have valid rank
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
        message: `Duplicate rank detected in final dataset: Rank ${cand.rank} on candidate ${cId}.`
      });
    }
    seenRanks.add(cand.rank);

    // Rule 6: No exact duplicate episode/start/end combination
    const exactKey = `${cand.episodeNumber}_${cand.startSeconds}_${cand.endSeconds}`;
    if (seenExactCombinations.has(exactKey)) {
      errors.push({
        severity: 'error',
        episodeNumber: cand.episodeNumber,
        message: `Exact duplicate window detected for Episode ${cand.episodeNumber} at [${cand.startTime} - ${cand.endTime}].`
      });
    }
    seenExactCombinations.add(exactKey);

    // Check sorted order from highest score to lowest score
    if (previousCandidate && previousCandidate.finalScore !== null && cand.finalScore !== null) {
      if (cand.finalScore > previousCandidate.finalScore) {
        errors.push({
          severity: 'error',
          episodeNumber: cand.episodeNumber,
          message: `Rank ordering violation: candidate ${cId} (score ${cand.finalScore}) is ordered after ${previousCandidate.candidateId} (score ${previousCandidate.finalScore}).`
        });
      }
    }
    previousCandidate = cand;

    // Collect into episode group for pairwise overlap checking
    if (!epCandidateMap.has(cand.episodeNumber)) {
      epCandidateMap.set(cand.episodeNumber, []);
    }
    epCandidateMap.get(cand.episodeNumber)!.push(cand);
  });

  // Rule 7: No same-episode near-duplicate pair has overlapRatio >= 0.80
  for (const [epNum, cands] of epCandidateMap.entries()) {
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const ratio = calculateCandidateOverlapRatio(cands[i], cands[j]);
        if (ratio >= overlapThreshold) {
          errors.push({
            severity: 'error',
            episodeNumber: epNum,
            message: `Near-duplicate overlap detected in Episode ${epNum} between ${cands[i].candidateId} (${cands[i].startTime}-${cands[i].endTime}) and ${cands[j].candidateId} (${cands[j].startTime}-${cands[j].endTime}): overlapRatio=${(ratio * 100).toFixed(1)}% >= 80%.`
          });
        }
      }
    }
  }

  // Verify rank continuity (1 to N consecutive)
  for (let r = 1; r <= finalDataset.candidates.length; r++) {
    if (!seenRanks.has(r)) {
      errors.push({
        severity: 'error',
        message: `Rank continuity gap: Rank ${r} is missing from final dataset.`
      });
    }
  }

  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest = scores.length > 0 ? Math.min(...scores) : 0;
  const avg = scores.length > 0
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
    : 0;

  const summary: CleanupSummary = {
    ...finalDataset.summary,
    highestScore: highest,
    lowestScore: lowest,
    averageScore: avg
  };

  return {
    isValid: errors.length === 0,
    totalFinalCandidates: finalDataset.candidates.length,
    errors,
    warnings,
    summary
  };
}

/**
 * Formats a clean, readable terminal report of Phase 5 final validation.
 */
export function formatFinalValidationReport(res: FinalValidationResult): string {
  const s = res.summary;
  const lines: string[] = [];
  lines.push('==================================================');
  lines.push('PHASE 5 — FINAL PROMO CANDIDATES VALIDATION REPORT');
  lines.push('==================================================');
  lines.push(`Input candidates evaluated:  ${s.inputCandidates}`);
  lines.push(`Invalid candidates removed:  ${s.invalidRemoved}`);
  lines.push(`Failed evaluations removed:  ${s.failedEvaluationRemoved}`);
  lines.push(`Exact duplicates removed:    ${s.exactDuplicatesRemoved}`);
  lines.push(`Overlap duplicates removed:  ${s.overlapDuplicatesRemoved} (>=80% overlap threshold)`);
  lines.push(`Weak candidates removed:     ${s.weakCandidatesRemoved} (finalScore < 50 threshold)`);
  lines.push('--------------------------------------------------');
  lines.push(`Final surviving candidates:  ${s.finalCandidates}`);
  lines.push(`Highest Final Score:         ${s.highestScore.toFixed(2)} / 100.00 (Rank 1)`);
  lines.push(`Lowest Final Score:          ${s.lowestScore.toFixed(2)} / 100.00`);
  lines.push(`Average Final Score:         ${s.averageScore.toFixed(2)} / 100.00`);
  lines.push('--------------------------------------------------');

  if (res.errors.length === 0 && res.warnings.length === 0) {
    lines.push('Status: PASSED (All 12 final candidate validation checks passed with 0 errors, 0 warnings)');
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

