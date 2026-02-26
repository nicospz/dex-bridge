// One-time script to generate dex.json from PokéAPI
// Run with: node scripts/build-dex.js

import fs from 'node:fs/promises'

const OUTPUT = './src/data/dex.json'
const BASE = 'https://pokeapi.co/api/v2'

// how many Pokemon exist (safe upper bound, API will ignore missing ids)
const MAX_ID = 1025

const GENERATION_NAME_TO_NUMBER = {
  'generation-i': 1,
  'generation-ii': 2,
  'generation-iii': 3,
  'generation-iv': 4,
  'generation-v': 5,
  'generation-vi': 6,
  'generation-vii': 7,
  'generation-viii': 8,
  'generation-ix': 9,
}

async function fetchSpecies(id) {
  const res = await fetch(`${BASE}/pokemon-species/${id}`)
  if (!res.ok) return null
  return res.json()
}

async function fetchPokemon(id) {
  const res = await fetch(`${BASE}/pokemon/${id}`)
  if (!res.ok) return null
  return res.json()
}

async function fetchEvolutionChain(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

function pickName(names, lang) {
  return names.find((n) => n.language.name === lang)?.name ?? null
}

function pickTypes(pokemon) {
  return pokemon.types
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((slot) => slot.type.name)
}

function pickGeneration(species) {
  const generationName = species.generation?.name
  return GENERATION_NAME_TO_NUMBER[generationName]
}

function collectPaths(node, prefix = [], paths = []) {
  const current = [...prefix, node.species.name]

  if (!node.evolves_to.length) {
    paths.push(current)
    return paths
  }

  for (const next of node.evolves_to) {
    collectPaths(next, current, paths)
  }

  return paths
}

function buildEvolutionBySpecies(chain, speciesNameToEntry) {
  const paths = collectPaths(chain.chain)
  const evolutionBySpecies = new Map()

  for (const path of paths) {
    const present = path
      .map((slug) => speciesNameToEntry.get(slug))
      .filter(Boolean)
    if (present.length <= 1) continue

    const evolution = present.map((entry) => entry.dex)

    for (const entry of present) {
      const existing = evolutionBySpecies.get(entry.speciesSlug)
      if (!existing || existing.length < evolution.length) {
        evolutionBySpecies.set(entry.speciesSlug, evolution)
      }
    }
  }

  return evolutionBySpecies
}

async function main() {
  const baseEntries = []

  for (let id = 1; id <= MAX_ID; id++) {
    try {
      const [species, pokemon] = await Promise.all([
        fetchSpecies(id),
        fetchPokemon(id),
      ])
      if (!species || !pokemon) continue

      const en = pickName(species.names, 'en')
      const ja = pickName(species.names, 'ja')
      const types = pickTypes(pokemon)
      const generation = pickGeneration(species)

      if (!en || !ja) continue

      baseEntries.push({
        dex: id,
        en,
        ja,
        types,
        generation,
        speciesSlug: species.name,
        evolutionChainUrl: species.evolution_chain?.url,
      })

      process.stdout.write(`Fetched #${id}\r`)
    } catch {
      // skip gaps/forms
    }
  }

  const speciesNameToEntry = new Map(
    baseEntries.map((entry) => [entry.speciesSlug, entry]),
  )
  const chainCache = new Map()

  for (const entry of baseEntries) {
    const url = entry.evolutionChainUrl
    if (!url || chainCache.has(url)) continue

    const chain = await fetchEvolutionChain(url)
    if (!chain) continue

    chainCache.set(url, buildEvolutionBySpecies(chain, speciesNameToEntry))
  }

  const results = baseEntries.map((entry) => {
    const evolutionBySpecies = chainCache.get(entry.evolutionChainUrl)
    const evolution = evolutionBySpecies?.get(entry.speciesSlug)

    return {
      dex: entry.dex,
      en: entry.en,
      ja: entry.ja,
      types: entry.types,
      ...(entry.generation ? { generation: entry.generation } : {}),
      ...(evolution ? { evolution } : {}),
    }
  })

  // sort defensively
  results.sort((a, b) => a.dex - b.dex)

  await fs.writeFile(OUTPUT, JSON.stringify(results, null, 2))
  console.log(`\nDone. Wrote ${results.length} entries to ${OUTPUT}`)
}

main()
