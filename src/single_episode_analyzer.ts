/**
 * Single Episode Screenplay Analyzer.
 *
 * Runs the full 6-step promo discovery pipeline on a single uploaded screenplay text:
 * 1. Screenplay Validation & Parsing
 * 2. Promo Candidate Generation (20–60s)
 * 3. AI Evaluation (Hook 0-5, Cliffhanger 0-5, Context 0-5)
 * 4. Deterministic Weighted Scoring (Hook 40% + Cliffhanger 40% + Context 20%)
 * 5. Deterministic Ranking
 * 6. Overlap Deduplication (>=80%) & Weak Candidate Filter (<50)
 */

import type {
  Episode,
  PromoCandidate,
  RankedPromoCandidate,
  CandidateEvaluation
} from './types.ts';
import { parseScreenplay } from './screenplay_parser_core.ts';
import { generateCandidatesForEpisode } from './candidate_generator_core.ts';
import {
  evaluateCandidateMock,
  computeFinalScore,
  compareRankedCandidates
} from './evaluation_core.ts';

export interface SingleEpisodeAnalyzeOptions {
  apiKey?: string;
  customEvaluator?: (candidate: PromoCandidate) => Promise<CandidateEvaluation> | CandidateEvaluation;
}

export interface SingleEpisodeAnalyzeResult {
  success: boolean;
  error?: string;
  episodeTitle: string;
  episodeNumber: number;
  detectedEpisodeNumber?: number;
  candidates: RankedPromoCandidate[];
  summary?: {
    totalGenerated: number;
    overlapDuplicatesRemoved: number;
    weakCandidatesRemoved: number;
    finalCandidates: number;
    highestScore: number;
  };
}

/**
 * Validates raw screenplay text before parsing.
 */
export function validateScreenplayText(text: string): { isValid: boolean; error?: string } {
  if (!text || typeof text !== 'string') {
    return { isValid: false, error: 'File is empty or could not be read.' };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { isValid: false, error: 'The uploaded screenplay file is empty.' };
  }

  if (trimmed.length < 50) {
    return { isValid: false, error: 'The uploaded file is too short to be a valid microdrama screenplay.' };
  }

  const hasSceneHeading = /Scene\s+heading|SCENE\s+HEADING/i.test(trimmed);
  const hasTimestamps = /Start:\s*\(?\d{2}:\d{2}/i.test(trimmed);
  const hasDialogueOrCamera = /\*\*[^*]+\*\*:/i.test(trimmed);

  if (!hasSceneHeading && !hasTimestamps && !hasDialogueOrCamera) {
    return {
      isValid: false,
      error: 'Invalid screenplay format: File must contain standard scene headings (e.g. "Scene heading:"), timestamps ("Start: (MM:SS.ss)"), or screenplay beat headers ("**CAMERA:**", "**ACTION:**", "**CHARACTER:**").'
    };
  }

  return { isValid: true };
}

/**
 * Executes end-to-end promo discovery for a single screenplay string.
 */
export async function analyzeScreenplayText(
  content: string,
  filename: string,
  options: SingleEpisodeAnalyzeOptions = {}
): Promise<SingleEpisodeAnalyzeResult> {
  // 1. Validate raw text
  const validation = validateScreenplayText(content);
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.error,
      episodeTitle: 'Uploaded Episode',
      episodeNumber: 0,
      candidates: []
    };
  }

  // 2. Parse screenplay
  let episode: Episode;
  try {
    episode = parseScreenplay(content, filename);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to parse screenplay: ${msg}`,
      episodeTitle: 'Uploaded Episode',
      episodeNumber: 0,
      candidates: []
    };
  }

  if (episode.scenes.length === 0 || episode.stats.elementCount === 0) {
    return {
      success: false,
      error: 'Screenplay parser found 0 scenes or elements. Please check the screenplay structure.',
      episodeTitle: 'Uploaded Episode',
      episodeNumber: 0,
      candidates: []
    };
  }

  const epNumber = episode.episodeNumber || 0;
  const episodeTitle = epNumber > 0 ? `Episode ${epNumber}` : 'Uploaded Episode';

  // 3. Generate candidate clips (20–60s)
  const rawCandidates: PromoCandidate[] = generateCandidatesForEpisode(episode, {
    minDurationSeconds: 20.0,
    maxDurationSeconds: 60.0,
    minStartStepSeconds: 12.0,
    minDurationGapSeconds: 15.0
  });

  if (rawCandidates.length === 0) {
    return {
      success: false,
      error: `No valid 20–60 second promo candidates could be generated. (Total episode duration: ${episode.durationSeconds.toFixed(1)}s, elements: ${episode.stats.elementCount}). Candidates must be continuous sections between 20.0s and 60.0s.`,
      episodeTitle,
      episodeNumber: epNumber,
      candidates: []
    };
  }

  // 4. AI Evaluation (Hook 0-5, Cliffhanger 0-5, Context 0-5)
  const evaluatedCandidates: RankedPromoCandidate[] = [];

  for (let i = 0; i < rawCandidates.length; i++) {
    const cand = rawCandidates[i];
    let evaluation: CandidateEvaluation;

    if (options.customEvaluator) {
      evaluation = await options.customEvaluator(cand);
    } else {
      evaluation = evaluateCandidateMock(cand);
    }

    // 5. Calculate Final Score (Hook 40% + Cliff 40% + Context 20%)
    const finalScore = computeFinalScore(
      evaluation.hookScore,
      evaluation.cliffhangerScore,
      evaluation.contextScore
    );

    evaluatedCandidates.push({
      ...cand,
      evaluationStatus: 'success',
      evaluation,
      evaluatedAt: new Date().toISOString(),
      finalScore,
      rank: null
    });
  }

  // 6. Rank candidates deterministically
  evaluatedCandidates.sort(compareRankedCandidates);

  // 7. Cleanup & Deduplication
  // Step A: Remove exact duplicates
  const seenExact = new Set<string>();
  const exactUnique: RankedPromoCandidate[] = [];
  for (const c of evaluatedCandidates) {
    const key = `${c.startSeconds}_${c.endSeconds}`;
    if (!seenExact.has(key)) {
      seenExact.add(key);
      exactUnique.push(c);
    }
  }

  // Step B: Remove near-duplicate overlapping candidates (>= 80% overlap relative to shorter candidate)
  const nonOverlapping: RankedPromoCandidate[] = [];
  let overlapRemoved = 0;

  for (const candidate of exactUnique) {
    let hasHighOverlap = false;

    for (const accepted of nonOverlapping) {
      const overlapStart = Math.max(candidate.startSeconds, accepted.startSeconds);
      const overlapEnd = Math.min(candidate.endSeconds, accepted.endSeconds);
      const overlapDuration = Math.max(0, overlapEnd - overlapStart);
      const minDuration = Math.min(candidate.durationSeconds, accepted.durationSeconds);
      const overlapRatio = minDuration > 0 ? overlapDuration / minDuration : 0;

      if (overlapRatio >= 0.80) {
        hasHighOverlap = true;
        overlapRemoved++;
        break;
      }
    }

    if (!hasHighOverlap) {
      nonOverlapping.push(candidate);
    }
  }

  // Step C: Filter weak candidates (< 50.00 finalScore)
  const strongCandidates: RankedPromoCandidate[] = [];
  let weakRemoved = 0;

  for (const candidate of nonOverlapping) {
    if ((candidate.finalScore ?? 0) < 50.00) {
      weakRemoved++;
    } else {
      strongCandidates.push(candidate);
    }
  }

  // Step D: Reassign sequential ranks 1..N
  const finalCandidates: RankedPromoCandidate[] = strongCandidates.map((c, idx) => ({
    ...c,
    rank: idx + 1
  }));

  const topScore = finalCandidates.length > 0 ? finalCandidates[0].finalScore ?? 0 : 0;

  return {
    success: true,
    episodeTitle,
    episodeNumber: epNumber,
    detectedEpisodeNumber: epNumber > 0 ? epNumber : undefined,
    candidates: finalCandidates,
    summary: {
      totalGenerated: rawCandidates.length,
      overlapDuplicatesRemoved: overlapRemoved,
      weakCandidatesRemoved: weakRemoved,
      finalCandidates: finalCandidates.length,
      highestScore: topScore
    }
  };
}
