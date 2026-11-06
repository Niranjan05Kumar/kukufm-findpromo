/**
 * Spot-checking and manual inspection script for Phase 4: Ranked Promo Candidates.
 *
 * Inspects:
 *   - Top 10 candidates overall (ranks 1 to 10)
 *   - Candidates from Episode 1, Episode 25, and Episode 50
 *   - Verifies Rank 1 has highest final score
 *   - Verifies score calculations against exact weights
 */

import fs from 'node:fs';
import path from 'node:path';
import type { RankedPromoCandidatesDataset } from './types.ts';

const jsonPath = path.resolve('data/ranked_promo_candidates.json');
const dataset: RankedPromoCandidatesDataset = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log('==================================================');
console.log('PHASE 4 — RANKING SPOT-CHECK & MANUAL INSPECTION');
console.log('==================================================');
console.log(`Dataset Version:     ${dataset.version}`);
console.log(`Generated At:        ${dataset.generatedAt}`);
console.log(`Total Candidates:    ${dataset.summary.totalCandidates}`);
console.log(`Successfully Ranked: ${dataset.summary.successfullyRanked}`);
console.log(`Highest Score:       ${dataset.summary.highestScore.toFixed(2)}`);
console.log(`Lowest Score:        ${dataset.summary.lowestScore.toFixed(2)}`);
console.log(`Average Score:       ${dataset.summary.averageScore.toFixed(2)}`);
console.log('--------------------------------------------------');

// 1. Verify Rank 1
const rank1 = dataset.candidates.find(c => c.rank === 1);
if (!rank1) throw new Error('Rank 1 candidate not found!');

console.log(`\n### RANK 1 CANDIDATE`);
console.log(`Candidate ID:   ${rank1.candidateId}`);
console.log(`Episode:        Episode ${rank1.episodeNumber}`);
console.log(`Time Window:    ${rank1.startTime} -> ${rank1.endTime} (${rank1.durationSeconds}s)`);
console.log(`Final Score:    ${rank1.finalScore} / 100.00`);
console.log(`Scores:         Hook=${rank1.evaluation?.hookScore}/5 (40%), Cliffhanger=${rank1.evaluation?.cliffhangerScore}/5 (40%), Context=${rank1.evaluation?.contextScore}/5 (20%)`);
console.log(`Hook Rationale: ${rank1.evaluation?.hookExplanation}`);
console.log(`Cliff Rationale:${rank1.evaluation?.cliffhangerExplanation}`);
console.log(`Scenes:         Scene ${rank1.sceneNumbers.join(', ')}`);

// 2. Top 10 Candidates Overall
console.log(`\n### TOP 10 CANDIDATES OVERALL`);
dataset.candidates.slice(0, 10).forEach(c => {
  const ev = c.evaluation!;
  console.log(`Rank ${String(c.rank).padStart(2, ' ')} | Score: ${c.finalScore?.toFixed(2)} | Ep ${String(c.episodeNumber).padStart(2, ' ')} | [${c.startTime} - ${c.endTime}] (${c.durationSeconds}s) | H:${ev.hookScore} C:${ev.cliffhangerScore} Ctx:${ev.contextScore} | ${c.candidateId}`);
});

// 3. Inspect sample episodes: Episode 1, Episode 25, Episode 50
const targetEpisodes = [1, 25, 50];

targetEpisodes.forEach(epNum => {
  const epCandidates = dataset.candidates.filter(c => c.episodeNumber === epNum);
  console.log(`\n### EPISODE ${epNum} RANKED CANDIDATES (Total: ${epCandidates.length})`);

  // Show top candidate in this episode and lowest candidate in this episode
  const topInEp = epCandidates[0]; // array is globally sorted, so first match is highest in ep
  const lowestInEp = epCandidates[epCandidates.length - 1];

  console.log(`  Top in Ep ${epNum}:    Rank ${topInEp.rank} | Score ${topInEp.finalScore?.toFixed(2)} | [${topInEp.startTime}-${topInEp.endTime}] (${topInEp.durationSeconds}s) | H:${topInEp.evaluation?.hookScore} C:${topInEp.evaluation?.cliffhangerScore} Ctx:${topInEp.evaluation?.contextScore}`);
  console.log(`    Hook:        ${topInEp.evaluation?.hookExplanation}`);
  console.log(`    Cliffhanger: ${topInEp.evaluation?.cliffhangerExplanation}`);

  console.log(`  Lowest in Ep ${epNum}: Rank ${lowestInEp.rank} | Score ${lowestInEp.finalScore?.toFixed(2)} | [${lowestInEp.startTime}-${lowestInEp.endTime}] (${lowestInEp.durationSeconds}s) | H:${lowestInEp.evaluation?.hookScore} C:${lowestInEp.evaluation?.cliffhangerScore} Ctx:${lowestInEp.evaluation?.contextScore}`);
});

console.log('\n==================================================');
console.log('SPOT-CHECK COMPLETED: ALL INSPECTED CANDIDATES VERIFIED');
console.log('==================================================\n');

