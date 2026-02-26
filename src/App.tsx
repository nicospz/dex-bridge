import { useEffect, useMemo, useRef, useState } from 'react'
import dexData from './data/dex.json'
import {
  createIndexes,
  detectFromPastedText,
  fastSearch,
  fuzzySearch,
  isPasteMode,
} from './search'
import type { DexEntry } from './types'

const MAX_RESULTS = 20
const ENTRIES = dexData as DexEntry[]

const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  electric: '#F7D02C',
  grass: '#7AC74C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD',
}

function formatDex(dex: number): string {
  return `#${dex}`
}

function bulbapediaUrl(enName: string): string {
  const pageTitle = `${enName}_(Pokémon)`
  return `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(pageTitle)}`
}

function toTypeLabel(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function toRomanNumeral(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]

  let n = value
  let out = ''
  for (const [size, symbol] of numerals) {
    while (n >= size) {
      out += symbol
      n -= size
    }
  }
  return out
}

function withEvolutionChainResults(
  seed: DexEntry[],
  query: string,
  entryByDex: Map<number, DexEntry>,
  relatedDexByDex: Map<number, number[]>,
  limit: number,
): DexEntry[] {
  if (!query.trim()) return seed.slice(0, limit)

  const expanded: DexEntry[] = []
  const seen = new Set<number>()

  function push(entry: DexEntry | undefined): void {
    if (!entry || seen.has(entry.dex) || expanded.length >= limit) return
    seen.add(entry.dex)
    expanded.push(entry)
  }

  for (const entry of seed) {
    if (expanded.length >= limit) break
    push(entry)
    const relatedDex = relatedDexByDex.get(entry.dex) ?? [entry.dex]
    for (const evoDex of relatedDex) {
      push(entryByDex.get(evoDex))
    }
  }

  return expanded
}

export default function App(): JSX.Element {
  const indexes = useMemo(() => createIndexes(ENTRIES), [])
  const entryByDex = useMemo(
    () => new Map(ENTRIES.map((entry) => [entry.dex, entry])),
    [],
  )
  const relatedDexByDex = useMemo(() => {
    const byDex = new Map<number, Set<number>>()

    for (const entry of ENTRIES) {
      const chain = entry.evolution?.length ? entry.evolution : [entry.dex]
      for (const member of chain) {
        const current = byDex.get(member) ?? new Set<number>([member])
        for (const related of chain) current.add(related)
        byDex.set(member, current)
      }
    }

    return new Map(
      [...byDex.entries()].map(([dex, values]) => [
        dex,
        [...values].sort((a, b) => a - b),
      ]),
    )
  }, [])
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [toast, setToast] = useState(false)

  const pasteMode = isPasteMode(query)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const detected = useMemo(() => {
    if (!pasteMode) return []
    return detectFromPastedText(indexes, query)
  }, [indexes, pasteMode, query])

  const results = useMemo(() => {
    const direct = fastSearch(indexes, query, MAX_RESULTS)
    if (direct.length >= 5) return direct

    const fuzzy = fuzzySearch(indexes, query, MAX_RESULTS)
    const merged = [...direct]
    const seen = new Set(direct.map((e) => e.dex))

    for (const item of fuzzy) {
      if (merged.length >= MAX_RESULTS) break
      if (seen.has(item.dex)) continue
      seen.add(item.dex)
      merged.push(item)
    }

    return withEvolutionChainResults(
      merged,
      query,
      entryByDex,
      relatedDexByDex,
      MAX_RESULTS,
    )
  }, [indexes, query, entryByDex, relatedDexByDex])

  async function copyResult(entry: DexEntry): Promise<void> {
    const text = `${formatDex(entry.dex)} ${entry.en} / ${entry.ja}`

    try {
      await navigator.clipboard.writeText(text)
      setToast(true)
      setTimeout(() => setToast(false), 1000)
    } catch {
      setToast(false)
    }
  }

  return (
    <main className="app">
      <section className="shell">
        <header className="header">
          <p className="kicker">Instant EN / JA Search</p>
          <h1>DexBridge</h1>
          <p className="sub">
            Fast lookup, fuzzy fallback, and multi-detect from pasted text.
          </p>
        </header>

        <div className="controls">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search EN / 日本語 / romaji or paste text"
            aria-label="Search Pokemon"
          />
        </div>

        <p className="stats">
          Showing {results.length} result{results.length === 1 ? '' : 's'}
        </p>

        {pasteMode && detected.length > 0 && (
          <section className="chips-wrap" aria-label="Detected Pokemon">
            <p className="chips-title">Detected</p>
            <div className="chips">
              {detected.map((entry) => (
                <button
                  key={entry.dex}
                  type="button"
                  className="chip"
                  onClick={() => setQuery(entry.en)}
                  title={`${formatDex(entry.dex)} ${entry.en}`}
                >
                  {formatDex(entry.dex)} {entry.en}
                </button>
              ))}
            </div>
          </section>
        )}

        <ul className="results" aria-label="Search results">
          {results.map((entry) => (
            <li key={entry.dex}>
              <div className="result-wrap">
                <a
                  className="result"
                  href={bulbapediaUrl(entry.en)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open ${entry.en} on Bulbapedia`}
                >
                  <span className="main">
                    <span className="name-row">
                      <span className="dex">{formatDex(entry.dex)}</span>
                      <span className="en">{entry.en}</span>
                      <span className="ja">{entry.ja}</span>
                    </span>
                    {entry.roomaji && (
                      <span className="roomaji">{entry.roomaji}</span>
                    )}
                    {(entry.generation ||
                      (entry.types && entry.types.length > 0)) && (
                      <span className="tags-row">
                        {entry.generation && (
                          <span className="generation">
                            Gen {toRomanNumeral(entry.generation)}
                          </span>
                        )}
                        {entry.types && entry.types.length > 0 && (
                          <span className="type-pills">
                            {entry.types.map((type) => (
                              <span
                                key={`${entry.dex}-${type}`}
                                className="type-pill"
                                style={{
                                  backgroundColor:
                                    TYPE_COLORS[type] ?? '#64748b',
                                }}
                              >
                                {toTypeLabel(type)}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </a>
                <div className="card-actions">
                  <button
                    type="button"
                    className="copy-btn"
                    aria-label={`Copy ${entry.en} info`}
                    title="Copy"
                    onClick={() => void copyResult(entry)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 9h9v11H9z" />
                      <path d="M6 4h9v3H9a3 3 0 0 0-3 3v8H6z" />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {toast && <div className="toast">Copied</div>}
    </main>
  )
}
