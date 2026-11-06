/**
 * Pure Screenplay Parser Core (Browser & Node.js compatible).
 * Zero filesystem dependencies.
 */

import type {
  Episode,
  Scene,
  ScreenplayElement,
  ElementType
} from './types.ts';

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

  const rawName = clean.replace(parenRegex, '').trim();

  let isOffScreen = false;
  const deliveryNotes: string[] = [];

  for (const p of parens) {
    const lower = p.toLowerCase();
    if (lower === 'o.s.' || lower === 'os' || lower === 'off-screen' || lower === 'off screen') {
      isOffScreen = true;
    } else {
      deliveryNotes.push(p);
    }
  }

  return {
    character: rawName || 'UNKNOWN',
    delivery: deliveryNotes.length > 0 ? deliveryNotes.join('; ') : undefined,
    isOffScreen: isOffScreen || undefined
  };
}

/**
 * Parses raw screenplay text content into a structured Episode object.
 */
export function parseEpisodeContent(content: string, filename: string): Episode {
  const lines = content.split(/\r?\n/);

  // Parse episode number and internal id from filename:
  // e.g. "episode-001-Episode 1671703.txt"
  const filenameMatch = filename.match(/^episode-(\d{3})-Episode\s+(\d+)\.txt$/i);
  const generalNumMatch = filename.match(/episode[-_ ]0*(\d+)/i);
  const filenameNum = filenameMatch
    ? parseInt(filenameMatch[1], 10)
    : generalNumMatch
    ? parseInt(generalNumMatch[1], 10)
    : 0;
  const episodeId = filenameMatch ? filenameMatch[2] : (generalNumMatch ? generalNumMatch[1] : 'uploaded');

  let headerEpisodeNum: number | null = null;
  let logline = '';
  let continuityNotes = '';

  // Check if explicit script boundary markers exist
  const hasScriptStartMarker = lines.some(l => l.trim() === '--- SCRIPT START ---');
  let inScript = !hasScriptStartMarker; // If marker not present, start immediately

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

    // Metadata if inline
    if (line.match(/^EPISODE\s+(\d+)/i)) {
      const match = line.match(/^EPISODE\s+(\d+)/i);
      if (match) headerEpisodeNum = parseInt(match[1], 10);
      continue;
    }
    if (line.match(/^LOGLINE:/i)) {
      logline = line.replace(/^LOGLINE:\s*/i, '').trim();
      continue;
    }
    if (line.match(/^CONTINUITY NOTES:/i)) {
      continuityNotes = line.replace(/^CONTINUITY NOTES:\s*/i, '').trim();
      continue;
    }

    // Section 3: Scene boundary detection (e.g. "SCENE 1" or "Scene heading:")
    const sceneMatch = line.match(/^SCENE\s+(\d+)/i);
    const sceneHeadingOnlyMatch = line.match(/^(?:scene heading|SCENE HEADING):\s*(.+)$/i);

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
    } else if (sceneHeadingOnlyMatch && (!currentScene || currentScene.elements.length > 0)) {
      // Scene heading encountered without prior SCENE N marker
      currentScene = {
        sceneNumber: scenes.length + 1,
        heading: sceneHeadingOnlyMatch[1].trim(),
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

    // Section 4: Screenplay element block header: **HEADER** or **HEADER:**
    const blockMatch = line.match(/^\*\*([^*]+)\*\*:?$/);
    if (blockMatch) {
      elementIndexInEpisode++;
      const rawHeader = blockMatch[1].trim();
      const headerWithoutColon = rawHeader.replace(/:$/, '').trim();

      let blockType: ElementType = 'dialogue';
      let dialogueInfo: ReturnType<typeof parseDialogueHeader> | null = null;

      if (headerWithoutColon.toUpperCase() === 'CAMERA') {
        blockType = 'camera';
      } else if (headerWithoutColon.toUpperCase() === 'ACTION') {
        blockType = 'action';
      } else if (headerWithoutColon.toUpperCase() === 'SOUND FX' || headerWithoutColon.toUpperCase() === 'SOUND EFFECT' || headerWithoutColon.toUpperCase() === 'SFX') {
        blockType = 'sound_fx';
      } else {
        blockType = 'dialogue';
        dialogueInfo = parseDialogueHeader(headerWithoutColon);
      }

      // If elements appear before any explicit scene heading, create a default scene
      if (!currentScene) {
        currentScene = {
          sceneNumber: 1,
          heading: 'SCENE 1',
          startTime: '00:00.00',
          endTime: '00:00.00',
          startSeconds: 0,
          endSeconds: 0,
          durationSeconds: 0,
          characters: [],
          elements: []
        };
        scenes.push(currentScene);
      }

      const epPrefix = `ep${String(filenameNum || headerEpisodeNum || 1).padStart(3, '0')}`;
      const scPrefix = `sc${String(currentScene.sceneNumber).padStart(2, '0')}`;
      const elPrefix = `el${String(elementIndexInEpisode).padStart(3, '0')}`;
      const elementId = `${epPrefix}-${scPrefix}-${elPrefix}`;

      currentElement = {
        id: elementId,
        type: blockType,
        startTime: '',
        endTime: '',
        startSeconds: 0,
        endSeconds: 0,
        durationSeconds: 0,
        text: '',
        character: dialogueInfo?.character,
        delivery: dialogueInfo?.delivery,
        isOffScreen: dialogueInfo?.isOffScreen
      };

      currentScene.elements.push(currentElement);
      continue;
    }

    // Section 5: Element timing line: Start: (MM:SS.ss) | End: (MM:SS.ss)
    const timeMatch = line.match(/^Start:\s*\(?(\d{2}:\d{2}(?:\.\d{1,4})?)\)?\s*\|\s*End:\s*\(?(\d{2}:\d{2}(?:\.\d{1,4})?)\)?/i);
    if (timeMatch && currentElement) {
      currentElement.startTime = timeMatch[1];
      currentElement.endTime = timeMatch[2];
      currentElement.startSeconds = parseTimestampToSeconds(timeMatch[1]);
      currentElement.endSeconds = parseTimestampToSeconds(timeMatch[2]);
      currentElement.durationSeconds = Number((currentElement.endSeconds - currentElement.startSeconds).toFixed(3));
      continue;
    }

    // Section 6: Element content body line
    if (line !== '' && currentElement) {
      let cleanText = line;
      if (currentElement.type === 'dialogue') {
        // Strip outer quotes if present
        if (cleanText.startsWith('"') && cleanText.endsWith('"') && cleanText.length >= 2) {
          cleanText = cleanText.slice(1, -1);
        }
      }

      if (!currentElement.text) {
        currentElement.text = cleanText;
      } else {
        currentElement.text += ` ${cleanText}`;
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

    // Fix scene start/end if empty
    if (!sc.startTime && sc.elements.length > 0) {
      sc.startTime = sc.elements[0].startTime;
      sc.startSeconds = sc.elements[0].startSeconds;
    }
    if (!sc.endTime && sc.elements.length > 0) {
      sc.endTime = sc.elements[sc.elements.length - 1].endTime;
      sc.endSeconds = sc.elements[sc.elements.length - 1].endSeconds;
      sc.durationSeconds = Number((sc.endSeconds - sc.startSeconds).toFixed(3));
    }
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

export const parseScreenplay = parseEpisodeContent;
