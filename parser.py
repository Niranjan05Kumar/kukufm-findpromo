#!/usr/bin/env python3
"""
KukuFM Microdrama Screenplay Parser (Phase 1) - Python Implementation.

Reads the 50 microdrama screenplay text files from episodes/,
extracts structured scenes, dialogue, camera directions, action beats,
and timestamps, validates dataset integrity, and writes data/parsed_episodes.json.
"""

import os
import re
import json
from datetime import datetime, timezone

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
EPISODES_DIR = os.path.join(PROJECT_ROOT, "episodes")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "parsed_episodes.json")


def parse_timestamp_to_seconds(ts_str):
    """Converts MM:SS.ss string to total seconds as float."""
    if not ts_str:
        return 0.0
    clean = ts_str.strip().strip("()")
    match = re.match(r"^(\d{2}):(\d{2}(?:\.\d{1,4})?)$", clean)
    if not match:
        return 0.0
    minutes = int(match.group(1))
    seconds = float(match.group(2))
    return round(minutes * 60.0 + seconds, 3)


def parse_dialogue_header(header):
    """
    Parses dialogue header, e.g.:
      "MATRIARCH (Cold, Commanding):"
      "THE FORMER GROOM (Off-screen) (Dismissive):"
      "LADY JULIANA (O.S.) (Firm):"
    Returns character name, delivery modifier string, and is_off_screen bool.
    """
    clean = header.rstrip(":").strip()
    parens = re.findall(r"\(([^)]+)\)", clean)
    character = re.sub(r"\([^)]+\)", "", clean).strip()

    is_off_screen = False
    delivery_notes = []

    for p in parens:
        lower = p.strip().lower()
        if lower in {"o.s.", "o.s", "off-screen", "off screen", "v.o.", "voiceover"}:
            is_off_screen = True
        else:
            delivery_notes.append(p.strip())

    return {
        "character": character or "UNKNOWN",
        "delivery": "; ".join(delivery_notes) if delivery_notes else None,
        "is_off_screen": is_off_screen if is_off_screen else None,
    }


def parse_episode_file(file_path, filename):
    """Parses a single screenplay file into a structured episode dictionary."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()

    # Filename format: episode-001-Episode 1671703.txt
    filename_match = re.match(r"^episode-(\d{3})-Episode\s+(\d+)\.txt$", filename, re.IGNORECASE)
    filename_num = int(filename_match.group(1)) if filename_match else 0
    episode_id = filename_match.group(2) if filename_match else ""

    header_episode_num = None
    logline = ""
    continuity_notes = ""

    in_script = False
    current_scene = None
    scenes = []
    current_element = None
    element_index_in_episode = 0

    for raw_line in lines:
        line = raw_line.strip()

        # Section 1: Pre-script metadata
        if not in_script:
            if re.match(r"^EPISODE NUMBER:", line, re.IGNORECASE):
                num_match = re.search(r"Episode\s+(\d+)", line, re.IGNORECASE)
                if num_match:
                    header_episode_num = int(num_match.group(1))
            elif re.match(r"^EPISODE LOGLINE:", line, re.IGNORECASE):
                logline = re.sub(r"^EPISODE LOGLINE:\s*", "", line, flags=re.IGNORECASE).strip()
            elif re.match(r"^CONTINUITY NOTES:", line, re.IGNORECASE):
                continuity_notes = re.sub(r"^CONTINUITY NOTES:\s*", "", line, flags=re.IGNORECASE).strip()
            elif line == "--- SCRIPT START ---":
                in_script = True
            continue

        # Section 2: End marker
        if line == "--- SCRIPT END ---":
            in_script = False
            break

        # Section 3: Scene boundary detection
        scene_match = re.match(r"^SCENE\s+(\d+)", line, re.IGNORECASE)
        if scene_match:
            sc_num = int(scene_match.group(1))
            current_scene = {
                "sceneNumber": sc_num,
                "heading": "",
                "startTime": "",
                "endTime": "",
                "startSeconds": 0.0,
                "endSeconds": 0.0,
                "durationSeconds": 0.0,
                "characters": [],
                "elements": [],
            }
            scenes.append(current_scene)
            current_element = None
            continue

        # Scene metadata lines
        if re.match(r"^scene heading:\s*", line, re.IGNORECASE):
            if current_scene:
                current_scene["heading"] = re.sub(r"^scene heading:\s*", "", line, flags=re.IGNORECASE).strip()
            continue

        if re.match(r"^scene start:\s*", line, re.IGNORECASE):
            st = re.sub(r"^scene start:\s*", "", line, flags=re.IGNORECASE).strip()
            if current_scene:
                current_scene["startTime"] = st
                current_scene["startSeconds"] = parse_timestamp_to_seconds(st)
            continue

        if re.match(r"^scene end:\s*", line, re.IGNORECASE):
            et = re.sub(r"^scene end:\s*", "", line, flags=re.IGNORECASE).strip()
            if current_scene:
                current_scene["endTime"] = et
                current_scene["endSeconds"] = parse_timestamp_to_seconds(et)
                current_scene["durationSeconds"] = round(current_scene["endSeconds"] - current_scene["startSeconds"], 3)
            continue

        if re.match(r"^actions and dialogue:", line, re.IGNORECASE):
            continue

        # Section 4: Screenplay element block header: **HEADER**
        block_match = re.match(r"^\*\*([^*]+)\*\*$", line)
        if block_match:
            element_index_in_episode += 1
            raw_header = block_match.group(1).strip()
            header_clean = raw_header.rstrip(":").strip()

            block_type = "dialogue"
            dialogue_info = None

            if header_clean == "CAMERA":
                block_type = "camera"
            elif header_clean == "ACTION":
                block_type = "action"
            elif header_clean.startswith("SOUND") or header_clean.startswith("SFX"):
                block_type = "sound_fx"
            else:
                block_type = "dialogue"
                dialogue_info = parse_dialogue_header(header_clean)

            ep_num = filename_num or header_episode_num or 0
            sc_num = current_scene["sceneNumber"] if current_scene else 1
            el_id = f"ep{ep_num:03d}-sc{sc_num:02d}-el{element_index_in_episode:03d}"

            current_element = {
                "id": el_id,
                "type": block_type,
                "startTime": "",
                "endTime": "",
                "startSeconds": 0.0,
                "endSeconds": 0.0,
                "durationSeconds": 0.0,
                "text": "",
            }

            if dialogue_info:
                current_element["character"] = dialogue_info["character"]
                if dialogue_info["delivery"]:
                    current_element["delivery"] = dialogue_info["delivery"]
                if dialogue_info["is_off_screen"]:
                    current_element["isOffScreen"] = True

            if current_scene:
                current_scene["elements"].append(current_element)
            continue

        # Section 5: Element timestamp line
        time_match = re.match(r"Start:\s*\(?(\d{2}:\d{2}(?:\.\d{1,4})?)\)?\s*\|\s*End:\s*\(?(\d{2}:\d{2}(?:\.\d{1,4})?)\)?", line, re.IGNORECASE)
        if time_match and current_element:
            st_str = time_match.group(1)
            et_str = time_match.group(2)
            current_element["startTime"] = st_str
            current_element["endTime"] = et_str
            current_element["startSeconds"] = parse_timestamp_to_seconds(st_str)
            current_element["endSeconds"] = parse_timestamp_to_seconds(et_str)
            current_element["durationSeconds"] = round(current_element["endSeconds"] - current_element["startSeconds"], 3)
            continue

        # Section 6: Element content line
        if line != "" and current_element:
            text_chunk = line
            if current_element["type"] == "dialogue":
                if text_chunk.startswith('"') and text_chunk.endswith('"') and len(text_chunk) >= 2:
                    text_chunk = text_chunk[1:-1]

            if not current_element["text"]:
                current_element["text"] = text_chunk
            else:
                current_element["text"] += f" {text_chunk}"

    # Character sets per scene and episode
    ep_characters = set()
    for sc in scenes:
        sc_chars = set()
        for el in sc["elements"]:
            if el["type"] == "dialogue" and "character" in el:
                sc_chars.add(el["character"])
                ep_characters.add(el["character"])
        sc["characters"] = sorted(list(sc_chars))

    ep_start = scenes[0]["startTime"] if scenes else "00:00.00"
    ep_end = scenes[-1]["endTime"] if scenes else "00:00.00"
    start_sec = parse_timestamp_to_seconds(ep_start)
    end_sec = parse_timestamp_to_seconds(ep_end)

    # Element stats
    total_elements = 0
    total_dialogue = 0
    total_action = 0
    total_camera = 0
    total_sound = 0

    for sc in scenes:
        total_elements += len(sc["elements"])
        for el in sc["elements"]:
            t = el["type"]
            if t == "dialogue":
                total_dialogue += 1
            elif t == "action":
                total_action += 1
            elif t == "camera":
                total_camera += 1
            elif t == "sound_fx":
                total_sound += 1

    final_ep_num = filename_num or header_episode_num or 0

    return {
        "episodeNumber": final_ep_num,
        "episodeId": episode_id,
        "sourceFile": filename,
        "metadata": {
            "logline": logline,
            "continuityNotes": continuity_notes,
        },
        "startTime": ep_start,
        "endTime": ep_end,
        "startSeconds": start_sec,
        "endSeconds": end_sec,
        "durationSeconds": round(end_sec - start_sec, 3),
        "characters": sorted(list(ep_characters)),
        "stats": {
            "sceneCount": len(scenes),
            "elementCount": total_elements,
            "dialogueCount": total_dialogue,
            "actionCount": total_action,
            "cameraCount": total_camera,
            "soundCount": total_sound,
        },
        "scenes": scenes,
    }


def validate_episodes(episodes, discovered_files, failed_files, expected_total=50):
    """Validates structural completeness and rules."""
    errors = []
    warnings = []

    if len(discovered_files) != expected_total:
        errors.append(f"Expected {expected_total} files, found {len(discovered_files)}.")

    for f in failed_files:
        errors.append(f"Parsing failure in {f['file']}: {f['error']}")

    seen_numbers = set()
    for ep in episodes:
        num = ep["episodeNumber"]
        if num in seen_numbers:
            errors.append(f"Duplicate episode number detected: {num}")
        seen_numbers.add(num)

        if not ep["metadata"]["logline"]:
            errors.append(f"Episode {num}: Missing logline")
        if not ep["metadata"]["continuityNotes"]:
            errors.append(f"Episode {num}: Missing continuity notes")
        if not ep["scenes"]:
            errors.append(f"Episode {num}: Contains no scenes")

        for sc in ep["scenes"]:
            if not sc["heading"]:
                errors.append(f"Episode {num} Scene {sc['sceneNumber']}: Missing heading")
            if not sc["elements"]:
                errors.append(f"Episode {num} Scene {sc['sceneNumber']}: No elements found")
            for el in sc["elements"]:
                if not el["text"]:
                    errors.append(f"Episode {num} Element {el['id']}: Empty text")
                if not el["startTime"] or not el["endTime"]:
                    errors.append(f"Episode {num} Element {el['id']}: Missing timestamps")
                if el["type"] == "dialogue" and not el.get("character"):
                    errors.append(f"Episode {num} Element {el['id']}: Dialogue missing character")

    for n in range(1, expected_total + 1):
        if n not in seen_numbers:
            errors.append(f"Expected Episode {n} is missing from dataset.")

    # Aggregate metrics
    total_scenes = sum(len(e["scenes"]) for e in episodes)
    total_elements = sum(e["stats"]["elementCount"] for e in episodes)
    total_dialogue = sum(e["stats"]["dialogueCount"] for e in episodes)
    total_action = sum(e["stats"]["actionCount"] for e in episodes)
    total_camera = sum(e["stats"]["cameraCount"] for e in episodes)
    total_sound = sum(e["stats"]["soundCount"] for e in episodes)
    total_duration = round(sum(e["durationSeconds"] for e in episodes), 2)
    all_unique_chars = set()
    for e in episodes:
        all_unique_chars.update(e["characters"])

    summary = {
        "totalScenes": total_scenes,
        "totalElements": total_elements,
        "totalDialogueBlocks": total_dialogue,
        "totalActionBlocks": total_action,
        "totalCameraBlocks": total_camera,
        "totalSoundBlocks": total_sound,
        "totalDurationSeconds": total_duration,
        "uniqueCharactersCount": len(all_unique_chars),
    }

    return {
        "is_valid": len(errors) == 0,
        "total_files": len(discovered_files),
        "expected_episodes": expected_total,
        "successfully_parsed": len(episodes),
        "failed_count": len(failed_files) + (expected_total - len(episodes)),
        "errors": errors,
        "warnings": warnings,
        "summary": summary,
    }


def print_report(res):
    """Prints formatted summary table."""
    s = res["summary"]
    print("==================================================")
    print("PHASE 1 — SCREENPLAY DATASET VALIDATION REPORT")
    print("==================================================")
    print(f"Total files found:      {res['total_files']}")
    print(f"Expected episodes:      {res['expected_episodes']}")
    print(f"Successfully parsed:    {res['successfully_parsed']}")
    print(f"Failed:                 {res['failed_count']}")
    print("--------------------------------------------------")
    print(f"Total scenes parsed:    {s['totalScenes']}")
    print(f"Total elements parsed:  {s['totalElements']:,}")
    print(f"  - Camera shots:       {s['totalCameraBlocks']:,}")
    print(f"  - Spoken dialogue:    {s['totalDialogueBlocks']:,}")
    print(f"  - Action beats:       {s['totalActionBlocks']:,}")
    print(f"  - Sound FX:           {s['totalSoundBlocks']:,}")
    print(f"Total series runtime:   {s['totalDurationSeconds']}s (~{s['totalDurationSeconds']/60:.1f} mins)")
    print(f"Unique characters:      {s['uniqueCharactersCount']}")
    print("--------------------------------------------------")
    if res["is_valid"]:
        print("Status: PASSED (All validation checks completed with 0 errors, 0 warnings)")
    else:
        print(f"Status: FAILED with {len(res['errors'])} error(s):")
        for err in res["errors"]:
            print(f"  [ERROR] {err}")
    print("==================================================")


def main():
    print(f"\nScanning screenplay files in: {EPISODES_DIR}...")
    if not os.path.exists(EPISODES_DIR):
        print(f"ERROR: Directory not found: {EPISODES_DIR}")
        return 1

    raw_files = sorted([f for f in os.listdir(EPISODES_DIR) if f.lower().endswith(".txt")])
    print(f"Discovered {len(raw_files)} screenplay file(s).")

    parsed_episodes = []
    failed_files = []

    for f in raw_files:
        full_path = os.path.join(EPISODES_DIR, f)
        try:
            ep = parse_episode_file(full_path, f)
            parsed_episodes.append(ep)
        except Exception as e:
            print(f"Failed to parse {f}: {e}")
            failed_files.append({"file": f, "error": str(e)})

    parsed_episodes.sort(key=lambda x: x["episodeNumber"])

    val_res = validate_episodes(parsed_episodes, raw_files, failed_files, expected_total=50)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_data = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalEpisodes": len(parsed_episodes),
        "summary": val_res["summary"],
        "episodes": parsed_episodes,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out_f:
        json.dump(output_data, out_f, indent=2, ensure_ascii=False)

    print(f"Structured output written to: {OUTPUT_FILE}\n")
    print_report(val_res)

    return 0 if val_res["is_valid"] else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())

