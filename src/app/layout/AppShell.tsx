import { useEffect, useState } from 'react'
import { useAppStore } from '../../state/appStore'
import { RegistryTable } from '../../features/registry/RegistryTable'
import { ServerInspector } from '../../features/inspector/ServerInspector'
import { LogsPanel } from '../../features/logs/LogsPanel'
import { CommandPalette } from '../../features/command/CommandPalette'
import { MarketplacePanel } from '../../features/marketplace/MarketplacePanel'
import { initSounds, sounds } from '../../renderer/sounds'

const tabs = [
  { id: 'registry' as const, label: 'Registry' },
  { id: 'browse' as const, label: 'Browse' },
  { id: 'running' as const, label: 'Running' },
  { id: 'logs' as const, label: 'Logs' },
  { id: 'auth' as const, label: 'Auth' },
  { id: 'settings' as const, label: 'Settings' }
]

export function AppShell() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const init = useAppStore((s) => s.init)
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const auth = useAppStore((s) => s.auth)
  const loadRegistry = useAppStore((s) => s.loadRegistry)
  const servers = useAppStore((s) => s.servers)

  useEffect(() => {
    init()
    initSounds()
  }, [init])

  const runningCount = servers.filter((s) =>
    ['running', 'tunneling', 'tunneled', 'deployed', 'starting'].includes(s.running.state)
  ).length

  const stopFromRunningTab = async (id: string) => {
    try {
      await window.mcpoke.stop(id)
      await loadRegistry()
      sounds.stop()
    } catch {
      sounds.error()
    }
  }

  return (
    <div className="mcpoke-shell">
      <header className="mcpoke-header">
        <div className="mcpoke-header-brand">
          <div className="mcpoke-brand-dot" />
          <div className="mcpoke-brand-title">MCPoke</div>
        </div>
        <div className="mcpoke-header-sep" />
        <nav className="mcpoke-header-nav">
          {tabs.map((t) => (
            <div key={t.id} className="mcpoke-tab-wrap">
              <button
                type="button"
                onClick={() => { setTab(t.id); sounds.tab() }}
                className="mcpoke-btn-ghost"
                style={{ color: tab === t.id ? 'var(--color-fg)' : 'var(--color-muted)' }}
              >
                {t.label}
                {t.id === 'running' && runningCount > 0 && (
                  <span className="mcpoke-tab-count">{runningCount}</span>
                )}
              </button>
              {tab === t.id && <div className="mcpoke-tab-indicator" />}
            </div>
          ))}
        </nav>
        <div className="mcpoke-header-spacer" />
        <div className="mcpoke-header-auth" title={auth?.email ?? auth?.identityLabel}>
          {auth?.state === 'authenticated' && (
            <button
              type="button"
              className="mcpoke-auth-ok"
              style={{ cursor: 'pointer', background: 'none', border: '1px solid rgba(34,197,94,0.2)' }}
              onClick={() => { setTab('auth'); sounds.tab() }}
              title={auth.email}
            >
              {auth.name ?? auth.identityLabel}
            </button>
          )}
          {auth?.state === 'unauthenticated' && (
            <button
              type="button"
              className="mcpoke-btn-ghost mcpoke-auth-signin"
              onClick={() => { setTab('auth'); sounds.tab() }}
            >
              Sign in
            </button>
          )}
          {auth?.state === 'expired' && (
            <button
              type="button"
              className="mcpoke-auth-warn"
              style={{ cursor: 'pointer', background: 'rgba(245,158,11,0.1)' }}
              onClick={() => { setTab('auth'); sounds.tab() }}
            >
              expired
            </button>
          )}
          {auth?.state === 'pending_device_code' && (
            <button
              type="button"
              className="mcpoke-btn-ghost mcpoke-auth-pending"
              onClick={() => { setTab('auth'); sounds.tab() }}
            >
              waiting
            </button>
          )}
          {auth?.state === 'error' && (
            <button
              type="button"
              className="mcpoke-auth-warn mcpoke-auth-error"
              onClick={() => { setTab('auth'); sounds.tab() }}
            >
              auth error
            </button>
          )}
        </div>
        <button type="button" className="mcpoke-btn" onClick={() => setCommandOpen(true)}>
          ⌘K
        </button>
      </header>

      <div className="mcpoke-content">
        {tab === 'registry' && (
          <>
            <RegistryTable />
            <ServerInspector />
          </>
        )}
        {tab === 'browse' && <MarketplacePanel />}
        {tab === 'auth' && (
          <div className="mcpoke-scroll mcpoke-pane">
            <AuthPane />
          </div>
        )}
        {tab === 'running' && (
          <div className="mcpoke-scroll mcpoke-pane-compact">
            {servers
              .filter((s) => ['running','tunneling','tunneled','deployed','starting'].includes(s.running.state))
              .map((s) => (
                <div key={s.item.id} className="mcpoke-running-row">
                  <div className="mcpoke-dot mcpoke-dot-ok" />
                  <span style={{ flex: 1, fontWeight: 500 }}>{s.item.name}</span>
                  <span className="mcpoke-chip" style={{ color: 'var(--color-ok)', borderColor: 'rgba(34,197,94,0.2)' }}>
                    {s.running.state}
                  </span>
                  {s.running.pid && <span className="mcpoke-id-code">pid {s.running.pid}</span>}
                  <button
                    type="button"
                    className="mcpoke-btn"
                    onClick={() => void stopFromRunningTab(s.item.id)}
                    style={{ marginLeft: '0.375rem' }}
                  >
                    Stop
                  </button>
                </div>
              ))}
            {runningCount === 0 && (
              <div className="mcpoke-muted-empty">
                No active servers — start one from Registry.
              </div>
            )}
          </div>
        )}
        {tab === 'logs' && (
          <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid var(--color-border)' }}>
            <LogsPanel />
          </div>
        )}
        {tab === 'settings' && (
          <div className="mcpoke-scroll mcpoke-settings-pane">
            <SettingsPane loadRegistry={loadRegistry} />
          </div>
        )}
      </div>
      <CommandPalette />
    </div>
  )
}

function WhoamiCard() {
  const auth = useAppStore((s) => s.auth)
  if (!auth || auth.state !== 'authenticated') return null

  const expiryMs = auth.expiresAt ? auth.expiresAt - Date.now() : null
  const expiryH = expiryMs ? Math.floor(expiryMs / 3_600_000) : null
  const expiryLabel = expiryH !== null
    ? (expiryH > 48 ? `${Math.floor(expiryH / 24)}d` : expiryH > 0 ? `${expiryH}h` : 'soon')
    : null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
      padding: '0.875rem 1rem', borderRadius: '0.625rem',
      border: '1px solid rgba(34,197,94,0.2)', backgroundColor: 'rgba(34,197,94,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'rgb(74,222,128)', flexShrink: 0, boxShadow: '0 0 6px rgba(74,222,128,0.5)' }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-fg)' }}>
          {auth.name ?? auth.identityLabel}
        </span>
      </div>
      {auth.email && auth.email !== auth.name && (
        <div style={{ fontSize: '11px', color: 'var(--color-muted)', paddingLeft: '1.25rem' }}>
          {auth.email}
        </div>
      )}
      {auth.sub && (
        <div style={{ fontSize: '10px', color: 'var(--color-muted)', paddingLeft: '1.25rem', fontFamily: 'var(--font-mono)' }}>
          id {auth.sub}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', paddingLeft: '1.25rem', marginTop: '0.125rem', flexWrap: 'wrap' }}>
        {auth.tokenPreview && (
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
            token {auth.tokenPreview}
          </span>
        )}
        {expiryLabel && (
          <span style={{ fontSize: '10px', color: 'var(--color-muted)' }}>
            expires in {expiryLabel}
          </span>
        )}
      </div>
    </div>
  )
}

function LoginCodeCard() {
  const loginCode = useAppStore((s) => s.loginCode)
  if (!loginCode) return null
  return (
    <div style={{
      padding: '1rem', borderRadius: '0.625rem',
      border: '1px solid rgba(29,155,240,0.3)',
      backgroundColor: 'rgba(29,155,240,0.05)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem'
    }}>
      <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
        Open your browser and enter this code:
      </div>
      <div style={{
        textAlign: 'center', fontFamily: 'var(--font-mono)',
        fontSize: '22px', fontWeight: 700, letterSpacing: '0.2em',
        color: 'var(--color-accent)', padding: '0.5rem'
      }}>
        {loginCode.userCode}
      </div>
      {loginCode.loginUrl && (
        <div style={{ fontSize: '11px', color: 'var(--color-muted)', textAlign: 'center' }}>
          {loginCode.loginUrl}
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--color-muted)', textAlign: 'center' }}>
        Waiting for authentication…
      </div>
    </div>
  )
}

function AuthPane() {
  const setAuth = useAppStore((s) => s.setAuth)
  const setLoginCode = useAppStore((s) => s.setLoginCode)
  const auth = useAppStore((s) => s.auth)
  const authError = useAppStore((s) => s.authError)
  const loginCode = useAppStore((s) => s.loginCode)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const doLogin = async () => {
    setBusy(true)
    setErr(null)
    setLoginCode(null)
    try {
      const a = await window.mcpoke.login()
      setAuth(a)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doLogout = async () => {
    setBusy(true)
    setErr(null)
    try {
      const a = await window.mcpoke.logout()
      setAuth(a)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mcpoke-auth-card">
      <div>
        <div className="mcpoke-sec-head">
          <span className="mcpoke-section-label">Poke Authentication</span>
          <div className="mcpoke-sec-line" />
        </div>
        <p className="mcpoke-auth-desc">
          Connect to <strong className="mcpoke-auth-strong">poke.com</strong> to tunnel local MCP servers
          and make them accessible to your AI agent from anywhere.
        </p>
      </div>

      <WhoamiCard />
      <LoginCodeCard />

      {(err || authError) && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid rgba(244,33,46,0.2)', backgroundColor: 'rgba(244,33,46,0.05)' }}>
          {err ?? authError?.message}
        </div>
      )}

      <div className="mcpoke-inline-actions">
        {auth?.state !== 'authenticated' && (
          <button
            type="button"
            className="mcpoke-btn-pri"
            disabled={busy}
            onClick={() => void doLogin()}
          >
            {busy && !loginCode ? 'Opening browser…' : loginCode || auth?.state === 'pending_device_code' ? 'Waiting for code…' : 'Login with Poke'}
          </button>
        )}
        {auth?.state === 'authenticated' && (
          <button
            type="button"
            className="mcpoke-btn"
            disabled={busy}
            onClick={() => void doLogout()}
          >
            {busy ? '…' : 'Logout'}
          </button>
        )}
        <button
          type="button"
          className="mcpoke-btn-ghost"
          disabled={busy}
          onClick={async () => { const a = await window.mcpoke.getAuth(); setAuth(a) }}
        >
          Refresh
        </button>
      </div>

      {(auth?.state === 'unauthenticated' || auth?.state === 'error' || auth?.state === 'expired') && (
        <div className="mcpoke-note-inline">
          Credentials are stored at{' '}
          <code className="mcpoke-code-inline">
            {auth?.credentialsPathHint ?? '~/.config/poke/credentials.json'}
          </code>
        </div>
      )}
    </div>
  )
}

function SettingsPane({ loadRegistry }: { loadRegistry: () => Promise<void> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <div className="mcpoke-sec-head">
          <span className="mcpoke-section-label">About</span>
          <div className="mcpoke-sec-line" />
        </div>
        <p style={{ color: 'var(--color-muted)', lineHeight: 1.6, fontSize: '12px' }}>
          MCPoke connects local MCP servers, inspects tools, streams logs, and tunnels HTTP endpoints to Poke.
        </p>
      </div>
      <div>
        <div className="mcpoke-sec-head">
          <span className="mcpoke-section-label">References</span>
          <div className="mcpoke-sec-line" />
        </div>
        <div className="mcpoke-link-list">
          {[
            { label: '↗ modelcontextprotocol (GitHub)', fn: () => window.mcpoke.openMcpDocs() },
            { label: '↗ Poke SDK on npm', fn: () => window.mcpoke.openPokeNpm() },
            { label: '↗ MCP Inspector', fn: () => window.mcpoke.openMcpInspector('') },
          ].map(({ label, fn }) => (
            <button key={label} type="button" className="mcpoke-btn-ghost mcpoke-link-btn"
              onClick={fn}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mcpoke-sec-head">
          <span className="mcpoke-section-label">Actions</span>
          <div className="mcpoke-sec-line" />
        </div>
        <button type="button" className="mcpoke-btn" onClick={() => { void loadRegistry() }}>
          Rescan registry
        </button>
      </div>
      <p className="mcpoke-about-footer">
        Node {window.mcpoke.versions.node} · Electron {window.mcpoke.versions.electron} · {window.mcpoke.platform}
      </p>
    </div>
  )
}
