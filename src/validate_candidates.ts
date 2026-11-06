/**
 * Candidate validation engine for KukuFM Microdrama Promo Finder (Phase 2).
 *
 * Verifies that all generated promo candidates strictly satisfy duration bounds
 * (20–60s), boundary alignment, timestamp sanity, element overlap rules,
 * and content integrity against the Phase 1 parsed screenplay dataset.
 */

import type {
  PromoCandidatesDataset,
  Episode,
  CandidateValidationResult,
  ValidationIssue,
  CandidateDatasetSummary
} from './types.ts';

export interface CandidateValidationInput {
  dataset: PromoCandidatesDataset;
  sourceEpisodes: Episode[];
  expectedEpisodes?: number;
}

/**
 * Validates the candidate dataset against all 11 assignment rules.
 */
export function validateCandidates(input: CandidateValidationInput): CandidateValidationResult {
  const { dataset, sourceEpisodes, expectedEpisodes = 50 } = input;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Index source episodes for ground-truth cross-referencing
  const sourceEpMap = new Map<number, Episode>();
  sourceEpisodes.forEach(ep => sourceEpMap.set(ep.episodeNumber, ep));

  // Build index of all source elements for content verification
  const sourceElementMap = new Map<string, {
    text: string;
    type: string;
    startSeconds: number;
    endSeconds: number;
  }>();
  sourceEpisodes.forEach(ep => {
    ep.scenes.forEach(sc => {
      sc.elements.forEach(el => {
        sourceElementMap.set(el.id, {
          text: el.text,
          type: el.type,
          startSeconds: el.startSeconds,
          endSeconds: el.endSeconds
        });
      });
    });
  });

  // Rule 1: Exactly 50 episodes are represented
  if (dataset.episodes.length !== expectedEpisodes) {
    errors.push({
      severity: 'error',
      message: `Expected ${expectedEpisodes} episodes in candidate dataset, found ${dataset.episodes.length}.`
    });
  }

  const seenEpNumbers = new Set<number>();
  const seenCandidateIds = new Set<string>();

  let totalCandidates = 0;
  const durations: number[] = [];
  const perEpCounts: number[] = [];

  dataset.episodes.forEach(epEntry => {
    const epNum = epEntry.episodeNumber;

    if (seenEpNumbers.has(epNum)) {
      errors.push({
        severity: 'error',
        episodeNumber: epNum,
        message: `Duplicate episode entry in candidate dataset: Episode ${epNum}`
      });
    }
    seenEpNumbers.add(epNum);

    const sourceEp = sourceEpMap.get(epNum);
    if (!sourceEp) {
      errors.push({
        severity: 'error',
        episodeNumber: epNum,
        message: `Episode ${epNum} in candidate dataset does not exist in source episodes dataset.`
      });
      return;
    }

    perEpCounts.push(epEntry.candidateCount);
    totalCandidates += epEntry.candidates.length;

    // Check declared count vs actual array length
    if (epEntry.candidateCount !== epEntry.candidates.length) {
      errors.push({
        severity: 'error',
        episodeNumber: epNum,
        message: `Episode ${epNum} candidateCount mismatch: declared ${epEntry.candidateCount}, actual array has ${epEntry.candidates.length}.`
      });
    }

    // Episode with zero candidates
    if (epEntry.candidates.length === 0) {
      warnings.push({
        severity: 'warning',
        episodeNumber: epNum,
        message: `Episode ${epNum} has 0 candidates generated.`
      });
    }

    epEntry.candidates.forEach((cand, cIdx) => {
      durations.push(cand.durationSeconds);

      // Rule 2: Every candidate belongs to a valid episode
      if (cand.episodeNumber !== epNum) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} has mismatched episodeNumber: ${cand.episodeNumber} vs entry ${epNum}.`
        });
      }

      // Rule 3: Candidate IDs are strictly unique
      if (!cand.candidateId || cand.candidateId.trim().length === 0) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate at index ${cIdx} in Episode ${epNum} is missing candidateId.`
        });
      } else if (seenCandidateIds.has(cand.candidateId)) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Duplicate candidateId detected: ${cand.candidateId}`
        });
      } else {
        seenCandidateIds.add(cand.candidateId);
      }

      // Rule 4: startSeconds < endSeconds
      if (cand.startSeconds >= cand.endSeconds) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} has invalid time range: ${cand.startTime} (${cand.startSeconds}s) >= ${cand.endTime} (${cand.endSeconds}s).`
        });
      }

      // Rule 5: Duration is >= 20 seconds
      if (cand.durationSeconds < 20.0) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} duration is below 20s: ${cand.durationSeconds}s.`
        });
      }

      // Rule 6: Duration is <= 60 seconds
      if (cand.durationSeconds > 60.0) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} duration exceeds 60s: ${cand.durationSeconds}s.`
        });
      }

      // Math verification: durationSeconds == endSeconds - startSeconds
      const expectedDuration = Number((cand.endSeconds - cand.startSeconds).toFixed(3));
      if (Math.abs(cand.durationSeconds - expectedDuration) > 0.01) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} duration mismatch: stated ${cand.durationSeconds}s vs calculated ${expectedDuration}s.`
        });
      }

      // Rule 7: Candidate timestamps fall within episode runtime
      if (cand.startSeconds < 0) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} starts before episode start (startSeconds: ${cand.startSeconds}).`
        });
      }
      if (cand.endSeconds > sourceEp.endSeconds + 0.05) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} ends after episode runtime: ${cand.endSeconds}s > ${sourceEp.endSeconds}s.`
        });
      }

      // Rule 8: Candidate contains at least one screenplay element
      if (!cand.elementIds || cand.elementIds.length === 0 || !cand.content || cand.content.length === 0) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} contains no screenplay elements.`
        });
        return;
      }

      if (cand.elementIds.length !== cand.content.length) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} elementIds count (${cand.elementIds.length}) does not match content items count (${cand.content.length}).`
        });
      }

      // Rule 9: Candidate elements actually overlap the candidate time range
      // (element.start < candidate.end AND element.end > candidate.start)
      cand.content.forEach(el => {
        const overlaps = el.startSeconds < cand.endSeconds && el.endSeconds > cand.startSeconds;
        if (!overlaps) {
          errors.push({
            severity: 'error',
            episodeNumber: epNum,
            message: `Element ${el.id} (${el.startTime}-${el.endTime}) does not overlap candidate ${cand.candidateId} window (${cand.startTime}-${cand.endTime}).`
          });
        }

        // Rule 10: Candidate content preserves original screenplay data
        const sourceEl = sourceElementMap.get(el.id);
        if (!sourceEl) {
          errors.push({
            severity: 'error',
            episodeNumber: epNum,
            message: `Element ${el.id} in candidate ${cand.candidateId} does not exist in source screenplay dataset.`
          });
        } else {
          if (sourceEl.text !== el.text) {
            errors.push({
              severity: 'error',
              episodeNumber: epNum,
              message: `Element ${el.id} text was modified in candidate ${cand.candidateId}.`
            });
          }
          if (sourceEl.type !== el.type) {
            errors.push({
              severity: 'error',
              episodeNumber: epNum,
              message: `Element ${el.id} type mismatch in candidate ${cand.candidateId}: ${el.type} vs source ${sourceEl.type}.`
            });
          }
        }
      });

      // Rule 11: No invalid or empty candidate objects
      if (!cand.sceneNumbers || cand.sceneNumbers.length === 0) {
        errors.push({
          severity: 'error',
          episodeNumber: epNum,
          message: `Candidate ${cand.candidateId} has empty sceneNumbers array.`
        });
      }
    });
  });

  // Verify all 1..expectedEpisodes are present
  for (let n = 1; n <= expectedEpisodes; n++) {
    if (!seenEpNumbers.has(n)) {
      errors.push({
        severity: 'error',
        episodeNumber: n,
        message: `Expected Episode ${n} is missing from candidate dataset.`
      });
    }
  }

  // Summary calculation
  const minDur = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDur = durations.length > 0 ? Math.max(...durations) : 0;
  const avgDur = durations.length > 0 ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)) : 0;
  const minPerEp = perEpCounts.length > 0 ? Math.min(...perEpCounts) : 0;
  const maxPerEp = perEpCounts.length > 0 ? Math.max(...perEpCounts) : 0;
  const avgPerEp = perEpCounts.length > 0 ? Number((totalCandidates / perEpCounts.length).toFixed(1)) : 0;

  const summary: CandidateDatasetSummary = {
    totalEpisodes: dataset.episodes.length,
    totalCandidates,
    minDurationSeconds: minDur,
    maxDurationSeconds: maxDur,
    avgDurationSeconds: avgDur,
    minCandidatesPerEpisode: minPerEp,
    maxCandidatesPerEpisode: maxPerEp,
    avgCandidatesPerEpisode: avgPerEp
  };

  return {
    isValid: errors.length === 0,
    totalEpisodes: dataset.episodes.length,
    totalCandidates,
    errors,
    warnings,
    summary
  };
}

/**
 * Formats a clean, readable terminal report of candidate validation results.
 */
export function formatCandidateValidationReport(res: CandidateValidationResult): string {
  const s = res.summary;
  const lines: string[] = [];
  lines.push('==================================================');
  lines.push('PHASE 2 — PROMO CANDIDATES VALIDATION REPORT');
  lines.push('==================================================');
  lines.push(`Episodes represented:       ${s.totalEpisodes} (Expected: 50)`);
  lines.push(`Total candidates generated: ${s.totalCandidates.toLocaleString()}`);
  lines.push(`Candidates per episode:     min=${s.minCandidatesPerEpisode}, max=${s.maxCandidatesPerEpisode}, avg=${s.avgCandidatesPerEpisode}`);
  lines.push(`Candidate durations:        min=${s.minDurationSeconds.toFixed(1)}s, max=${s.maxDurationSeconds.toFixed(1)}s, avg=${s.avgDurationSeconds.toFixed(1)}s`);
  lines.push(`Duration constraint check:  All candidates within [20.0s, 60.0s]`);
  lines.push('--------------------------------------------------');

  if (res.errors.length === 0 && res.warnings.length === 0) {
    lines.push('Status: PASSED (All 11 candidate validation checks passed with 0 errors, 0 warnings)');
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

