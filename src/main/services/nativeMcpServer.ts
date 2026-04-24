import http, { type Server as NodeHttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { HostToolsService } from './hostToolsService.js'
import {
  captureCommandOutput,
  createTerminalSession,
  getCommandStatus,
  killTerminalSession,
  listCommands,
  listTerminalSessions,
  runTerminalCommand,
  killTerminalCommand
} from './terminalService.js'
import { PermissionEngine } from './permissionEngine.js'
import type { PermissionMode } from '../../../shared/mcp-types.js'

export type NativeServer = { server: NodeHttpServer; port: number; permission: PermissionEngine }

const TOOL_DEFS = [
  ['run_command', 'Execute shell command on host'],
  ['read_file', 'Read file contents'],
  ['write_file', 'Write file contents'],
  ['list_directory', 'List files in directory'],
  ['system_info', 'System information'],
  ['read_image', 'Read image/binary as base64'],
  ['take_screenshot', 'Capture a screenshot'],
  ['terminal_create_session', 'Create persistent terminal session'],
  ['terminal_list_sessions', 'List terminal sessions'],
  ['terminal_run_command', 'Run command in terminal session'],
  ['terminal_get_command_status', 'Get command status'],
  ['terminal_capture_output', 'Capture command output'],
  ['terminal_kill_session', 'Kill terminal session'],
  ['terminal_list_commands', 'List terminal commands']
  ,
  ['terminal_kill_command', 'Kill running terminal command']
] as const

function response(id: unknown, result: unknown) {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function error(id: unknown, message: string) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } })
}

export async function startNativeMcpServer(port: number, mode: PermissionMode): Promise<NativeServer> {
  const permission = new PermissionEngine()
  permission.setMode(mode)
  const host = new HostToolsService(permission)

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (!req.url?.startsWith('/mcp') || req.method !== 'POST') {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    try {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(Buffer.from(c))
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id?: unknown; method: string; params?: any }
      const id = parsed.id ?? null
      const sessionId = String(req.headers['mcp-session-id'] ?? 'default')

      if (parsed.method === 'initialize') {
        res.setHeader('content-type', 'application/json')
        res.end(response(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mcpoke-native', version: '0.1.0' } }))
        return
      }
      if (parsed.method === 'tools/list') {
        const tools = TOOL_DEFS.map(([name, description]) => ({ name, description, inputSchema: { type: 'object', properties: {} } }))
        res.setHeader('content-type', 'application/json')
        res.end(response(id, { tools }))
        return
      }
      if (parsed.method !== 'tools/call') {
        res.setHeader('content-type', 'application/json')
        res.end(error(id, `Unsupported method: ${parsed.method}`))
        return
      }

      const name = String(parsed.params?.name ?? '')
      const args = (parsed.params?.arguments ?? {}) as Record<string, unknown>
      let result: unknown
      switch (name) {
        case 'terminal_create_session':
          result = { content: [{ type: 'text', text: JSON.stringify(createTerminalSession(String(args.cwd ?? '')), null, 2) }] }
          break
        case 'terminal_list_sessions':
          result = { content: [{ type: 'text', text: JSON.stringify(listTerminalSessions(), null, 2) }] }
          break
        case 'terminal_run_command': {
          const run = await runTerminalCommand(String(args.sessionId ?? ''), String(args.command ?? ''))
          result = { content: [{ type: 'text', text: JSON.stringify({ id: run.id, startedAt: run.startedAt }, null, 2) }] }
          break
        }
        case 'terminal_get_command_status':
          result = { content: [{ type: 'text', text: JSON.stringify(getCommandStatus(String(args.commandId ?? '')), null, 2) }] }
          break
        case 'terminal_capture_output':
          result = { content: [{ type: 'text', text: captureCommandOutput(String(args.commandId ?? '')) }] }
          break
        case 'terminal_kill_session':
          result = { content: [{ type: 'text', text: JSON.stringify(killTerminalSession(String(args.sessionId ?? '')), null, 2) }] }
          break
        case 'terminal_list_commands':
          result = { content: [{ type: 'text', text: JSON.stringify(listCommands(args.sessionId ? String(args.sessionId) : undefined), null, 2) }] }
          break
        case 'terminal_kill_command':
          result = { content: [{ type: 'text', text: JSON.stringify(killTerminalCommand(String(args.commandId ?? '')), null, 2) }] }
          break
        default:
          result = await host.runTool(sessionId || randomUUID(), name, args)
      }
      res.setHeader('content-type', 'application/json')
      res.end(response(id, result))
    } catch (e) {
      res.setHeader('content-type', 'application/json')
      res.end(error(null, e instanceof Error ? e.message : String(e)))
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })
  return { server, port, permission }
}

export async function stopNativeMcpServer(instance: NativeServer | null) {
  if (!instance) return
  await new Promise<void>((resolve) => instance.server.close(() => resolve()))
}
