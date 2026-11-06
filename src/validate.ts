/**
 * Validation engine for KukuFM Microdrama Screenplay Parsing (Phase 1).
 *
 * Verifies data integrity, structural completeness, timestamp sanity,
 * and lack of empty or fabricated content across all 50 screenplay episodes.
 */

import type { Episode, ValidationIssue, ValidationResult } from './types.ts';

export interface ValidationInput {
  episodes: Episode[];
  discoveredFiles: string[];
  failedFiles: Array<{ file: string; error: string; episodeNumber?: number }>;
  expectedTotal?: number;
}

/**
 * Validates the parsed dataset against structural and domain rules.
 */
export function validateDataset(input: ValidationInput): ValidationResult {
  const { episodes, discoveredFiles, failedFiles, expectedTotal = 50 } = input;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Check raw file discovery count
  if (discoveredFiles.length !== expectedTotal) {
    errors.push({
      severity: 'error',
      message: `Expected ${expectedTotal} episode files, but discovered ${discoveredFiles.length}.`
    });
  }

  // Record any low-level file parsing failures
  failedFiles.forEach(f => {
    errors.push({
      severity: 'error',
      episodeNumber: f.episodeNumber,
      file: f.file,
      message: `Parsing failure: ${f.error}`
    });
  });

  // 2. Completeness & duplicate detection
  const seenNumbers = new Set<number>();
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();

  episodes.forEach(ep => {
    // Check duplicates
    if (seenNumbers.has(ep.episodeNumber)) {
      errors.push({
        severity: 'error',
        episodeNumber: ep.episodeNumber,
        file: ep.sourceFile,
        message: `Duplicate episode number detected: ${ep.episodeNumber}`
      });
    }
    seenNumbers.add(ep.episodeNumber);

    if (ep.episodeId && seenIds.has(ep.episodeId)) {
      warnings.push({
        severity: 'warning',
        episodeNumber: ep.episodeNumber,
        file: ep.sourceFile,
        message: `Duplicate internal episodeId detected: ${ep.episodeId}`
      });
    }
    if (ep.episodeId) seenIds.add(ep.episodeId);

    if (seenFiles.has(ep.sourceFile)) {
      errors.push({
        severity: 'error',
        episodeNumber: ep.episodeNumber,
        file: ep.sourceFile,
        message: `Duplicate source file processed: ${ep.sourceFile}`
      });
    }
    seenFiles.add(ep.sourceFile);

    // 3. Metadata validation
    if (!ep.metadata.logline || ep.metadata.logline.trim().length === 0) {
      errors.push({
        severity: 'error',
        episodeNumber: ep.episodeNumber,
        file: ep.sourceFile,
        message: 'Missing or empty EPISODE LOGLINE'
      });
    }

    if (!ep.metadata.continuityNotes || ep.metadata.continuityNotes.trim().length === 0) {
      errors.push({
        severity: 'error',
        episodeNumber: ep.episodeNumber,
        file: ep.sourceFile,
        message: 'Missing or empty CONTINUITY NOTES'
      });
    }

    // 4. Scene structure validation
    if (!ep.scenes || ep.scenes.length === 0) {
      errors.push({
        severity: 'error',
        episodeNumber: ep.episodeNumber,
        file: ep.sourceFile,
        message: 'Episode contains no scenes'
      });
      return;
    }

    if (ep.durationSeconds <= 0) {
      errors.push({
        severity: 'error',
        episodeNumber: ep.episodeNumber,
        file: ep.sourceFile,
        message: `Invalid total episode duration: ${ep.durationSeconds}s`
      });
    }

    // Validate scenes
    let previousSceneEnd = 0;
    ep.scenes.forEach((scene, scIdx) => {
      if (!scene.heading || scene.heading.trim().length === 0) {
        errors.push({
          severity: 'error',
          episodeNumber: ep.episodeNumber,
          file: ep.sourceFile,
          message: `Scene ${scene.sceneNumber} is missing a heading`
        });
      }

      if (!scene.startTime || !scene.endTime) {
        errors.push({
          severity: 'error',
          episodeNumber: ep.episodeNumber,
          file: ep.sourceFile,
          message: `Scene ${scene.sceneNumber} is missing start or end timestamp`
        });
      }

      if (scene.startSeconds > scene.endSeconds) {
        errors.push({
          severity: 'error',
          episodeNumber: ep.episodeNumber,
          file: ep.sourceFile,
          message: `Scene ${scene.sceneNumber} has negative duration (${scene.startTime} -> ${scene.endTime})`
        });
      }

      if (scIdx > 0 && scene.startSeconds < previousSceneEnd - 0.5) {
        warnings.push({
          severity: 'warning',
          episodeNumber: ep.episodeNumber,
          file: ep.sourceFile,
          message: `Scene ${scene.sceneNumber} start (${scene.startTime}) precedes previous scene end (${ep.scenes[scIdx - 1].endTime})`
        });
      }
      previousSceneEnd = scene.endSeconds;

      // 5. Elements validation
      if (!scene.elements || scene.elements.length === 0) {
        errors.push({
          severity: 'error',
          episodeNumber: ep.episodeNumber,
          file: ep.sourceFile,
          message: `Scene ${scene.sceneNumber} contains no screenplay elements`
        });
        return;
      }

      scene.elements.forEach(el => {
        if (!el.text || el.text.trim().length === 0) {
          errors.push({
            severity: 'error',
            episodeNumber: ep.episodeNumber,
            file: ep.sourceFile,
            message: `Element ${el.id} (${el.type}) has unintentionally empty text content`
          });
        }

        if (!el.startTime || !el.endTime) {
          errors.push({
            severity: 'error',
            episodeNumber: ep.episodeNumber,
            file: ep.sourceFile,
            message: `Element ${el.id} is missing timestamps`
          });
        }

        if (el.startSeconds > el.endSeconds) {
          errors.push({
            severity: 'error',
            episodeNumber: ep.episodeNumber,
            file: ep.sourceFile,
            message: `Element ${el.id} has inverted timestamps (${el.startTime} -> ${el.endTime})`
          });
        }

        if (el.type === 'dialogue') {
          if (!el.character || el.character.trim().length === 0) {
            errors.push({
              severity: 'error',
              episodeNumber: ep.episodeNumber,
              file: ep.sourceFile,
              message: `Dialogue element ${el.id} is missing character attribution`
            });
          }
        }
      });
    });
  });

  // Verify full 1..expectedTotal sequence
  for (let num = 1; num <= expectedTotal; num++) {
    if (!seenNumbers.has(num)) {
      errors.push({
        severity: 'error',
        episodeNumber: num,
        message: `Expected Episode ${num} is missing from parsed dataset.`
      });
    }
  }

  // Aggregate summary metrics
  let totalScenes = 0;
  let totalElements = 0;
  let totalDialogueBlocks = 0;
  let totalActionBlocks = 0;
  let totalCameraBlocks = 0;
  let totalSoundBlocks = 0;
  let totalDurationSeconds = 0;
  const uniqueCharacters = new Set<string>();

  episodes.forEach(ep => {
    totalDurationSeconds += ep.durationSeconds;
    totalScenes += ep.scenes.length;
    ep.scenes.forEach(sc => {
      totalElements += sc.elements.length;
      sc.elements.forEach(el => {
        if (el.type === 'dialogue') {
          totalDialogueBlocks++;
          if (el.character) uniqueCharacters.add(el.character);
        } else if (el.type === 'action') {
          totalActionBlocks++;
        } else if (el.type === 'camera') {
          totalCameraBlocks++;
        } else if (el.type === 'sound_fx') {
          totalSoundBlocks++;
        }
      });
    });
  });

  return {
    isValid: errors.length === 0,
    totalFilesFound: discoveredFiles.length,
    expectedEpisodes: expectedTotal,
    successfullyParsed: episodes.length,
    failedCount: failedFiles.length + (expectedTotal - episodes.length),
    errors,
    warnings,
    summary: {
      totalScenes,
      totalElements,
      totalDialogueBlocks,
      totalActionBlocks,
      totalCameraBlocks,
      totalSoundBlocks,
      totalDurationSeconds: Number(totalDurationSeconds.toFixed(2)),
      uniqueCharactersCount: uniqueCharacters.size
    }
  };
}

/**
 * Formats a clean, readable console report of the validation results.
 */
export function formatValidationReport(res: ValidationResult): string {
  const lines: string[] = [];
  lines.push('==================================================');
  lines.push('PHASE 1 — SCREENPLAY DATASET VALIDATION REPORT');
  lines.push('==================================================');
  lines.push(`Total files found:      ${res.totalFilesFound}`);
  lines.push(`Expected episodes:      ${res.expectedEpisodes}`);
  lines.push(`Successfully parsed:    ${res.successfullyParsed}`);
  lines.push(`Failed:                 ${res.failedCount}`);
  lines.push('--------------------------------------------------');
  lines.push(`Total scenes parsed:    ${res.summary.totalScenes}`);
  lines.push(`Total elements parsed:  ${res.summary.totalElements.toLocaleString()}`);
  lines.push(`  - Camera shots:       ${res.summary.totalCameraBlocks.toLocaleString()}`);
  lines.push(`  - Spoken dialogue:    ${res.summary.totalDialogueBlocks.toLocaleString()}`);
  lines.push(`  - Action beats:       ${res.summary.totalActionBlocks.toLocaleString()}`);
  lines.push(`  - Sound FX:           ${res.summary.totalSoundBlocks.toLocaleString()}`);
  lines.push(`Total series runtime:   ${res.summary.totalDurationSeconds.toFixed(2)}s (~${(res.summary.totalDurationSeconds / 60).toFixed(1)} mins)`);
  lines.push(`Unique characters:      ${res.summary.uniqueCharactersCount}`);
  lines.push('--------------------------------------------------');

  if (res.errors.length === 0 && res.warnings.length === 0) {
    lines.push('Status: PASSED (All validation checks completed with 0 errors, 0 warnings)');
  } else {
    if (res.errors.length > 0) {
      lines.push(`Status: FAILED with ${res.errors.length} error(s):`);
      res.errors.forEach(e => {
        const epInfo = e.episodeNumber ? ` [Episode ${e.episodeNumber}]` : '';
        const fileInfo = e.file ? ` (${e.file})` : '';
        lines.push(`  [ERROR]${epInfo}${fileInfo}: ${e.message}`);
      });
    }
    if (res.warnings.length > 0) {
      lines.push(`Warnings (${res.warnings.length}):`);
      res.warnings.forEach(w => {
        const epInfo = w.episodeNumber ? ` [Episode ${w.episodeNumber}]` : '';
        const fileInfo = w.file ? ` (${w.file})` : '';
        lines.push(`  [WARN]${epInfo}${fileInfo}: ${w.message}`);
      });
    }
  }
  lines.push('==================================================');
  return lines.join('\n');
}

