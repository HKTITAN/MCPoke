import { createHmac, randomUUID } from 'node:crypto'
import type { PermissionMode } from '../../../shared/mcp-types.js'

type ApprovalRequest = {
  token: string
  sessionId: string
  toolName: string
  digest: string
  expiresAt: number
}

const RISKY_TOOLS = new Set(['run_command', 'write_file', 'take_screenshot'])
const LIMITED_ALLOWLIST = new Set([
  'ls', 'pwd', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'sed', 'awk', 'which', 'echo', 'stat', 'du', 'df', 'ps', 'uname', 'whoami', 'curl', 'jq'
])
const SANDBOX_ALLOWLIST = new Set([
  ...LIMITED_ALLOWLIST,
  'node', 'npm', 'python', 'python3', 'git', 'ffmpeg'
])
const DANGEROUS_PATTERNS = [/rm\s+-rf/i, /\bsudo\b/i, /shutdown/i, /reboot/i, /mkfs/i, /diskutil\s+erase/i, /curl\s+[^\n]*\|\s*(sh|bash|zsh)/i]

function commandExecutable(command: string): string {
  const trimmed = command.trim().replace(/^sudo\s+/, '')
  const match = trimmed.match(/^([A-Za-z0-9_./-]+)/)
  if (!match) return ''
  const parts = match[1].split('/')
  return parts[parts.length - 1] ?? ''
}

function splitSegments(command: string): string[] {
  return command.split(/&&|\|\||;|\n/).map((segment) => segment.trim()).filter(Boolean)
}

export class PermissionEngine {
  private readonly secret = randomUUID()
  private readonly approvals = new Map<string, ApprovalRequest>()
  private readonly sessionApproveAll = new Set<string>()
  private mode: PermissionMode = 'sandbox'

  setMode(mode: PermissionMode) {
    this.mode = mode
  }

  getMode(): PermissionMode {
    return this.mode
  }

  private signDigest(input: string): string {
    return createHmac('sha256', this.secret).update(input).digest('hex')
  }

  private argDigest(toolName: string, args: Record<string, unknown>): string {
    return this.signDigest(`${toolName}:${JSON.stringify(args)}`)
  }

  evaluatePolicy(toolName: string, args: Record<string, unknown>): string | null {
    if (this.mode === 'full') return null
    if (this.mode === 'limited') {
      if (toolName === 'run_command') {
        const cmd = String(args.command ?? '')
        if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(cmd))) return 'Command matches dangerous pattern'
        for (const segment of splitSegments(cmd)) {
          const executable = commandExecutable(segment)
          if (!LIMITED_ALLOWLIST.has(executable)) return `Command '${executable || 'unknown'}' is blocked in limited mode`
        }
        return null
      }
      if (toolName === 'write_file' || toolName === 'take_screenshot') return `Tool '${toolName}' is blocked in limited mode`
      return null
    }
    if (toolName === 'run_command') {
      const cmd = String(args.command ?? '')
      if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(cmd))) return 'Command matches dangerous pattern'
      for (const segment of splitSegments(cmd)) {
        const executable = commandExecutable(segment)
        if (!SANDBOX_ALLOWLIST.has(executable)) return `Command '${executable || 'unknown'}' is blocked in sandbox mode`
      }
    }
    if (toolName === 'write_file' || toolName === 'take_screenshot') return `Tool '${toolName}' is blocked in sandbox mode`
    return null
  }

  shouldRequestApproval(sessionId: string, toolName: string): boolean {
    if (!RISKY_TOOLS.has(toolName)) return false
    return !this.sessionApproveAll.has(sessionId)
  }

  requestApproval(sessionId: string, toolName: string, args: Record<string, unknown>): ApprovalRequest {
    const token = randomUUID()
    const req: ApprovalRequest = {
      token,
      sessionId,
      toolName,
      digest: this.argDigest(toolName, args),
      expiresAt: Date.now() + 5 * 60_000
    }
    this.approvals.set(token, req)
    return req
  }

  validateApproval(sessionId: string, toolName: string, args: Record<string, unknown>, token?: string): boolean {
    if (!token) return false
    const req = this.approvals.get(token)
    if (!req) return false
    if (req.expiresAt < Date.now()) return false
    const digest = this.argDigest(toolName, args)
    const ok = req.sessionId === sessionId && req.toolName === toolName && req.digest === digest
    if (ok) this.approvals.delete(token)
    return ok
  }

  enableApproveAll(sessionId: string) {
    this.sessionApproveAll.add(sessionId)
  }
}
