import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../../state/appStore'
import type {
  AuthRequirementHint,
  McpRegistryEntry,
  McpRegistryPackage,
  ServerRegistryItem
} from '../../../shared/mcp-types.js'
import { DEFAULT_PLATFORM } from '../../../shared/mcp-types.js'
import { sounds } from '../../renderer/sounds'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract GitHub owner from io.github.OWNER/repo IDs or repository URL */
function githubOwner(entry: McpRegistryEntry): string | null {
  if (entry.id.startsWith('io.github.')) {
    const owner = entry.id.slice('io.github.'.length).split('/')[0]
    if (owner) return owner
  }
  if (entry.repository?.url) {
    const m = entry.repository.url.match(/github\.com\/([^/]+)/)
    if (m) return m[1]
  }
  return null
}

function iconUrl(entry: McpRegistryEntry): string | null {
  if (entry.icons && entry.icons.length > 0) return entry.icons[0].src
  const owner = githubOwner(entry)
  if (owner) return `https://avatars.githubusercontent.com/${owner}?s=64`
  const base = entry.websiteUrl ?? entry.remotes?.[0]?.url
  if (base) {
    try {
      const host = new URL(base).hostname
      return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    } catch { /* ignore */ }
  }
  return null
}

function publisherLabel(entry: McpRegistryEntry): string {
  const owner = githubOwner(entry)
  if (owner) return owner
  const domain = entry.id.split('/')[0]
  const parts = domain.split('.')
  // Reverse domain: io.github → github.io, ac.tandem → tandem.ac
  return parts.slice().reverse().join('.')
}

function displayName(entry: McpRegistryEntry): string {
  if (entry.title) return entry.title
  // Humanise the path segment: "docs-mcp" → "Docs Mcp"
  const slug = entry.id.split('/').pop() ?? entry.id
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function primaryPackage(entry: McpRegistryEntry): McpRegistryPackage | null {
  return (
    entry.packages.find((p) => p.registryType === 'npm') ??
    entry.packages.find((p) => p.registryType === 'pypi') ??
    entry.packages[0] ??
    null
  )
}

function inferAuthRequirement(pkg: McpRegistryPackage | null): AuthRequirementHint | undefined {
  if (!pkg?.environmentVariables || pkg.environmentVariables.length === 0) return undefined
  const required = pkg.environmentVariables.filter((v) => v.isRequired).map((v) => v.name)
  const optional = pkg.environmentVariables.filter((v) => !v.isRequired).map((v) => v.name)
  const all = [...required, ...optional]
  if (all.length === 0) return undefined
  const hasApiKey = all.some((n) => /api[_-]?key/i.test(n))
  const hasBearer = all.some((n) => /bearer|access[_-]?token|auth[_-]?token/i.test(n))
  const hasOAuth = all.some((n) => /client[_-]?id|client[_-]?secret|oauth|token[_-]?url|auth[_-]?url/i.test(n))
  const level: AuthRequirementHint['level'] = required.length > 0 ? 'required' : 'optional'
  if (hasApiKey) return { level, mode: 'api_key', envNames: required.length > 0 ? required : all }
  if (hasBearer) return { level, mode: 'bearer', envNames: required.length > 0 ? required : all }
  if (hasOAuth) return { level, mode: 'oauth', envNames: required.length > 0 ? required : all }
  return { level, mode: 'custom', envNames: required.length > 0 ? required : all, description: 'Custom auth env required' }
}

function authModeLabel(hint?: AuthRequirementHint): string | null {
  if (!hint) return null
  if (hint.mode === 'api_key') return 'API key'
  if (hint.mode === 'bearer') return 'Bearer'
  if (hint.mode === 'oauth') return 'OAuth'
  return 'Custom auth'
}

function installKind(entry: McpRegistryEntry): 'npm' | 'pypi' | 'remote' | 'oci' {
  const pkg = primaryPackage(entry)
  if (pkg?.registryType === 'npm') return 'npm'
  if (pkg?.registryType === 'pypi') return 'pypi'
  if (pkg?.registryType === 'oci') return 'oci'
  return 'remote'
}

function transportLabel(entry: McpRegistryEntry): string {
  const pkg = primaryPackage(entry)
  if (pkg) {
    const t = pkg.transport?.type
    if (t === 'streamable-http') return 'http'
    if (t === 'sse') return 'sse'
    return 'stdio'
  }
  if (entry.remotes && entry.remotes.length > 0) {
    return entry.remotes[0].type === 'streamable-http' ? 'http' : entry.remotes[0].type
  }
  return 'stdio'
}

function entryToItem(entry: McpRegistryEntry): ServerRegistryItem {
  const name = displayName(entry)
  const pkg = primaryPackage(entry)
  const remote = entry.remotes?.[0]
  const authRequirement = inferAuthRequirement(pkg)

  if (pkg?.registryType === 'npm') {
    const transport = pkg.transport?.type === 'streamable-http' ? 'http' :
                      pkg.transport?.type === 'sse' ? 'sse' : 'stdio'
    const useNpx = !pkg.runtimeHint || pkg.runtimeHint === 'npx'
    return {
      id: crypto.randomUUID(),
      name,
      description: entry.description,
      source: 'custom',
      config: {
        transport,
        packageSpec: pkg.identifier,
        command: useNpx ? 'npx' : pkg.runtimeHint,
        auth: authRequirement
          ? {
              mode: authRequirement.mode,
              apiKey: authRequirement.mode === 'api_key'
                ? { envName: authRequirement.envNames[0] ?? 'API_KEY', value: '' }
                : undefined,
              bearer: authRequirement.mode === 'bearer'
                ? { envName: authRequirement.envNames[0] ?? 'BEARER_TOKEN', token: '' }
                : undefined,
              oauth: authRequirement.mode === 'oauth'
                ? { notes: `Configure OAuth-related env vars: ${authRequirement.envNames.join(', ')}` }
                : undefined
            }
          : { mode: 'none' },
        authRequirement,
        args: useNpx
          ? ['-y', pkg.identifier, ...(pkg.runtimeArguments ?? [])]
          : [pkg.identifier, ...(pkg.runtimeArguments ?? [])]
      },
      platform: DEFAULT_PLATFORM,
      lastSync: Date.now()
    }
  }

  if (remote) {
    const transport = remote.type === 'streamable-http' ? 'http' : 'sse'
    return {
      id: crypto.randomUUID(),
      name,
      description: entry.description,
      source: 'custom',
      config: { transport, remoteUrl: remote.url },
      platform: DEFAULT_PLATFORM,
      lastSync: Date.now()
    }
  }

  return {
    id: crypto.randomUUID(),
    name,
    description: entry.description,
    source: 'custom',
    config: { transport: 'stdio', command: 'node', args: [] },
    platform: DEFAULT_PLATFORM,
    lastSync: Date.now()
  }
}

// ── Icon component with fallback ────────────────────────────────────────────

function ServerIcon({ entry, size = 40 }: { entry: McpRegistryEntry; size?: number }) {
  const [failed, setFailed] = useState(false)
  const url = iconUrl(entry)
  const name = displayName(entry)
  const letter = name.charAt(0).toUpperCase()

  // Deterministic pastel color from name
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  const bg = `hsl(${hue}, 30%, 18%)`
  const fg = `hsl(${hue}, 60%, 65%)`

  if (!url || failed) {
    return (
      <div
        className="mcpoke-server-icon-fallback"
        style={{ width: size, height: size, backgroundColor: bg, fontSize: Math.round(size * 0.45) + 'px', color: fg }}
      >
        {letter}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="mcpoke-server-icon-img"
      style={{ width: size, height: size }}
    />
  )
}

// ── Badges ──────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: ReturnType<typeof installKind> }) {
  const styles: Record<string, { bg: string; fg: string; border: string; label: string }> = {
    npm:    { bg: 'rgba(204,53,52,0.12)', fg: '#e05252', border: 'rgba(204,53,52,0.25)', label: 'npm' },
    pypi:   { bg: 'rgba(55,117,169,0.12)', fg: '#6ba3d6', border: 'rgba(55,117,169,0.25)', label: 'pypi' },
    oci:    { bg: 'rgba(29,99,237,0.12)', fg: '#6ba3d6', border: 'rgba(29,99,237,0.25)', label: 'docker' },
    remote: { bg: 'rgba(139,92,246,0.12)', fg: '#a78bfa', border: 'rgba(139,92,246,0.25)', label: 'remote' }
  }
  const s = styles[kind] ?? styles.remote
  return (
    <span className="mcpoke-badge-kind" style={{ backgroundColor: s.bg, color: s.fg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

function TransportBadge({ label }: { label: string }) {
  return (
    <span className="mcpoke-badge-transport">
      {label}
    </span>
  )
}

function FirstPartyBadge() {
  return (
    <span title="Official MCP server" className="mcpoke-badge-first">
      ✓ MCP
    </span>
  )
}

// ── Env vars display ────────────────────────────────────────────────────────

function EnvVarList({ pkg }: { pkg: McpRegistryPackage }) {
  const vars = pkg.environmentVariables?.filter((v) => v.isRequired) ?? []
  if (vars.length === 0) return null
  return (
    <div className="mcpoke-env-wrap">
      <div className="mcpoke-micro-heading">
        Required config
      </div>
      <div className="mcpoke-env-row">
        {vars.map((v) => (
          <span key={v.name} title={v.description} className="mcpoke-env-pill">
            {v.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Server card ─────────────────────────────────────────────────────────────

type BusyState = 'idle' | 'adding' | 'starting' | 'tunneling' | 'done' | 'error'

function ServerCard({ entry, expanded, onExpand, onAction }: {
  entry: McpRegistryEntry
  expanded: boolean
  onExpand: () => void
  onAction: (item: ServerRegistryItem, mode: 'add' | 'add-start' | 'add-tunnel') => Promise<void>
}) {
  const [busy, setBusy] = useState<BusyState>('idle')
  const [err, setErr] = useState<string | null>(null)
  const auth = useAppStore((s) => s.auth)
  const servers = useAppStore((s) => s.servers)

  const kind = installKind(entry)
  const transport = transportLabel(entry)
  const pkg = primaryPackage(entry)
  const authHint = inferAuthRequirement(pkg)
  const remote = entry.remotes?.[0]
  const name = displayName(entry)
  const publisher = publisherLabel(entry)
  const canTunnel = auth?.state === 'authenticated'
  const identifier = pkg?.identifier ?? remote?.url ?? ''

  const alreadyAdded = servers.some(
    (s) =>
      (pkg && s.item.config.packageSpec === pkg.identifier) ||
      (remote && s.item.config.remoteUrl === remote.url)
  )

  const isRemoteOnly = kind === 'remote' && !pkg
  const primaryLabel = isRemoteOnly ? 'Connect' : 'Install & Run'
  const busyLabels: Record<BusyState, string> = {
    idle: '', adding: 'Adding…', starting: 'Starting…', tunneling: 'Tunneling…', done: '✓ Done', error: '✗ Failed'
  }

  const act = async (mode: 'add' | 'add-start' | 'add-tunnel') => {
    setBusy(mode === 'add' ? 'adding' : mode === 'add-start' ? 'starting' : 'tunneling')
    setErr(null)
    try {
      await onAction(entryToItem(entry), mode)
      setBusy('done')
      sounds.success()
      setTimeout(() => setBusy('idle'), 1800)
    } catch (e) {
      setBusy('error')
      setErr(e instanceof Error ? e.message : String(e))
      sounds.error()
      setTimeout(() => { setBusy('idle'); setErr(null) }, 4000)
    }
  }

  const isBusy = busy !== 'idle' && busy !== 'done' && busy !== 'error'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand() } }}
      className={`mcpoke-card${expanded ? ' mcpoke-card-expanded' : ''}`}
    >
      {/* Card header — always visible */}
      <div className="mcpoke-card-head">
        <ServerIcon entry={entry} size={40} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mcpoke-card-title-row">
            <span className="mcpoke-card-title">{name}</span>
            {entry.isFirstParty && <FirstPartyBadge />}
            <KindBadge kind={kind} />
            <TransportBadge label={transport} />
            {authModeLabel(authHint) && (
              <span className="mcpoke-badge-transport" title={authHint?.envNames.join(', ')}>
                {authModeLabel(authHint)}
              </span>
            )}
            {alreadyAdded && (
              <span className="mcpoke-card-added">Added</span>
            )}
          </div>

          <div className="mcpoke-card-meta">
            by {publisher}{entry.version ? ` · v${entry.version}` : ''}
          </div>

          <div className="mcpoke-card-desc" style={{ WebkitLineClamp: expanded ? 'unset' : 2 }}>
            {entry.description}
          </div>
        </div>
      </div>

      {/* Identifier row */}
      {identifier && (
        <div className="mcpoke-card-id" title={identifier}>
          {identifier}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mcpoke-card-body"
        >
          {/* All remotes */}
          {entry.remotes && entry.remotes.length > 0 && (
            <div>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
                Endpoints
              </div>
              {entry.remotes.map((r, i) => (
                <div key={i} style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', marginBottom: '0.125rem' }}>
                  {r.url}
                </div>
              ))}
            </div>
          )}

          {/* npm install command */}
          {pkg?.registryType === 'npm' && (
            <div>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
                Install
              </div>
              <div style={{
                fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-fg)',
                backgroundColor: 'var(--color-canvas)', padding: '0.375rem 0.5rem',
                borderRadius: '0.375rem', border: '1px solid var(--color-border)'
              }}>
                npx -y {pkg.identifier}
              </div>
            </div>
          )}

          {/* Required env vars */}
          {pkg && <EnvVarList pkg={pkg} />}
          {authHint && (
            <div>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
                Auth requirement
              </div>
              <div style={{ fontSize: '10px', color: 'var(--color-muted)' }}>
                {authModeLabel(authHint)} · {authHint.level} · {authHint.envNames.join(', ')}
              </div>
            </div>
          )}

          {/* Links */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.125rem' }}>
            {entry.websiteUrl && (
              <button type="button" className="mcpoke-btn-ghost" style={{ fontSize: '10px', color: 'var(--color-muted)', padding: '0.1rem 0' }}
                onClick={() => window.mcpoke.openMcpInspector(entry.websiteUrl!)}>
                ↗ Docs
              </button>
            )}
            {entry.repository?.url && (
              <button type="button" className="mcpoke-btn-ghost" style={{ fontSize: '10px', color: 'var(--color-muted)', padding: '0.1rem 0' }}
                onClick={() => window.mcpoke.openMcpInspector(entry.repository!.url)}>
                ↗ GitHub
              </button>
            )}
          </div>

          {/* Error */}
          {err && (
            <div style={{ fontSize: '11px', color: 'var(--color-danger)', padding: '0.375rem 0.5rem', borderRadius: '0.375rem', border: '1px solid rgba(244,33,46,0.2)', backgroundColor: 'rgba(244,33,46,0.05)' }}>
              {err}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', paddingTop: '0.125rem' }}>
            <button type="button" className="mcpoke-btn" disabled={isBusy}
              onClick={() => void act('add')}>
              {busy === 'adding' ? busyLabels.adding : busy === 'done' ? busyLabels.done : 'Add only'}
            </button>

            <button type="button" className="mcpoke-btn-pri" disabled={isBusy}
              onClick={() => void act('add-start')}>
              {busy === 'starting' ? busyLabels.starting : primaryLabel}
            </button>

            <button
              type="button"
              className={canTunnel ? 'mcpoke-btn-pri' : 'mcpoke-btn'}
              disabled={isBusy || !canTunnel}
              title={canTunnel ? undefined : 'Login to Poke to tunnel'}
              onClick={() => void act('add-tunnel')}
              style={!canTunnel ? { opacity: 0.5 } : {}}
            >
              {busy === 'tunneling' ? busyLabels.tunneling : '↗ Add & Tunnel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Filters ──────────────────────────────────────────────────────────────────

type Filter = 'all' | 'npm' | 'pypi' | 'remote' | 'official'

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All', npm: 'npm', pypi: 'PyPI', remote: 'Remote', official: '✓ MCP'
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function MarketplacePanel() {
  const marketplace = useAppStore((s) => s.marketplace)
  const loading = useAppStore((s) => s.marketplaceLoading)
  const error = useAppStore((s) => s.marketplaceError)
  const loadMarketplace = useAppStore((s) => s.loadMarketplace)
  const loadRegistry = useAppStore((s) => s.loadRegistry)
  const setTab = useAppStore((s) => s.setTab)
  const setSelectedId = useAppStore((s) => s.setSelectedId)
  const auth = useAppStore((s) => s.auth)

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (marketplace.length === 0 && !loading) void loadMarketplace()
  }, [])

  const filtered = useMemo(() => {
    return marketplace.filter((e) => {
      if (filter === 'npm' && !e.packages.some((p) => p.registryType === 'npm')) return false
      if (filter === 'pypi' && !e.packages.some((p) => p.registryType === 'pypi')) return false
      if (filter === 'remote' && (!e.remotes || e.remotes.length === 0) && e.packages.length > 0) return false
      if (filter === 'official' && !e.isFirstParty) return false
      if (q) {
        const ql = q.toLowerCase()
        return (
          (e.title ?? '').toLowerCase().includes(ql) ||
          e.description.toLowerCase().includes(ql) ||
          e.id.toLowerCase().includes(ql) ||
          e.packages.some((p) => p.identifier.toLowerCase().includes(ql)) ||
          e.remotes?.some((r) => r.url.toLowerCase().includes(ql))
        )
      }
      return true
    })
  }, [marketplace, filter, q])

  const handleAction = async (item: ServerRegistryItem, mode: 'add' | 'add-start' | 'add-tunnel') => {
    const added = await window.mcpoke.upsertServer(item)
    await loadRegistry()
    const id = added.item.id
    if (mode === 'add-start' || mode === 'add-tunnel') {
      if (item.config.packageSpec) await window.mcpoke.install(id)
      await window.mcpoke.start(id)
    }
    if (mode === 'add-tunnel') await window.mcpoke.tunnel(id)
    setSelectedId(id)
    setTab('registry')
  }

  return (
    <div className="mcpoke-marketplace">
      {/* Toolbar */}
      <div className="mcpoke-marketplace-toolbar">
        <input
          className="mcpoke-input mcpoke-marketplace-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 500+ MCP servers…"
        />
        <div className="mcpoke-marketplace-filters">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button key={f} type="button"
              className={filter === f ? 'mcpoke-btn-pri' : 'mcpoke-btn-ghost'}
              style={{ fontSize: '11px' }}
              onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <button type="button" className="mcpoke-btn-ghost mcpoke-marketplace-refresh"
          onClick={() => { clearMarketplaceCache_(); void loadMarketplace(q || undefined) }}>
          ↺
        </button>
        <span className="mcpoke-marketplace-count">
          {loading ? '…' : `${filtered.length} / ${marketplace.length}`}
        </span>
      </div>

      {/* Auth nudge */}
      {auth?.state !== 'authenticated' && (
        <div className="mcpoke-auth-nudge">
          <span>Sign in to Poke to tunnel any server to your AI agent.</span>
          <button type="button" className="mcpoke-btn-pri mcpoke-auth-nudge-btn"
            onClick={() => setTab('auth')}>
            Login →
          </button>
        </div>
      )}

      {/* Server grid */}
      <div className="mcpoke-scroll mcpoke-marketplace-scroll">
        {loading && marketplace.length === 0 && (
          <div className="mcpoke-marketplace-empty">
            <div className="mcpoke-marketplace-empty-icon">⬡</div>
            Loading official MCP registry…
          </div>
        )}
        {error && !loading && (
          <div className="mcpoke-marketplace-error">
            <div style={{ marginBottom: '0.5rem' }}>Could not reach registry.modelcontextprotocol.io</div>
            <div className="mcpoke-marketplace-error-sub">{error}</div>
            <button type="button" className="mcpoke-btn" onClick={() => void loadMarketplace()}>Retry</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && marketplace.length > 0 && (
          <div className="mcpoke-marketplace-list-empty">
            No servers match "{q}"
          </div>
        )}
        <div className="mcpoke-marketplace-list">
          {filtered.map((entry) => (
            <ServerCard
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onExpand={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onAction={handleAction}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Hack: call window.mcpoke.clearMarketplaceCache via IPC isn't available, so just reload
function clearMarketplaceCache_() {
  useAppStore.setState({ marketplace: [], marketplaceError: null })
}
