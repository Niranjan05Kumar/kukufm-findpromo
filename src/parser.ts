/**
 * KukuFM Microdrama Screenplay Parser (Phase 1).
 *
 * Reads 50 microdrama screenplay text files, extracts structured
 * scenes, dialogue, camera directions, action beats, and timestamps,
 * validates the parsed dataset, and writes data/parsed_episodes.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Episode,
  Scene,
  ScreenplayElement,
  ElementType,
  DatasetOutput
} from './types.ts';
import { validateDataset, formatValidationReport } from './validate.ts';

// Resolve directory paths relative to this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const EPISODES_DIR = path.join(PROJECT_ROOT, 'episodes');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'parsed_episodes.json');

/**
 * Converts MM:SS.ss (or MM:SS.sss) string into total seconds as a float.
 * Returns 0 if input is invalid or missing.
 */
export function parseTimestampToSeconds(ts: string): number {
  if (!ts) return 0;
  const clean = ts.trim().replace(/[()]/g, '');
  const match = clean.match(/^(\d{2}):(\d{2}(?:\.\d{1,4})?)$/);
  if (!match) return 0;
  const minutes = parseInt(match[1], 10);
  const seconds = parseFloat(match[2]);
  return Number((minutes * 60 + seconds).toFixed(3));
}

/**
 * Parses dialogue header such as:
 *   "MATRIARCH (Cold, Commanding):"
 *   "THE FORMER GROOM (Off-screen) (Dismissive):"
 *   "LADY JULIANA (O.S.) (Firm):"
 *
 * Extracts character name, separates off-screen status, and collects delivery notes.
 */
export function parseDialogueHeader(header: string): {
  character: string;
  delivery?: string;
  isOffScreen?: boolean;
} {
  const clean = header.replace(/:$/, '').trim();
  const parens: string[] = [];
  const parenRegex = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;

  while ((m = parenRegex.exec(clean)) !== null) {
    parens.push(m[1].trim());
  }

  // Character name is the portion outside all parentheticals
  const character = clean.replace(/\([^)]+\)/g, '').trim();

  let isOffScreen = false;
  const deliveryNotes: string[] = [];

  parens.forEach(p => {
    const lower = p.toLowerCase();
    if (
      lower === 'o.s.' ||
      lower === 'o.s' ||
      lower === 'off-screen' ||
      lower === 'off screen' ||
      lower === 'v.o.' ||
      lower === 'voiceover'
    ) {
      isOffScreen = true;
    } else {
      deliveryNotes.push(p);
    }
  });

  return {
    character: character || 'UNKNOWN',
    delivery: deliveryNotes.length > 0 ? deliveryNotes.join('; ') : undefined,
    isOffScreen: isOffScreen || undefined
  };
}

/**
 * Parses a single screenplay file into a structured Episode object.
 */
export function parseEpisodeFile(filePath: string, filename: string): Episode {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  // Parse episode number and internal id from filename:
  // e.g. "episode-001-Episode 1671703.txt"
  const filenameMatch = filename.match(/^episode-(\d{3})-Episode\s+(\d+)\.txt$/i);
  const filenameNum = filenameMatch ? parseInt(filenameMatch[1], 10) : 0;
  const episodeId = filenameMatch ? filenameMatch[2] : '';

  let headerEpisodeNum: number | null = null;
  let logline = '';
  let continuityNotes = '';

  let inScript = false;
  let currentScene: Scene | null = null;
  const scenes: Scene[] = [];
  let currentElement: ScreenplayElement | null = null;
  let elementIndexInEpisode = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Section 1: Metadata before --- SCRIPT START ---
    if (!inScript) {
      if (line.match(/^EPISODE NUMBER:/i)) {
        const numMatch = line.match(/^EPISODE NUMBER:\s*Episode\s+(\d+)/i);
        if (numMatch) headerEpisodeNum = parseInt(numMatch[1], 10);
      } else if (line.match(/^EPISODE LOGLINE:/i)) {
        logline = line.replace(/^EPISODE LOGLINE:\s*/i, '').trim();
      } else if (line.match(/^CONTINUITY NOTES:/i)) {
        continuityNotes = line.replace(/^CONTINUITY NOTES:\s*/i, '').trim();
      } else if (line === '--- SCRIPT START ---') {
        inScript = true;
      }
      continue;
    }

    // Section 2: End marker
    if (line === '--- SCRIPT END ---') {
      inScript = false;
      break;
    }

    // Section 3: Scene boundary detection (case-insensitive for robustness)
    const sceneMatch = line.match(/^SCENE\s+(\d+)/i);
    if (sceneMatch) {
      const scNum = parseInt(sceneMatch[1], 10);
      currentScene = {
        sceneNumber: scNum,
        heading: '',
        startTime: '',
        endTime: '',
        startSeconds: 0,
        endSeconds: 0,
        durationSeconds: 0,
        characters: [],
        elements: []
      };
      scenes.push(currentScene);
      currentElement = null;
      continue;
    }

    // Scene attributes
    if (line.match(/^scene heading:\s*/i)) {
      if (currentScene) currentScene.heading = line.replace(/^scene heading:\s*/i, '').trim();
      continue;
    }

    if (line.match(/^scene start:\s*/i)) {
      const st = line.replace(/^scene start:\s*/i, '').trim();
      if (currentScene) {
        currentScene.startTime = st;
        currentScene.startSeconds = parseTimestampToSeconds(st);
      }
      continue;
    }

    if (line.match(/^scene end:\s*/i)) {
      const et = line.replace(/^scene end:\s*/i, '').trim();
      if (currentScene) {
        currentScene.endTime = et;
        currentScene.endSeconds = parseTimestampToSeconds(et);
        currentScene.durationSeconds = Number((currentScene.endSeconds - currentScene.startSeconds).toFixed(3));
      }
      continue;
    }

    // Informational separator line (ignore)
    if (line.match(/^actions and dialogue:/i)) {
      continue;
    }

    // Section 4: Screenplay element block header: **HEADER**
    const blockMatch = line.match(/^\*\*([^*]+)\*\*$/);
    if (blockMatch) {
      elementIndexInEpisode++;
      const rawHeader = blockMatch[1].trim();
      const headerWithoutColon = rawHeader.replace(/:$/, '').trim();

      let blockType: ElementType = 'dialogue';
      let dialogueInfo: ReturnType<typeof parseDialogueHeader> | null = null;

      if (headerWithoutColon === 'CAMERA') {
        blockType = 'camera';
      } else if (headerWithoutColon === 'ACTION') {
        blockType = 'action';
      } else if (headerWithoutColon.startsWith('SOUND') || headerWithoutColon.startsWith('SFX')) {
        blockType = 'sound_fx';
      } else {
        blockType = 'dialogue';
        dialogueInfo = parseDialogueHeader(headerWithoutColon);
      }

      const epNum = filenameNum || headerEpisodeNum || 0;
      const scNum = currentScene ? currentScene.sceneNumber : 1;
      const elId = `ep${String(epNum).padStart(3, '0')}-sc${String(scNum).padStart(2, '0')}-el${String(elementIndexInEpisode).padStart(3, '0')}`;

      currentElement = {
        id: elId,
        type: blockType,
        startTime: '',
        endTime: '',
        startSeconds: 0,
        endSeconds: 0,
        durationSeconds: 0,
        text: '',
        ...(dialogueInfo ? {
          character: dialogueInfo.character,
          delivery: dialogueInfo.delivery,
          isOffScreen: dialogueInfo.isOffScreen
        } : {})
      };

      if (currentScene) {
        currentScene.elements.push(currentElement);
      }
      continue;
    }

    // Section 5: Element timestamp line: Start: (00:00.00) | End: (00:04.80)
    const timeMatch = line.match(/Start:\s*\(?(\d{2}:\d{2}(?:\.\d{1,4})?)\)?\s*\|\s*End:\s*\(?(\d{2}:\d{2}(?:\.\d{1,4})?)\)?/i);
    if (timeMatch && currentElement) {
      currentElement.startTime = timeMatch[1];
      currentElement.endTime = timeMatch[2];
      currentElement.startSeconds = parseTimestampToSeconds(timeMatch[1]);
      currentElement.endSeconds = parseTimestampToSeconds(timeMatch[2]);
      currentElement.durationSeconds = Number((currentElement.endSeconds - currentElement.startSeconds).toFixed(3));
      continue;
    }

    // Section 6: Element content text
    if (line !== '' && currentElement) {
      let textChunk = line;
      if (currentElement.type === 'dialogue') {
        // Strip outermost quotes if present
        if (textChunk.startsWith('"') && textChunk.endsWith('"') && textChunk.length >= 2) {
          textChunk = textChunk.slice(1, -1);
        }
      }

      if (!currentElement.text) {
        currentElement.text = textChunk;
      } else {
        currentElement.text += ` ${textChunk}`;
      }
    }
  }

  // Populate per-scene and per-episode character lists
  const episodeCharactersSet = new Set<string>();
  scenes.forEach(sc => {
    const scCharSet = new Set<string>();
    sc.elements.forEach(el => {
      if (el.type === 'dialogue' && el.character) {
        scCharSet.add(el.character);
        episodeCharactersSet.add(el.character);
      }
    });
    sc.characters = Array.from(scCharSet).sort();
  });

  const episodeStart = scenes.length > 0 ? scenes[0].startTime : '00:00.00';
  const episodeEnd = scenes.length > 0 ? scenes[scenes.length - 1].endTime : '00:00.00';
  const startSec = parseTimestampToSeconds(episodeStart);
  const endSec = parseTimestampToSeconds(episodeEnd);

  // Compute episode stats
  let totalDialogue = 0;
  let totalAction = 0;
  let totalCamera = 0;
  let totalSound = 0;
  let totalElements = 0;

  scenes.forEach(sc => {
    totalElements += sc.elements.length;
    sc.elements.forEach(el => {
      if (el.type === 'dialogue') totalDialogue++;
      else if (el.type === 'action') totalAction++;
      else if (el.type === 'camera') totalCamera++;
      else if (el.type === 'sound_fx') totalSound++;
    });
  });

  const finalEpisodeNum = filenameNum || headerEpisodeNum || 0;

  return {
    episodeNumber: finalEpisodeNum,
    episodeId,
    sourceFile: filename,
    metadata: {
      logline,
      continuityNotes
    },
    startTime: episodeStart,
    endTime: episodeEnd,
    startSeconds: startSec,
    endSeconds: endSec,
    durationSeconds: Number((endSec - startSec).toFixed(3)),
    characters: Array.from(episodeCharactersSet).sort(),
    stats: {
      sceneCount: scenes.length,
      elementCount: totalElements,
      dialogueCount: totalDialogue,
      actionCount: totalAction,
      cameraCount: totalCamera,
      soundCount: totalSound
    },
    scenes
  };
}

/**
 * Main execution function:
 * 1. Reads the episodes folder
 * 2. Parses all 50 screenplay files
 * 3. Validates the parsed data
 * 4. Generates data/parsed_episodes.json
 * 5. Prints summary report
 */
export function run(): { success: boolean; outputFilePath: string } {
  console.log(`\nScanning screenplay files in: ${EPISODES_DIR}...`);

  if (!fs.existsSync(EPISODES_DIR)) {
    console.error(`ERROR: Directory not found: ${EPISODES_DIR}`);
    process.exit(1);
  }

  const rawFiles = fs.readdirSync(EPISODES_DIR)
    .filter(f => f.toLowerCase().endsWith('.txt'))
    .sort();

  console.log(`Discovered ${rawFiles.length} screenplay file(s).`);

  const parsedEpisodes: Episode[] = [];
  const failedFiles: Array<{ file: string; error: string; episodeNumber?: number }> = [];

  rawFiles.forEach(file => {
    const fullPath = path.join(EPISODES_DIR, file);
    try {
      const episode = parseEpisodeFile(fullPath, file);
      parsedEpisodes.push(episode);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to parse file: ${file} - ${errorMsg}`);
      failedFiles.push({ file, error: errorMsg });
    }
  });

  // Sort episodes in ascending order of episode number
  parsedEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

  // Validate the entire parsed dataset
  const validationResult = validateDataset({
    episodes: parsedEpisodes,
    discoveredFiles: rawFiles,
    failedFiles,
    expectedTotal: 50
  });

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Generate structured output
  const outputData: DatasetOutput = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalEpisodes: parsedEpisodes.length,
    summary: validationResult.summary,
    episodes: parsedEpisodes
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`Structured output written to: ${OUTPUT_FILE}`);

  // Print validation report
  console.log('\n' + formatValidationReport(validationResult) + '\n');

  return {
    success: validationResult.isValid,
    outputFilePath: OUTPUT_FILE
  };
}

// Execute when run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const result = run();
  if (!result.success) {
    process.exit(1);
  }
}

