import { useEffect, useMemo, useState } from 'react'
import dexData from './data/dex.json'
import type { DexEntry } from './types'
import {
  createIndexes,
  detectFromPastedText,
  fastSearch,
  fuzzySearch,
  isPasteMode,
} from './search'

const MAX_RESULTS = 20

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

function evolutionForEntry(entry: DexEntry): number[] {
  if (entry.evolution?.length) return entry.evolution
  return [entry.dex]
}

function chainText(values: string[]): string {
  return values.join(' → ')
}

function withEvolutionChainResults(
  seed: DexEntry[],
  query: string,
  entryByDex: Map<number, DexEntry>,
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
    for (const evoDex of evolutionForEntry(entry)) {
      push(entryByDex.get(evoDex))
    }
  }

  return expanded
}

export default function App(): JSX.Element {
  const entries = dexData as DexEntry[]
  const indexes = useMemo(() => createIndexes(entries), [entries])
  const entryByDex = useMemo(() => new Map(entries.map((entry) => [entry.dex, entry])), [entries])

  const [query, setQuery] = useState('')
  const [fuzzyEnabled, setFuzzyEnabled] = useState(false)
  const [toast, setToast] = useState(false)
  const [evolutionTarget, setEvolutionTarget] = useState<DexEntry | null>(null)

  const pasteMode = isPasteMode(query)

  const detected = useMemo(() => {
    if (!pasteMode) return []
    return detectFromPastedText(indexes, query)
  }, [indexes, pasteMode, query])

  const results = useMemo(() => {
    const direct = fastSearch(indexes, query, MAX_RESULTS)
    if (direct.length >= 5 && !fuzzyEnabled) return direct

    const fuzzy = fuzzySearch(indexes, query, MAX_RESULTS)
    const merged = [...direct]
    const seen = new Set(direct.map((e) => e.dex))

    for (const item of fuzzy) {
      if (merged.length >= MAX_RESULTS) break
      if (seen.has(item.dex)) continue
      seen.add(item.dex)
      merged.push(item)
    }

    return withEvolutionChainResults(merged, query, entryByDex, MAX_RESULTS)
  }, [indexes, query, fuzzyEnabled, entryByDex])

  useEffect(() => {
    if (!evolutionTarget) return

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setEvolutionTarget(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [evolutionTarget])

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

  const evolutionDexChain = evolutionTarget ? evolutionForEntry(evolutionTarget) : null
  const evolutionNameChainEn =
    evolutionDexChain?.map((dex) => entryByDex.get(dex)?.en ?? formatDex(dex)) ?? []
  const evolutionNameChainJa =
    evolutionDexChain?.map((dex) => entryByDex.get(dex)?.ja ?? formatDex(dex)) ?? []

  return (
    <main className="app">
      <section className="shell">
        <header className="header">
          <p className="kicker">Instant EN / JA Search</p>
          <h1>DexBridge</h1>
          <p className="sub">Fast lookup, fuzzy fallback, and multi-detect from pasted text.</p>
        </header>

        <div className="controls">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search EN / 日本語 / romaji or paste text"
            aria-label="Search Pokemon"
          />

          <label className="fuzzy-toggle">
            <input
              type="checkbox"
              checked={fuzzyEnabled}
              onChange={(e) => setFuzzyEnabled(e.target.checked)}
            />
            Fuzzy
          </label>
        </div>

        <p className="stats">Showing {results.length} result{results.length === 1 ? '' : 's'}</p>

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
                      {entry.generation && (
                        <span className="generation">Gen {toRomanNumeral(entry.generation)}</span>
                      )}
                    </span>
                    {entry.roomaji && <span className="roomaji">{entry.roomaji}</span>}
                    {entry.types && entry.types.length > 0 && (
                      <span className="type-pills" aria-label="Pokemon types">
                        {entry.types.map((type) => (
                          <span
                            key={`${entry.dex}-${type}`}
                            className="type-pill"
                            style={{
                              backgroundColor: TYPE_COLORS[type] ?? '#64748b',
                            }}
                          >
                            {toTypeLabel(type)}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </a>
                <div className="card-actions">
                  <button
                    type="button"
                    className="evo-btn"
                    aria-label={`Show evolution chain for ${entry.en}`}
                    title="Evolution"
                    onClick={() => setEvolutionTarget(entry)}
                  >
                    Evo
                  </button>
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

      {evolutionTarget && evolutionDexChain && (
        <div className="modal-backdrop" onClick={() => setEvolutionTarget(null)} role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Evolution chain for ${evolutionTarget.en}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>Evolution Chain Peek</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close evolution modal"
                onClick={() => setEvolutionTarget(null)}
              >
                ✕
              </button>
            </header>
            <p className="modal-focus">
              {formatDex(evolutionTarget.dex)} {evolutionTarget.en}
            </p>
            <div className="chain-block">
              <p className="chain-label">English</p>
              <p className="chain-text">{chainText(evolutionNameChainEn)}</p>
            </div>
            <div className="chain-block">
              <p className="chain-label">Japanese</p>
              <p className="chain-text">{chainText(evolutionNameChainJa)}</p>
            </div>
            {!evolutionTarget.evolution?.length && (
              <p className="chain-note">No full chain metadata in this dataset yet for this entry.</p>
            )}
          </section>
        </div>
      )}

      {toast && <div className="toast">Copied</div>}
    </main>
  )
}
