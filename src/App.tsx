import { useMemo, useState } from 'react'
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

function formatDex(dex: number): string {
  return `#${dex}`
}

export default function App(): JSX.Element {
  const entries = dexData as DexEntry[]
  const indexes = useMemo(() => createIndexes(entries), [entries])

  const [query, setQuery] = useState('')
  const [fuzzyEnabled, setFuzzyEnabled] = useState(false)
  const [toast, setToast] = useState(false)

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

    return merged.slice(0, MAX_RESULTS)
  }, [indexes, query, fuzzyEnabled])

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
      <h1>DexBridge</h1>

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

      {pasteMode && detected.length > 0 && (
        <section className="chips" aria-label="Detected Pokemon">
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
        </section>
      )}

      <ul className="results" aria-label="Search results">
        {results.map((entry) => (
          <li key={entry.dex}>
            <button type="button" className="result" onClick={() => void copyResult(entry)}>
              <span className="dex">{formatDex(entry.dex)}</span>
              <span className="main">
                <span className="en">{entry.en}</span>
                <span className="ja">{entry.ja}</span>
              </span>
              {entry.roomaji && <span className="roomaji">{entry.roomaji}</span>}
            </button>
          </li>
        ))}
      </ul>

      {toast && <div className="toast">Copied</div>}
    </main>
  )
}
