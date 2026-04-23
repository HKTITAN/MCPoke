import type { ServerRegistryItem } from '../../../shared/mcp-types.js'

export const PRESET_SERVERS: ServerRegistryItem[] = [
  {
    id: 'preset-mcp-hello',
    name: 'Local HTTP bridge (external)',
    description:
      'HTTP MCP: set port, start your server externally, then connect here. Tunnel forwards this URL to Poke.',
    source: 'preset',
    config: {
      transport: 'http',
      command: 'node',
      args: ['-e', "console.log('Point Start at your own HTTP MCP, or set external only')"],
      mcpPath: '/mcp',
      useExternalStart: true
    },
    platform: { win32: true, darwin: true, linux: true, notes: 'Set port + path; start server yourself if external' },
    lastSync: 0
  },
  {
    id: 'preset-remote-http',
    name: 'Remote HTTP MCP endpoint',
    description: 'Connect directly to a remote HTTP MCP endpoint and monitor deploy readiness.',
    source: 'preset',
    config: {
      transport: 'http',
      remoteUrl: 'https://example.com/mcp'
    },
    platform: { win32: true, darwin: true, linux: true, notes: 'Remote endpoint; no local process required' },
    lastSync: 0
  },
  {
    id: 'preset-remote-sse',
    name: 'Remote SSE MCP endpoint',
    description: 'Track legacy SSE-based MCP endpoints as first-class remote connections.',
    source: 'preset',
    config: {
      transport: 'sse',
      remoteUrl: 'https://example.com/sse'
    },
    platform: { win32: true, darwin: true, linux: true, notes: 'Remote SSE endpoint; no local process required' },
    lastSync: 0
  },
  {
    id: 'preset-mcp-stdio',
    name: 'stdio: filesystem (npx template)',
    description:
      'MCP from npm with stdio. Run tools via the SDK, tunnel only works for HTTP — use a local HTTP server for Poke bridge.',
    source: 'preset',
    config: {
      transport: 'stdio',
      packageSpec: '@modelcontextprotocol/server-filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.', '-stdio'],
      mcpPath: '/mcp'
    },
    platform: { win32: true, darwin: true, linux: true, notes: 'Override args; cwd defaults to data dir' },
    lastSync: 0
  }
]
