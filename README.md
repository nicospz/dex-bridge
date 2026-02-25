# DexBridge

DexBridge is a fast single-page Pokédex search app built with Vite + React + TypeScript.

It supports:
- instant direct search across English, Japanese, roomaji, and aliases
- fuzzy fallback search with Fuse.js
- kana/romaji normalization with wanakana
- paste-text mode to detect multiple Pokémon names in long text

## Tech Stack

- Vite
- React 18
- TypeScript
- [fuse.js](https://www.npmjs.com/package/fuse.js)
- [wanakana](https://www.npmjs.com/package/wanakana)

## Data Source

The app reads local JSON data at:

- `src/data/dex.json`

Entry shape:

```json
{
  "dex": 25,
  "en": "Pikachu",
  "ja": "ピカチュウ",
  "roomaji": "Pikachu",
  "aliases": ["Pika"],
  "types": ["electric"]
}
```

`roomaji`, `aliases`, and `types` are optional.

## Run Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## UI / Behavior

Single route: `/`

Main screen includes:
- title (`DexBridge`)
- search input (autofocus)
- optional `Fuzzy` toggle
- detected chips row (only in paste mode when matches exist)
- results list (max 20 rows)

Each result row shows:
- dex number (`#<dex>`)
- English name
- Japanese name
- type pills (when available)
- roomaji (smaller text, when present)

Clicking a result copies:

```text
#<dex> <en> / <ja>
```

A small `Copied` toast appears for 1 second.

## Search Logic

Core helpers live in `src/search.ts`.

### 1) Fast direct search

On each keystroke, direct search checks normalized fields:
- `en` (case-insensitive substring)
- `ja` (substring)
- `roomaji` (case-insensitive substring)
- `aliases` (case-insensitive substring)

Ranking:
1. exact match
2. prefix match
3. substring match

Tie-breaker: lower dex number first.

Max results: `20`.

### 2) Fuzzy fallback

Fuse index fields:
- `en`
- `ja`
- `roomaji`
- `aliases`

Fuzzy results are used when:
- direct results are fewer than `5`, or
- the `Fuzzy` toggle is enabled

Current Fuse precision-oriented settings are in `createIndexes()`.

### 3) Kana / romaji normalization

`normalize(text)` handles:
- `NFKC` normalization (full-width/half-width)
- lowercase + trim
- punctuation/space removal
- kana normalization (small kana expansion, prolonged mark handling)
- strategic romaji/kana variant generation with wanakana

This improves matching for mixed Japanese/Latin input.

### 4) Paste-text mode (multi-detect)

Paste mode activates when input is long or whitespace-heavy:
- length `> 30` OR contains whitespace/newlines

Detection strategy:
- startup maps for exact normalized lookup:
  - `enMap`, `jaMap`, `roomajiMap`, `aliasMap`
- token pass for quick whole-token detection
- sliding windows for embedded names
  - Japanese windows: `6 -> 2` chars (longer-first)
  - English/romaji windows: `12 -> 3` chars (longer-first)
- dedup by `Set<dex>` so each Pokémon appears once

Detected matches are shown as chips. Clicking a chip sets the input to that Pokémon's English name.

## Tuning Knobs

You can tweak these directly in `src/search.ts`:
- result limit (`MAX_RESULTS` in `src/App.tsx`)
- fuzzy threshold/options (`createIndexes` Fuse config)
- paste mode threshold (`isPasteMode`)
- window sizes for sliding detection (`detectFromPastedText`)
- normalization behavior (`normalize`, `normalizeKanaText`)

## Optional Data Regeneration Script

A helper script exists to rebuild `src/data/dex.json` from PokéAPI:

- `scripts/build-dex.js`

Run manually:

```bash
node scripts/build-dex.js
```

Note: this fetches remote API data and may take time.
