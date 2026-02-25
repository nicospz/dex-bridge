// One-time script to generate dex.json from PokéAPI
// Run with: node scripts/build-dex.js

import fs from "fs/promises";

const OUTPUT = "./src/data/dex.json";
const BASE = "https://pokeapi.co/api/v2";

// how many Pokémon exist (safe upper bound, API will ignore missing ids)
const MAX_ID = 1025;

async function fetchSpecies(id) {
  const res = await fetch(`${BASE}/pokemon-species/${id}`);
  if (!res.ok) return null;
  return res.json();
}

function pickName(names, lang) {
  return names.find(n => n.language.name === lang)?.name ?? null;
}

function toRoomaji(katakana) {
  // we intentionally skip real transliteration to keep dataset clean.
  // Wanakana will handle this dynamically in the app.
  return undefined;
}

async function main() {
  const results = [];

  for (let id = 1; id <= MAX_ID; id++) {
    try {
      const species = await fetchSpecies(id);
      if (!species) continue;

      const en = pickName(species.names, "en");
      const ja = pickName(species.names, "ja");

      if (!en || !ja) continue;

      results.push({
        dex: id,
        en,
        ja
      });

      process.stdout.write(`Fetched #${id}\r`);
    } catch {
      // skip gaps/forms
    }
  }

  // sort defensively
  results.sort((a, b) => a.dex - b.dex);

  await fs.writeFile(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`\nDone. Wrote ${results.length} entries to ${OUTPUT}`);
}

main();
