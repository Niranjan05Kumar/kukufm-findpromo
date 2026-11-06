/**
 * Validation engine for Phase 3: Evaluated Promo Candidates.
 *
 * Verifies that all Phase 2 candidates are preserved, candidate IDs remain unique,
 * evaluation scores strictly adhere to integers between 0 and 5, explanations are
 * non-empty and grounded, and failed evaluations are clearly flagged.
 */

import type {
  EvaluatedPromoCandidatesDataset,
  PromoCandidatesDataset,
  EvaluatedValidationResult,
  ValidationIssue,
  EvaluatedDatasetSummary
} from './types.ts';

export interface EvaluationValidationInput {
  evaluatedDataset: EvaluatedPromoCandidatesDataset;
  sourceCandidateDataset: PromoCandidatesDataset;
}

/**
 * Validates the evaluated candidate dataset against all Phase 3 requirements.
 */
export function validateEvaluations(input: EvaluationValidationInput): EvaluatedValidationResult {
  const { evaluatedDataset, sourceCandidateDataset } = input;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Build index of all Phase 2 source candidates
  const sourceCandidateMap = new Map<string, {
    episodeNumber: number;
    startTime: string;
    endTime: string;
    durationSeconds: number;
    elementIdsCount: number;
  }>();

  sourceCandidateDataset.episodes.forEach(ep => {
    ep.candidates.forEach(c => {
      sourceCandidateMap.set(c.candidateId, {
        episodeNumber: c.episodeNumber,
        startTime: c.startTime,
        endTime: c.endTime,
        durationSeconds: c.durationSeconds,
        elementIdsCount: c.elementIds.length
      });
    });
  });

  // Rule 1 & 8: Verify candidate counts match Phase 2 (no candidate silently dropped)
  if (evaluatedDataset.totalCandidates !== sourceCandidateDataset.totalCandidates) {
    errors.push({
      severity: 'error',
      message: `Total candidates mismatch: evaluated dataset has ${evaluatedDataset.totalCandidates}, expected ${sourceCandidateDataset.totalCandidates} from Phase 2.`
    });
  }

  const seenCandidateIds = new Set<string>();
  let successfulEvaluations = 0;
  let failedEvaluations = 0;
  let hookScoreSum = 0;
  let cliffhangerScoreSum = 0;
  let contextScoreSum = 0;

  evaluatedDataset.episodes.forEach(epEntry => {
    const epNum = epEntry.episodeNumber;

    epEntry.candidates.forEach((cand, cIdx) => {
      const cId = cand.candidateId;

      // Rule 2: Candidate IDs remain unique
      if (!cId || cId.trim().length === 0) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate at index ${cIdx} in Episode ${epNum} has empty candidateId.`
        });
        return;
      }

      if (seenCandidateIds.has(cId)) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Duplicate candidateId detected in evaluated dataset: ${cId}`
        });
      }
      seenCandidateIds.add(cId);

      // Rule 1 & 7: Cross-reference against Phase 2 source candidate
      const sourceCand = sourceCandidateMap.get(cId);
      if (!sourceCand) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cId} in evaluated dataset was not found in Phase 2 source candidate dataset.`
        });
      } else {
        if (sourceCand.episodeNumber !== cand.episodeNumber) {
          errors.push({
            severity: 'error',
            episodeNumber: epNum,
            message: `Candidate ${cId} episodeNumber mismatch: ${cand.episodeNumber} vs source ${sourceCand.episodeNumber}.`
          });
        }
        if (sourceCand.startTime !== cand.startTime || sourceCand.endTime !== cand.endTime) {
          errors.push({
            severity: 'error',
            episodeNumber: epNum,
            message: `Candidate ${cId} timestamps were altered during evaluation (${cand.startTime}-${cand.endTime} vs source ${sourceCand.startTime}-${sourceCand.endTime}).`
          });
        }
        if (sourceCand.elementIdsCount !== cand.elementIds.length) {
          errors.push({
            severity: 'error',
            episodeNumber: epNum,
            message: `Candidate ${cId} elements count was altered (${cand.elementIds.length} vs source ${sourceCand.elementIdsCount}).`
          });
        }
      }

      // Rule 6: Check evaluation status
      if (cand.evaluationStatus === 'failed') {
        failedEvaluations++;
        if (!cand.errorMessage || cand.errorMessage.trim().length === 0) {
          warnings.push({
            severity: 'warning',
            episodeNumber: epNum,
            message: `Candidate ${cId} is marked 'failed' but has no errorMessage.`
          });
        }
      } else if (cand.evaluationStatus === 'success') {
        successfulEvaluations++;
        const ev = cand.evaluation;

        // Rule 3: Every successful evaluation must have hookScore, cliffhangerScore, contextScore
        if (!ev) {
          errors.push({
            severity: 'error',
            episodeNumber: epNum,
            message: `Candidate ${cId} is marked 'success' but is missing evaluation object.`
          });
          return;
        }

        // Rule 4: Every score must be an integer between 0 and 5
        const scores = [
          { name: 'hookScore', val: ev.hookScore },
          { name: 'cliffhangerScore', val: ev.cliffhangerScore },
          { name: 'contextScore', val: ev.contextScore }
        ];

        scores.forEach(s => {
          if (
            typeof s.val !== 'number' ||
            !Number.isInteger(s.val) ||
            s.val < 0 ||
            s.val > 5
          ) {
            errors.push({
              severity: 'error',
              episodeNumber: epNum,
              message: `Candidate ${cId} has invalid ${s.name}: ${s.val} (must be integer 0-5).`
            });
          }
        });

        // Rule 5: Every explanation must be a non-empty string
        const explanations = [
          { name: 'hookExplanation', val: ev.hookExplanation },
          { name: 'cliffhangerExplanation', val: ev.cliffhangerExplanation },
          { name: 'contextExplanation', val: ev.contextExplanation }
        ];

        explanations.forEach(e => {
          if (typeof e.val !== 'string' || e.val.trim().length === 0) {
            errors.push({
              severity: 'error',
              episodeNumber: epNum,
              message: `Candidate ${cId} has empty or non-string ${e.name}.`
            });
          }
        });

        hookScoreSum += ev.hookScore;
        cliffhangerScoreSum += ev.cliffhangerScore;
        contextScoreSum += ev.contextScore;
      } else {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cId} has unrecognized evaluationStatus: '${cand.evaluationStatus}'. Must be 'success' or 'failed'.`
        });
      }
    });
  });

  // Verify all source candidates were accounted for
  for (const [sourceId, info] of sourceCandidateMap.entries()) {
    if (!seenCandidateIds.has(sourceId)) {
      errors.push({
        severity: 'error',
        episodeNumber: info.episodeNumber,
        message: `Phase 2 candidate ${sourceId} was silently dropped from evaluated dataset.`
      });
    }
  }

  const avgHook = successfulEvaluations > 0 ? Number((hookScoreSum / successfulEvaluations).toFixed(2)) : 0;
  const avgCliff = successfulEvaluations > 0 ? Number((cliffhangerScoreSum / successfulEvaluations).toFixed(2)) : 0;
  const avgContext = successfulEvaluations > 0 ? Number((contextScoreSum / successfulEvaluations).toFixed(2)) : 0;

  const summary: EvaluatedDatasetSummary = {
    totalEpisodes: evaluatedDataset.episodes.length,
    totalCandidates: evaluatedDataset.totalCandidates,
    successfullyEvaluated: successfulEvaluations,
    failedEvaluations,
    averageHookScore: avgHook,
    averageCliffhangerScore: avgCliff,
    averageContextScore: avgContext
  };

  return {
    isValid: errors.length === 0,
    totalCandidates: evaluatedDataset.totalCandidates,
    successfullyEvaluated: successfulEvaluations,
    failedEvaluations,
    errors,
    warnings,
    summary
  };
}

/**
 * Formats a clean, readable terminal report of Phase 3 validation results.
 */
export function formatEvaluationValidationReport(res: EvaluatedValidationResult): string {
  const s = res.summary;
  const lines: string[] = [];
  lines.push('==================================================');
  lines.push('PHASE 3 — CANDIDATE EVALUATION VALIDATION REPORT');
  lines.push('==================================================');
  lines.push(`Total candidates evaluated: ${s.totalCandidates.toLocaleString()}`);
  lines.push(`Successfully evaluated:     ${s.successfullyEvaluated.toLocaleString()}`);
  lines.push(`Failed evaluations:         ${s.failedEvaluations}`);
  lines.push('--------------------------------------------------');
  lines.push(`Average Hook Score:         ${s.averageHookScore.toFixed(2)} / 5.00`);
  lines.push(`Average Cliffhanger Score:  ${s.averageCliffhangerScore.toFixed(2)} / 5.00`);
  lines.push(`Average Context Score:      ${s.averageContextScore.toFixed(2)} / 5.00`);
  lines.push('--------------------------------------------------');

  if (res.errors.length === 0 && res.warnings.length === 0) {
    lines.push('Status: PASSED (All validation checks completed with 0 errors, 0 warnings)');
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

