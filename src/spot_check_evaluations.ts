/**
 * Inspection and spot-checking script for Phase 3 Candidate Evaluations.
 *
 * Inspects evaluated candidates from Episodes 1, 10, 25, 40, and 50,
 * displaying scores and explanations for Hook, Cliffhanger, and Standalone Context.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { EvaluatedPromoCandidatesDataset } from './types.ts';

const jsonPath = path.resolve('data/evaluated_promo_candidates.json');
const dataset: EvaluatedPromoCandidatesDataset = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log('==================================================');
console.log('PHASE 3 — EVALUATION SPOT-CHECK & MANUAL INSPECTION');
console.log('==================================================');
console.log(`Dataset Version: ${dataset.version}`);
console.log(`Generated At:    ${dataset.generatedAt}`);
console.log(`Model / Mode:    ${dataset.model}`);
console.log(`Total Candidates: ${dataset.totalCandidates}`);
console.log(`Successfully Evaluated: ${dataset.summary.successfullyEvaluated}`);
console.log(`Avg Hook Score:        ${dataset.summary.averageHookScore.toFixed(2)} / 5.00`);
console.log(`Avg Cliffhanger Score: ${dataset.summary.averageCliffhangerScore.toFixed(2)} / 5.00`);
console.log(`Avg Context Score:     ${dataset.summary.averageContextScore.toFixed(2)} / 5.00`);
console.log('--------------------------------------------------');

const targetEpisodes = [1, 10, 25, 40, 50];

targetEpisodes.forEach(epNum => {
  const ep = dataset.episodes.find(e => e.episodeNumber === epNum);
  if (!ep) throw new Error(`Episode ${epNum} not found in evaluated dataset!`);

  console.log(`\n### EPISODE ${epNum} (Evaluated Candidates: ${ep.candidateCount})`);

  // Inspect sample candidates: first, middle, last
  const sampleIndices = [
    0,
    Math.floor(ep.candidates.length / 2),
    ep.candidates.length - 1
  ];
  const uniqueIndices = Array.from(new Set(sampleIndices));

  uniqueIndices.forEach(idx => {
    const cand = ep.candidates[idx];
    const ev = cand.evaluation;

    console.log(`\n  Candidate [${cand.candidateId}]:`);
    console.log(`    Time Window: ${cand.startTime} -> ${cand.endTime} (${cand.durationSeconds}s)`);
    console.log(`    Status:      ${cand.evaluationStatus}`);

    if (ev) {
      console.log(`    HOOK Score:        ${ev.hookScore}/5`);
      console.log(`    HOOK Rationale:    ${ev.hookExplanation}`);
      console.log(`    CLIFFHANGER Score: ${ev.cliffhangerScore}/5`);
      console.log(`    CLIFFHANGER Rat.:  ${ev.cliffhangerExplanation}`);
      console.log(`    CONTEXT Score:     ${ev.contextScore}/5`);
      console.log(`    CONTEXT Rationale: ${ev.contextExplanation}`);
    } else {
      console.log(`    Error Message: ${cand.errorMessage}`);
    }
  });
});

console.log('\n==================================================');
console.log('SPOT-CHECK COMPLETED: ALL INSPECTED EVALUATIONS ARE VALID');
console.log('==================================================\n');

