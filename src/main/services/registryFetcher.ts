import type { McpRegistryEntry, McpRegistryPackage } from '../../../shared/mcp-types.js'

const BASE = 'https://registry.modelcontextprotocol.io/v0'
let cache: { data: McpRegistryEntry[]; at: number } | null = null
const TTL = 5 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPackage(p: any): McpRegistryPackage {
  return {
    registryType: p.registryType ?? 'npm',
    identifier: p.identifier ?? '',
    version: p.version,
    transport: p.transport,
    runtimeHint: p.runtimeHint,
    runtimeArguments: p.runtimeArguments,
    packageArguments: p.packageArguments,
    environmentVariables: p.environmentVariables
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEntry(raw: any): McpRegistryEntry {
  // Registry wraps every entry as { server: {...}, _meta: {...} }
  const s = raw.server ?? raw
  const officialMeta = raw._meta?.['io.modelcontextprotocol.registry/official']
  const isFirstParty =
    typeof s.name === 'string' &&
    (s.name.startsWith('io.github.modelcontextprotocol/') ||
     s.name.startsWith('com.anthropic/') ||
     s.name === 'io.modelcontextprotocol/everything')

  return {
    id: s.name ?? '',
    title: s.title,
    description: s.description ?? '',
    version: s.version,
    repository: s.repository,
    websiteUrl: s.websiteUrl,
    packages: Array.isArray(s.packages) ? s.packages.map(mapPackage) : [],
    remotes: Array.isArray(s.remotes) ? s.remotes : [],
    icons: Array.isArray(s.icons) ? s.icons : [],
    isFirstParty,
    publishedAt: officialMeta?.publishedAt,
    updatedAt: officialMeta?.updatedAt
  }
}

export async function fetchMarketplace(search?: string): Promise<McpRegistryEntry[]> {
  if (!cache || Date.now() - cache.at > TTL) {
    const entries: McpRegistryEntry[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const url = new URL(`${BASE}/servers`)
      url.searchParams.set('version', 'latest')
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) })
      if (!res.ok) break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await res.json() as { servers: any[]; metadata: { nextCursor?: string } }
      for (const s of json.servers ?? []) entries.push(mapEntry(s))
      cursor = json.metadata?.nextCursor
      pages++
    } while (cursor && pages < 10)
    // First-party servers first, then alphabetical by display name
    entries.sort((a, b) => {
      if (a.isFirstParty && !b.isFirstParty) return -1
      if (!a.isFirstParty && b.isFirstParty) return 1
      const na = (a.title ?? a.id).toLowerCase()
      const nb = (b.title ?? b.id).toLowerCase()
      return na.localeCompare(nb)
    })
    cache = { data: entries, at: Date.now() }
  }

  const all = cache.data
  if (!search) return all
  const q = search.toLowerCase()
  return all.filter(
    (e) =>
      e.title?.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.packages.some((p) => p.identifier.toLowerCase().includes(q)) ||
      e.remotes?.some((r) => r.url.toLowerCase().includes(q))
  )
}

export function clearMarketplaceCache() {
  cache = null
}
