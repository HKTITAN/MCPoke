import { useEffect, useMemo, useState } from 'react'
import type { LogEntry, LogLevel } from '../../../shared/mcp-types.js'
import { useAppStore } from '../../state/appStore'

const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']

export function LogsPanel() {
  const selectedId = useAppStore((s) => s.selectedId)
  const selected = useAppStore((s) => s.servers.find((x) => x.item.id === s.selectedId) ?? null)
  const storeLogs = useAppStore((s) => s.logs)
  const setLogs = useAppStore((s) => s.setLogs)
  const [q, setQ] = useState('')
  const [lv, setLv] = useState<LogLevel | 'all'>('all')
  const [stream, setStream] = useState<string>('all')

  useEffect(() => {
    if (!selectedId) {
      setLogs([])
      return
    }
    void window.mcpoke.getLogs(selectedId, 2000).then(setLogs)
  }, [selectedId, setLogs])

  const filtered = useMemo(() => {
    return storeLogs.filter((l) => {
      if (lv !== 'all' && l.level !== lv) return false
      if (stream !== 'all' && l.stream !== stream) return false
      if (q && !l.message.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [storeLogs, lv, stream, q])

  const copy = () => {
    const t = filtered.map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.stream} ${l.level} ${l.message}`).join('\n')
    void navigator.clipboard.writeText(t)
  }

  const download = () => {
    const t = filtered.map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.stream} ${l.level} ${l.message}`).join('\n')
    const b = new Blob([t], { type: 'text/plain' })
    const u = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = u
    a.download = `mcpoke-${selectedId ?? 'log'}.txt`
    a.click()
    URL.revokeObjectURL(u)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap gap-1 items-center border-b border-(--color-border) px-2 py-1">
        <span className="text-[10px] text-(--color-muted) mr-1">stream</span>
        <select className="mcpoke-input w-28" value={stream} onChange={(e) => setStream(e.target.value)}>
          <option value="all">all</option>
          <option value="stdout">stdout</option>
          <option value="stderr">stderr</option>
          <option value="system">system</option>
          <option value="tunnel">tunnel</option>
        </select>
        <span className="text-[10px] text-(--color-muted)">level</span>
        <select className="mcpoke-input w-24" value={lv} onChange={(e) => setLv(e.target.value as LogLevel | 'all')}>
          <option value="all">all</option>
          {levels.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <input className="mcpoke-input flex-1 min-w-[120px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" />
        <button type="button" className="mcpoke-btn" onClick={copy}>
          Copy
        </button>
        <button type="button" className="mcpoke-btn" onClick={download}>
          Download
        </button>
        <span className="text-[10px] text-(--color-muted)">tail · {storeLogs.length} lines</span>
      </div>
      {selected && (
        <div className="flex flex-wrap gap-1 items-center border-b border-(--color-border) px-2 py-1 text-[10px] text-(--color-muted)">
          <span className="mcpoke-chip">state {selected.running.state}</span>
          <span className="mcpoke-chip">deploy {selected.deployment.state}</span>
          <span className="mcpoke-chip">surface {selected.surfaceState}</span>
          {selected.lastError && <span className="text-(--color-danger)">last error: {selected.lastError}</span>}
          {selected.poke.lastSyncAt && <span>last sync {new Date(selected.poke.lastSyncAt).toLocaleTimeString()}</span>}
        </div>
      )}
      <div className="mcpoke-scroll flex-1 font-mono text-[10px] leading-snug p-1 bg-(--color-canvas) text-(--color-fg)">
        {selectedId
          ? filtered.map((l) => <LogLine key={l.id} log={l} />)
          : 'Select a server to view logs; stream updates live.'}
      </div>
    </div>
  )
}

function LogLine({ log }: { log: LogEntry }) {
  const t = new Date(log.timestamp).toISOString()
  return (
    <div className="border-b border-(--color-border)/40 hover:bg-(--color-elevated) px-0.5">
      <span className="text-(--color-muted)">{t.slice(11, 23)}</span>{' '}
      <span className={log.level === 'error' ? 'text-(--color-danger)' : log.stream === 'stderr' ? 'text-(--color-warn)' : 'text-(--color-muted)'}>
        {log.stream}
      </span>{' '}
      {log.message}
    </div>
  )
}
