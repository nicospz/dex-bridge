import Fuse from 'fuse.js'
import * as wanakana from 'wanakana'
import type { DexEntry } from './types'

type Ranked = { entry: DexEntry; rank: 1 | 2 | 3 }

type PreparedEntry = {
  entry: DexEntry
  values: string[]
}

type SearchIndexes = {
  prepared: PreparedEntry[]
  fuse: Fuse<DexEntry>
  enMap: Map<string, DexEntry>
  jaMap: Map<string, DexEntry>
  roomajiMap: Map<string, DexEntry>
  aliasMap: Map<string, DexEntry>
}

const JP_CHAR_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/u
const JP_RUN_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+/gu
const LATIN_RUN_RE = /[A-Za-z]+/g
const TOKEN_SPLIT_RE = /[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9]+/u

const SMALL_KANA_MAP: Record<string, string> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  っ: 'つ',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  ゎ: 'わ',
}

function normalizeLatin(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function stripLongVowels(value: string): string {
  // Accept omitted long vowels in romaji (e.g. rizaadon -> rizadon).
  return value.replace(/([aeiou])\1+/g, '$1')
}

function romajiToleranceVariants(value: string): string[] {
  const base = normalizeLatin(value)
  if (!base) return []

  const variants = new Set<string>([base])

  // Treat ca/co/cu as ka/ko/ku (but do not rewrite ce/ci).
  variants.add(base.replace(/ca/g, 'ka').replace(/co/g, 'ko').replace(/cu/g, 'ku'))

  for (const current of [...variants]) {
    variants.add(stripLongVowels(current))
  }

  return [...variants]
}

function normalizeKanaText(value: string): string {
  const hiragana = wanakana.toHiragana(value)
  let out = ''

  for (const ch of hiragana) {
    if (ch === 'ー') continue
    out += SMALL_KANA_MAP[ch] ?? ch
  }

  return out
}

export function normalize(value: string): string {
  const nfkc = value.normalize('NFKC').toLowerCase().trim()
  const noPunct = nfkc.replace(/[\s\p{P}\p{S}_]+/gu, '')
  return normalizeKanaText(noPunct)
}

function normalizedVariants(value: string): string[] {
  const base = normalize(value)
  if (!base) return []

  const variants = new Set<string>([base])

  if (/[a-z]/i.test(value)) {
    for (const romaji of romajiToleranceVariants(value)) {
      variants.add(normalize(romaji))
      variants.add(normalize(wanakana.toKana(romaji)))
    }
  }

  if (JP_CHAR_RE.test(value)) {
    const romaji = wanakana.toRomaji(value)
    variants.add(normalize(romaji))
    for (const tolerant of romajiToleranceVariants(romaji)) {
      variants.add(normalize(tolerant))
    }
  }

  return [...variants]
}

function rankValue(query: string, candidate: string): 1 | 2 | 3 | null {
  if (!query || !candidate) return null
  if (candidate === query) return 1
  if (candidate.startsWith(query)) return 2
  if (candidate.includes(query)) return 3
  return null
}

export function createIndexes(entries: DexEntry[]): SearchIndexes {
  const prepared: PreparedEntry[] = []
  const enMap = new Map<string, DexEntry>()
  const jaMap = new Map<string, DexEntry>()
  const roomajiMap = new Map<string, DexEntry>()
  const aliasMap = new Map<string, DexEntry>()

  for (const entry of entries) {
    const values = [entry.en, entry.ja, entry.roomaji ?? '', ...(entry.aliases ?? [])]
      .flatMap((v) => normalizedVariants(v))

    prepared.push({ entry, values })

    for (const key of normalizedVariants(entry.en)) enMap.set(key, entry)
    for (const key of normalizedVariants(entry.ja)) jaMap.set(key, entry)
    if (entry.roomaji) {
      for (const key of normalizedVariants(entry.roomaji)) roomajiMap.set(key, entry)
    }
    for (const alias of entry.aliases ?? []) {
      for (const key of normalizedVariants(alias)) aliasMap.set(key, entry)
    }
  }

  const fuse = new Fuse(entries, {
    // Tuned for precision so fuzzy doesn't overwhelm exact matches.
    threshold: 0.22,
    distance: 80,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: 'en', weight: 0.5 },
      { name: 'ja', weight: 0.25 },
      { name: 'roomaji', weight: 0.15 },
      { name: 'aliases', weight: 0.1 },
    ],
  })

  return { prepared, fuse, enMap, jaMap, roomajiMap, aliasMap }
}

export function fastSearch(indexes: SearchIndexes, query: string, limit = 20): DexEntry[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return indexes.prepared
      .map((p) => p.entry)
      .sort((a, b) => a.dex - b.dex)
      .slice(0, limit)
  }

  const queries = normalizedVariants(trimmed)
  if (!queries.length) return []

  const ranked: Ranked[] = []

  for (const prepared of indexes.prepared) {
    let bestRank: 1 | 2 | 3 | null = null

    for (const q of queries) {
      for (const value of prepared.values) {
        const rank = rankValue(q, value)
        if (!rank) continue
        if (!bestRank || rank < bestRank) bestRank = rank
        if (bestRank === 1) break
      }
      if (bestRank === 1) break
    }

    if (bestRank) ranked.push({ entry: prepared.entry, rank: bestRank })
  }

  ranked.sort((a, b) => a.rank - b.rank || a.entry.dex - b.entry.dex)
  return ranked.slice(0, limit).map((r) => r.entry)
}

export function fuzzySearch(indexes: SearchIndexes, query: string, limit = 20): DexEntry[] {
  if (!query.trim()) return []
  return indexes.fuse.search(query, { limit }).map((r) => r.item)
}

function detectFromMap(
  map: Map<string, DexEntry>,
  token: string,
  matchedDex: Set<number>,
  output: DexEntry[],
): void {
  const key = normalize(token)
  if (!key) return
  const entry = map.get(key)
  if (!entry || matchedDex.has(entry.dex)) return
  matchedDex.add(entry.dex)
  output.push(entry)
}

export function isPasteMode(input: string): boolean {
  // Threshold can be tuned. Long text or any whitespace/newline means likely paste mode.
  return input.length > 30 || /\s/.test(input)
}

export function detectFromPastedText(indexes: SearchIndexes, text: string): DexEntry[] {
  const matchedDex = new Set<number>()
  const detected: DexEntry[] = []

  // Token pass: catches obvious whole-word matches quickly.
  const tokens = text.split(TOKEN_SPLIT_RE).filter(Boolean)
  for (const token of tokens) {
    detectFromMap(indexes.enMap, token, matchedDex, detected)
    detectFromMap(indexes.jaMap, token, matchedDex, detected)
    detectFromMap(indexes.roomajiMap, token, matchedDex, detected)
    detectFromMap(indexes.aliasMap, token, matchedDex, detected)
  }

  // Japanese sliding windows (prefer longer first to reduce false positives).
  const jpRuns = text.match(JP_RUN_RE) ?? []
  for (const run of jpRuns) {
    const chars = [...normalize(run)]
    for (let size = 6; size >= 2; size -= 1) {
      if (chars.length < size) continue
      for (let i = 0; i <= chars.length - size; i += 1) {
        const slice = chars.slice(i, i + size).join('')
        detectFromMap(indexes.jaMap, slice, matchedDex, detected)
        detectFromMap(indexes.aliasMap, slice, matchedDex, detected)
      }
    }
  }

  // English/romaji sliding windows (prefer longer first).
  const latinRuns = text.match(LATIN_RUN_RE) ?? []
  for (const run of latinRuns) {
    const normalizedRun = normalize(run)
    for (let size = 12; size >= 3; size -= 1) {
      if (normalizedRun.length < size) continue
      for (let i = 0; i <= normalizedRun.length - size; i += 1) {
        const slice = normalizedRun.slice(i, i + size)
        detectFromMap(indexes.enMap, slice, matchedDex, detected)
        detectFromMap(indexes.roomajiMap, slice, matchedDex, detected)
        detectFromMap(indexes.aliasMap, slice, matchedDex, detected)
      }
    }
  }

  detected.sort((a, b) => a.dex - b.dex)
  return detected
}
