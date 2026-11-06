import fs from 'node:fs';
import path from 'node:path';
import type { DatasetOutput, Episode } from './types.ts';

const jsonPath = path.resolve('data/parsed_episodes.json');
const rawJson = fs.readFileSync(jsonPath, 'utf-8');
const data: DatasetOutput = JSON.parse(rawJson);

console.log('=== VERIFYING PARSED DATASET ===');
console.log(`Version: ${data.version}`);
console.log(`Generated At: ${data.generatedAt}`);
console.log(`Total Episodes: ${data.totalEpisodes}`);

if (data.episodes.length !== 50) {
  throw new Error(`Expected 50 episodes in JSON, found ${data.episodes.length}`);
}

// Check sample episodes across the series
const sampleIndices = [1, 6, 18, 25, 39, 50];

sampleIndices.forEach(epNum => {
  const ep = data.episodes.find(e => e.episodeNumber === epNum);
  if (!ep) throw new Error(`Episode ${epNum} not found in parsed data!`);

  console.log(`\n--- Episode ${ep.episodeNumber} (${ep.sourceFile}) ---`);
  console.log(`ID: ${ep.episodeId}`);
  console.log(`Logline: ${ep.metadata.logline.slice(0, 80)}...`);
  console.log(`Runtime: ${ep.startTime} -> ${ep.endTime} (${ep.durationSeconds}s)`);
  console.log(`Scenes (${ep.scenes.length}):`);
  ep.scenes.forEach(s => {
    console.log(`  Scene ${s.sceneNumber}: "${s.heading}" [${s.startTime} - ${s.endTime}] (${s.elements.length} elements)`);
  });
  console.log(`Stats: ${ep.stats.dialogueCount} dialogue, ${ep.stats.cameraCount} camera, ${ep.stats.actionCount} action, ${ep.stats.soundCount} sound`);
  console.log(`Speaking characters (${ep.characters.length}): ${ep.characters.join(', ')}`);

  // Spot check first and last element of first scene
  const firstEl = ep.scenes[0].elements[0];
  const lastScene = ep.scenes[ep.scenes.length - 1];
  const lastEl = lastScene.elements[lastScene.elements.length - 1];
  console.log(`  First element: [${firstEl.type}] ${firstEl.startTime}-${firstEl.endTime} | "${firstEl.text.slice(0, 50)}..."`);
  console.log(`  Last element:  [${lastEl.type}] ${lastEl.startTime}-${lastEl.endTime} | "${lastEl.text.slice(0, 50)}..."`);
});

console.log('\n=== ALL MANUAL SPOT-CHECKS PASSED ===');

