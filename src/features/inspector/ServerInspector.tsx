import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../state/appStore'
import { sounds } from '../../renderer/sounds'
import type {
  AuthKV,
  PortConfig,
  ServerAuthMode,
  ServerRegistryItem,
  ServerTransport
} from '../../../shared/mcp-types.js'
import { DEFAULT_PLATFORM } from '../../../shared/mcp-types.js'
import { chipDeploy, chipRun, chipSurface, chipTransport } from '../registry/statusFormat'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mcpoke-sec-head">
      <span className="mcpoke-section-label">{children}</span>
      <div className="mcpoke-sec-line" />
    </div>
  )
}

export function ServerInspector() {
  const selectedId = useAppStore((s) => s.selectedId)
  const servers = useAppStore((s) => s.servers)
  const loadRegistry = useAppStore((s) => s.loadRegistry)
  const row = servers.find((x) => x.item.id === selectedId)
  const [portIn, setPortIn] = useState('')
  const [portMode, setPortMode] = useState<'manual' | 'random'>('random')
  const [err, setErr] = useState<string | null>(null)
  const [remoteUrlIn, setRemoteUrlIn] = useState('')
  const [authMode, setAuthMode] = useState<ServerAuthMode>('none')
  const [apiEnvName, setApiEnvName] = useState('API_KEY')
  const [apiValue, setApiValue] = useState('')
  const [bearerEnvName, setBearerEnvName] = useState('BEARER_TOKEN')
  const [bearerToken, setBearerToken] = useState('')
  const [oauthAuthUrl, setOauthAuthUrl] = useState('')
  const [oauthTokenUrl, setOauthTokenUrl] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthScope, setOauthScope] = useState('')
  const [oauthAudience, setOauthAudience] = useState('')
  const [oauthNotes, setOauthNotes] = useState('')
  const [customEnvText, setCustomEnvText] = useState('')
  const endpointSummary = useMemo(() => {
    if (!row) return '—'
    return row.endpoint.pokeUrl ?? row.endpoint.remoteUrl ?? row.endpoint.localUrl ?? '—'
  }, [row])

  useEffect(() => {
    if (!row) return
    const p = row.port
    setPortMode(p.mode === 'manual' ? 'manual' : 'random')
    setPortIn(p.value ? String(p.value) : '')
    setRemoteUrlIn(row.item.config.remoteUrl ?? '')
    const auth = row.item.config.auth
    setAuthMode(auth?.mode ?? 'none')
    setApiEnvName(auth?.apiKey?.envName ?? 'API_KEY')
    setApiValue(auth?.apiKey?.value ?? '')
    setBearerEnvName(auth?.bearer?.envName ?? 'BEARER_TOKEN')
    setBearerToken(auth?.bearer?.token ?? '')
    setOauthAuthUrl(auth?.oauth?.authUrl ?? '')
    setOauthTokenUrl(auth?.oauth?.tokenUrl ?? '')
    setOauthClientId(auth?.oauth?.clientId ?? '')
    setOauthScope(auth?.oauth?.scope ?? '')
    setOauthAudience(auth?.oauth?.audience ?? '')
    setOauthNotes(auth?.oauth?.notes ?? '')
    const envRows = (auth?.customEnv ?? []).map((x) => `${x.key}=${x.value}`)
    setCustomEnvText(envRows.join('\n'))
  }, [
    row?.item.id,
    row?.port.value,
    row?.port.mode,
    row?.item.config.remoteUrl,
    row?.item.config.auth
  ])

  if (!row) {
    return (
      <div className="mcpoke-inspector">
        <div className="mcpoke-inspector-hd">
          <span className="mcpoke-section-label">Inspector</span>
        </div>
        <div className="mcpoke-inspector-empty">
          Select a server to inspect, or add a custom one below.
        </div>
        <AddCustomForm onDone={() => void loadRegistry()} />
      </div>
    )
  }

  const id = row.item.id
  const run = async (fn: () => Promise<unknown>, sound?: 'start' | 'stop' | 'success') => {
    setErr(null)
    try {
      await fn()
      await loadRegistry()
      if (sound === 'start') sounds.start()
      else if (sound === 'stop') sounds.stop()
      else sounds.success()
    } catch (e) {
      sounds.error()
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const applyPort = async () => {
    const v = portMode === 'manual' && portIn ? parseInt(portIn, 10) : undefined
    if (portMode === 'manual' && (!v || Number.isNaN(v))) {
      setErr('Port must be a number for manual mode')
      return
    }
    const config: PortConfig =
      portMode === 'random'
        ? { mode: 'random', status: 'none' }
        : { mode: 'manual', value: v, status: 'none' }
    await run(() => window.mcpoke.setPort(id, config))
  }

  const applyRemoteUrl = async () => {
    const next: ServerRegistryItem = {
      ...row.item,
      source: 'custom',
      config: {
        ...row.item.config,
        remoteUrl: remoteUrlIn.trim() ? remoteUrlIn.trim() : undefined
      },
      lastSync: Date.now()
    }
    await run(() => window.mcpoke.upsertServer(next))
  }

  const parseCustomEnvText = (text: string): AuthKV[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf('=')
        if (idx <= 0) return { key: line, value: '' }
        return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
      })
      .filter((x) => x.key.length > 0)
  }

  const applyAuth = async () => {
    const customEnv = parseCustomEnvText(customEnvText)
    const next: ServerRegistryItem = {
      ...row.item,
      source: 'custom',
      config: {
        ...row.item.config,
        auth: {
          mode: authMode,
          apiKey: authMode === 'api_key' ? { envName: apiEnvName.trim() || 'API_KEY', value: apiValue } : undefined,
          bearer: authMode === 'bearer' ? { envName: bearerEnvName.trim() || 'BEARER_TOKEN', token: bearerToken } : undefined,
          oauth: authMode === 'oauth'
            ? {
                authUrl: oauthAuthUrl || undefined,
                tokenUrl: oauthTokenUrl || undefined,
                clientId: oauthClientId || undefined,
                scope: oauthScope || undefined,
                audience: oauthAudience || undefined,
                notes: oauthNotes || undefined
              }
            : undefined,
          customEnv: authMode === 'custom' ? customEnv : undefined
        }
      },
      lastSync: Date.now()
    }
    await run(() => window.mcpoke.upsertServer(next))
  }

  const localTunnelReady = !!row.endpoint.localUrl
  const tunnelReady = !!row.item.config.remoteUrl || localTunnelReady
  const tunnelReason = row.item.config.remoteUrl
    ? 'Tunnel target: remote endpoint'
    : localTunnelReady
    ? 'Tunnel target: local served endpoint'
    : 'Start server to expose local endpoint (or set Remote URL)'

  return (
    <div className="mcpoke-inspector">
      <div className="mcpoke-inspector-hd">
        <div className="mcpoke-inspector-title">
          <span className="mcpoke-section-label">Inspector</span>
          {row.item.source === 'custom' && (
            <span className="mcpoke-chip mcpoke-chip-micro">custom</span>
          )}
        </div>
        <span className="mcpoke-id-code" title={id}>
          {id.slice(0, 8)}…
        </span>
      </div>
      <div className="mcpoke-inspector-body">
        {err && (
          <div className="mcpoke-error-banner">
            <span style={{ flex: 1 }}>{err}</span>
            <button type="button" style={{ color: 'var(--color-muted)', cursor: 'pointer', fontSize: '10px', background: 'none', border: 'none', flexShrink: 0 }} onClick={() => setErr(null)}>✕</button>
          </div>
        )}

        <div>
          <SectionLabel>State</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem', marginBottom: '0.375rem' }}>
            {chipTransport(row.endpoint.transport)}
            {chipSurface(row.surfaceState)}
            {chipRun(row.running.state)}
            {chipDeploy(row.deployment.state)}
            <span className="mcpoke-chip" style={row.poke.authState === 'authenticated' ? { color: 'var(--color-ok)', borderColor: 'rgba(34,197,94,0.2)' } : { color: 'var(--color-warn)', borderColor: 'rgba(245,158,11,0.3)' }}>
              auth {row.poke.authState}
            </span>
            <span className="mcpoke-chip" style={row.poke.connected ? { color: 'var(--color-ok)', borderColor: 'rgba(34,197,94,0.2)' } : {}}>
              poke {row.poke.connected ? 'connected' : 'idle'}
            </span>
          </div>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', wordBreak: 'break-all', lineHeight: 1.3 }}>
            {endpointSummary}
          </div>
          {row.lastError && (
            <div style={{ fontSize: '10px', color: 'var(--color-danger)', marginTop: '0.25rem', border: '1px solid rgba(244,33,46,0.15)', backgroundColor: 'rgba(244,33,46,0.05)', borderRadius: '0.25rem', padding: '0.375rem 0.5rem' }}>
              {row.lastError}
            </div>
          )}
          {row.poke.lastSyncAt && (
            <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '0.125rem' }}>
              last sync {new Date(row.poke.lastSyncAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Deployment steps</SectionLabel>
          {row.deployment.instructions.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>No steps.</div>
          ) : (
            <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', listStyle: 'none', padding: 0, margin: 0 }}>
              {row.deployment.instructions.map((step, idx) => (
                <li key={step + idx} style={{ fontSize: '11px', color: 'var(--color-fg)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-muted)', width: '1rem', textAlign: 'right', flexShrink: 0, userSelect: 'none' }}>{idx + 1}</span>
                  <span style={{ lineHeight: 1.3 }}>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <SectionLabel>Connection</SectionLabel>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-fg)', wordBreak: 'break-all' }}>{row.connection}</div>
          {row.endpoint.localUrl && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-ok)', wordBreak: 'break-all', marginTop: '0.25rem' }}>
              serving {row.endpoint.localUrl}
            </div>
          )}
          {row.tunnel.tunnelUrl && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-accent)', wordBreak: 'break-all', marginTop: '0.25rem' }} title="Tunnel URL">
              {row.tunnel.tunnelUrl}
            </div>
          )}
          {row.tunnel.localUrl && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-muted)', wordBreak: 'break-all', marginTop: '0.125rem' }}>
              local {row.tunnel.localUrl}
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Authentication</SectionLabel>
          {row.item.config.authRequirement && (
            <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
              Requires {row.item.config.authRequirement.mode} ({row.item.config.authRequirement.level}) · {row.item.config.authRequirement.envNames.join(', ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="mcpoke-input"
              style={{ width: '10rem' }}
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value as ServerAuthMode)}
            >
              <option value="none">none</option>
              <option value="api_key">api key</option>
              <option value="bearer">bearer</option>
              <option value="oauth">oauth (config)</option>
              <option value="custom">custom env</option>
            </select>
            <button type="button" className="mcpoke-btn" onClick={() => void applyAuth()}>
              Save auth
            </button>
          </div>
          {authMode === 'api_key' && (
            <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>
              <input className="mcpoke-input" value={apiEnvName} onChange={(e) => setApiEnvName(e.target.value)} placeholder="ENV name (e.g. OPENAI_API_KEY)" />
              <input className="mcpoke-input" value={apiValue} onChange={(e) => setApiValue(e.target.value)} placeholder="API key value" />
            </div>
          )}
          {authMode === 'bearer' && (
            <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>
              <input className="mcpoke-input" value={bearerEnvName} onChange={(e) => setBearerEnvName(e.target.value)} placeholder="ENV name (e.g. BEARER_TOKEN)" />
              <input className="mcpoke-input" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="Bearer token value" />
            </div>
          )}
          {authMode === 'oauth' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem', marginTop: '0.375rem' }}>
              <input className="mcpoke-input" value={oauthAuthUrl} onChange={(e) => setOauthAuthUrl(e.target.value)} placeholder="Auth URL (optional)" />
              <input className="mcpoke-input" value={oauthTokenUrl} onChange={(e) => setOauthTokenUrl(e.target.value)} placeholder="Token URL (optional)" />
              <input className="mcpoke-input" value={oauthClientId} onChange={(e) => setOauthClientId(e.target.value)} placeholder="Client ID (optional)" />
              <input className="mcpoke-input" value={oauthScope} onChange={(e) => setOauthScope(e.target.value)} placeholder="Scope (optional)" />
              <input className="mcpoke-input" value={oauthAudience} onChange={(e) => setOauthAudience(e.target.value)} placeholder="Audience (optional)" />
              <input className="mcpoke-input" value={oauthNotes} onChange={(e) => setOauthNotes(e.target.value)} placeholder="Notes / guidance" />
            </div>
          )}
          {authMode === 'custom' && (
            <textarea
              className="mcpoke-input"
              style={{ marginTop: '0.375rem', minHeight: '4.5rem', fontFamily: 'var(--font-mono)' }}
              value={customEnvText}
              onChange={(e) => setCustomEnvText(e.target.value)}
              placeholder={'KEY=value\nANOTHER_KEY=value'}
            />
          )}
          {row.item.source !== 'custom' && (
            <div style={{ color: 'var(--color-muted)', fontSize: '10px', marginTop: '0.25rem' }}>
              Preset entries are read-only; duplicate as custom to override auth.
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Tunnel target</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
            <span
              className="mcpoke-chip"
              style={tunnelReady ? { color: 'var(--color-ok)', borderColor: 'rgba(34,197,94,0.2)' } : { color: 'var(--color-warn)', borderColor: 'rgba(245,158,11,0.3)' }}
            >
              {tunnelReady ? 'tunnel ready' : 'tunnel needs endpoint'}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--color-muted)' }}>{tunnelReason}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="mcpoke-input"
              style={{ flex: 1, minWidth: '9rem' }}
              value={remoteUrlIn}
              onChange={(e) => setRemoteUrlIn(e.target.value)}
              placeholder="Remote URL (optional) e.g. http://127.0.0.1:8787/mcp"
            />
            <button type="button" className="mcpoke-btn" onClick={() => void applyRemoteUrl()}>
              Save
            </button>
            <button
              type="button"
              className="mcpoke-btn-ghost"
              onClick={() => setRemoteUrlIn(row.item.config.remoteUrl ?? '')}
            >
              Reset
            </button>
          </div>
          {row.item.source !== 'custom' && (
            <div style={{ color: 'var(--color-muted)', fontSize: '10px', marginTop: '0.25rem' }}>
              Preset entries are read-only; duplicate as custom to override endpoint.
            </div>
          )}
        </div>

        {row.item.config.transport === 'http' && row.endpoint.origin === 'local' && (
          <div>
            <SectionLabel>Port</SectionLabel>
            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="mcpoke-input"
                style={{ width: '6rem' }}
                value={portMode}
                onChange={(e) => setPortMode(e.target.value as 'manual' | 'random')}
              >
                <option value="random">random</option>
                <option value="manual">manual</option>
              </select>
              {portMode === 'manual' && (
                <input className="mcpoke-input" style={{ width: '5rem' }} value={portIn} onChange={(e) => setPortIn(e.target.value)} placeholder="3000" />
              )}
              <button type="button" className="mcpoke-btn" onClick={() => void applyPort()}>Apply</button>
              <button type="button" className="mcpoke-btn-ghost" onClick={() => void run(() => window.mcpoke.checkPort(id))}>Check</button>
              <button
                type="button"
                className="mcpoke-btn-ghost"
                onClick={() => void run(async () => {
                  const r = await window.mcpoke.pickRandomPort()
                  setPortMode('manual')
                  setPortIn(String(r.port))
                })}
              >
                Pick
              </button>
            </div>
            {row.port.status === 'conflict' && (
              <div style={{ color: 'var(--color-warn)', fontSize: '10px', marginTop: '0.25rem' }}>Port conflict — change or free it.</div>
            )}
          </div>
        )}

        <div>
          <SectionLabel>Actions</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <div className="mcpoke-actions">
              <Act label="Install" onClick={() => run(() => window.mcpoke.install(id))} />
              <Act label="Start" onClick={() => run(() => window.mcpoke.start(id), 'start')} />
              <Act label="Stop" onClick={() => run(() => window.mcpoke.stop(id), 'stop')} />
              <Act label="Restart" onClick={() => run(() => window.mcpoke.restart(id), 'start')} />
              {row.lastError && <Act label="Recover" onClick={() => run(() => window.mcpoke.restart(id), 'start')} variant="warn" />}
            </div>
            <div className="mcpoke-actions">
              <Act label={tunnelReady ? 'Tunnel on' : 'Tunnel on (needs endpoint)'} onClick={() => run(() => window.mcpoke.tunnel(id))} />
              <Act label="Tunnel off" onClick={() => run(() => window.mcpoke.tunnelStop(id))} />
              <Act label="Sync tools" onClick={() => run(() => window.mcpoke.refreshTools(id))} />
              <Act label="Inspector ↗" onClick={() => window.mcpoke.openMcpInspector('https://github.com/modelcontextprotocol/inspector')} />
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Tools ({row.toolsCount})</SectionLabel>
          <div className="mcpoke-tools-list">
            {row.tools.length === 0 ? (
              <div style={{ padding: '0.5rem', color: 'var(--color-muted)' }}>— tools appear after connection</div>
            ) : (
              row.tools.map((t) => (
                <div key={t.name} className="mcpoke-tool-item">
                  <span style={{ color: 'var(--color-fg)' }}>{t.name}</span>
                  {t.description && <div style={{ color: 'var(--color-muted)', fontSize: '9px', marginTop: '0.125rem', lineHeight: 1.3 }}>{t.description}</div>}
                </div>
              ))
            )}
          </div>
        </div>

        {row.item.source === 'custom' && (
          <div style={{ paddingTop: '0.25rem', borderTop: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className="mcpoke-btn-danger"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => void run(async () => {
                await window.mcpoke.deleteServer(id)
                useAppStore.getState().setSelectedId(null)
              })}
            >
              Delete custom server
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Act({ label, onClick, variant }: { label: string; onClick: () => void; variant?: 'warn' }) {
  return (
    <button
      type="button"
      className={variant === 'warn' ? 'mcpoke-btn mcpoke-act-warn' : 'mcpoke-btn'}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function AddCustomForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('My MCP')
  const [desc, setDesc] = useState('')
  const [transport, setTransport] = useState<ServerTransport>('stdio')
  const [cmd, setCmd] = useState('npx')
  const [args, setArgs] = useState('-y @modelcontextprotocol/server-filesystem .')
  const [pkg, setPkg] = useState('@modelcontextprotocol/server-filesystem')
  const [ext, setExt] = useState(false)
  const [mcpPath, setMcpPath] = useState('/mcp')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [authMode, setAuthMode] = useState<ServerAuthMode>('none')
  const [apiEnvName, setApiEnvName] = useState('API_KEY')
  const [apiValue, setApiValue] = useState('')
  const [bearerEnvName, setBearerEnvName] = useState('BEARER_TOKEN')
  const [bearerToken, setBearerToken] = useState('')
  const [oauthNotes, setOauthNotes] = useState('')
  const [customEnvText, setCustomEnvText] = useState('')

  const parseCustomEnvText = (text: string): AuthKV[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf('=')
        if (idx <= 0) return { key: line, value: '' }
        return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
      })
      .filter((x) => x.key.length > 0)
  }

  const submit = async () => {
    const item: ServerRegistryItem = {
      id: crypto.randomUUID(),
      name,
      description: desc,
      source: 'custom',
      config: {
        transport,
        remoteUrl: remoteUrl.trim() ? remoteUrl.trim() : undefined,
        packageSpec: pkg || undefined,
        command: cmd,
        args: args.split(/\s+/).filter(Boolean),
        mcpPath: transport === 'http' ? mcpPath : undefined,
        useExternalStart: transport === 'http' ? ext : undefined,
        auth: {
          mode: authMode,
          apiKey: authMode === 'api_key' ? { envName: apiEnvName || 'API_KEY', value: apiValue } : undefined,
          bearer: authMode === 'bearer' ? { envName: bearerEnvName || 'BEARER_TOKEN', token: bearerToken } : undefined,
          oauth: authMode === 'oauth' ? { notes: oauthNotes || undefined } : undefined,
          customEnv: authMode === 'custom' ? parseCustomEnvText(customEnvText) : undefined
        }
      },
      platform: DEFAULT_PLATFORM,
      lastSync: Date.now()
    }
    await window.mcpoke.upsertServer(item)
    onDone()
  }

  return (
    <div className="mcpoke-add-form">
      <div className="mcpoke-sec-head mcpoke-add-head">
        <span className="mcpoke-section-label">Add custom server</span>
        <div className="mcpoke-sec-line" />
      </div>
      <input className="mcpoke-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input className="mcpoke-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" />
      <select className="mcpoke-input" value={transport} onChange={(e) => setTransport(e.target.value as ServerTransport)}>
        <option value="stdio">stdio</option>
        <option value="http">http</option>
        <option value="sse">sse</option>
      </select>
      <input
        className="mcpoke-input"
        value={remoteUrl}
        onChange={(e) => setRemoteUrl(e.target.value)}
        placeholder="Remote endpoint URL (optional, used for remote start/tunnel)"
      />
      <input className="mcpoke-input" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="npm package (for install)" />
      <input className="mcpoke-input" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Start command" />
      <select className="mcpoke-input" value={authMode} onChange={(e) => setAuthMode(e.target.value as ServerAuthMode)}>
        <option value="none">Auth: none</option>
        <option value="api_key">Auth: API key</option>
        <option value="bearer">Auth: Bearer token</option>
        <option value="oauth">Auth: OAuth (config)</option>
        <option value="custom">Auth: custom env</option>
      </select>
      {authMode === 'api_key' && (
        <>
          <input className="mcpoke-input" value={apiEnvName} onChange={(e) => setApiEnvName(e.target.value)} placeholder="API key env name" />
          <input className="mcpoke-input" value={apiValue} onChange={(e) => setApiValue(e.target.value)} placeholder="API key value" />
        </>
      )}
      {authMode === 'bearer' && (
        <>
          <input className="mcpoke-input" value={bearerEnvName} onChange={(e) => setBearerEnvName(e.target.value)} placeholder="Bearer env name" />
          <input className="mcpoke-input" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="Bearer token" />
        </>
      )}
      {authMode === 'oauth' && (
        <input className="mcpoke-input" value={oauthNotes} onChange={(e) => setOauthNotes(e.target.value)} placeholder="OAuth notes / guidance" />
      )}
      {authMode === 'custom' && (
        <textarea
          className="mcpoke-input"
          style={{ minHeight: '4.5rem', fontFamily: 'var(--font-mono)' }}
          value={customEnvText}
          onChange={(e) => setCustomEnvText(e.target.value)}
          placeholder={'KEY=value\nANOTHER_KEY=value'}
        />
      )}
      {transport !== 'sse' && (
        <input className="mcpoke-input" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Args (space-separated)" />
      )}
      {transport === 'http' && (
        <>
          <label className="mcpoke-check-label">
            <input type="checkbox" className="mcpoke-check-input" checked={ext} onChange={(e) => setExt(e.target.checked)} />
            External start (you run the server)
          </label>
          <input className="mcpoke-input" value={mcpPath} onChange={(e) => setMcpPath(e.target.value)} placeholder="MCP path e.g. /mcp" />
        </>
      )}
      <button type="button" className="mcpoke-btn-pri mcpoke-btn-full" onClick={() => void submit()}>
        Add server
      </button>
    </div>
  )
}
