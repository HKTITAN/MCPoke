import { exec } from 'node:child_process'
import type { ExecException } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, extname, join } from 'node:path'
import { homedir, tmpdir, platform, arch, hostname, uptime, totalmem, freemem } from 'node:os'
import { PermissionEngine } from './permissionEngine.js'

const BLOCKED_PATH_PARTS = ['.config/poke', '.aws/credentials', '.ssh']

function expandHome(p: string): string {
  return resolve(p.replace(/^~(?=$|[\\/])/, homedir()))
}

function ensurePathAllowed(path: string) {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  if (BLOCKED_PATH_PARTS.some((part) => normalized.includes(part))) {
    throw new Error('Path is blocked by credential protection policy')
  }
}

function execCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolveResult) => {
    exec(command, { cwd: cwd || homedir(), timeout: 30_000, maxBuffer: 1024 * 1024 }, (err: ExecException | null, stdout: string, stderr: string) => {
      resolveResult({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), exitCode: err ? Number(err.code ?? 1) : 0 })
    })
  })
}

async function captureScreenshot(outPath: string): Promise<void> {
  const os = platform()
  if (os === 'darwin') {
    const r = await execCommand(`/usr/sbin/screencapture -x "${outPath}"`)
    if (r.exitCode !== 0) throw new Error(r.stderr || 'screencapture failed')
    return
  }
  if (os === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
      '$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height',
      '$gfx = [System.Drawing.Graphics]::FromImage($bmp)',
      '$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)',
      `$bmp.Save('${outPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      '$gfx.Dispose()',
      '$bmp.Dispose()'
    ].join('; ')
    const r = await execCommand(`powershell -NoProfile -NonInteractive -Command "${script}"`)
    if (r.exitCode !== 0) throw new Error(r.stderr || 'PowerShell screenshot failed')
    return
  }
  const attempts = [
    `gnome-screenshot -f "${outPath}"`,
    `grim "${outPath}"`,
    `import -window root "${outPath}"`
  ]
  let lastError = 'No screenshot utility available'
  for (const cmd of attempts) {
    const r = await execCommand(cmd)
    if (r.exitCode === 0) return
    lastError = r.stderr || r.stdout || lastError
  }
  throw new Error(lastError)
}

export class HostToolsService {
  constructor(private readonly permission: PermissionEngine) {}

  async runTool(sessionId: string, name: string, args: Record<string, unknown>) {
    const policyError = this.permission.evaluatePolicy(name, args)
    if (policyError) return { isError: true, content: [{ type: 'text', text: `Blocked by policy: ${policyError}` }] }

    const approveAll = args.remember_all_risky === true
    if (this.permission.shouldRequestApproval(sessionId, name)) {
      const approved = args.approve === true && this.permission.validateApproval(sessionId, name, args, String(args.approval_token ?? ''))
      if (!approved) {
        const req = this.permission.requestApproval(sessionId, name, args)
        return {
          isError: true,
          content: [{ type: 'text', text: 'AWAITING_APPROVAL: ask user, then call again with approve=true and approval_token' }],
          structuredContent: { status: 'AWAITING_APPROVAL', approvalToken: req.token, expiresAt: req.expiresAt }
        }
      }
      if (approveAll) this.permission.enableApproveAll(sessionId)
    }

    switch (name) {
      case 'run_command': {
        const result = await execCommand(String(args.command ?? ''), args.cwd ? String(args.cwd) : undefined)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.exitCode !== 0 }
      }
      case 'read_file': {
        const p = expandHome(String(args.path ?? ''))
        ensurePathAllowed(p)
        return { content: [{ type: 'text', text: readFileSync(p, 'utf8').slice(0, 150_000) }] }
      }
      case 'write_file': {
        const p = expandHome(String(args.path ?? ''))
        ensurePathAllowed(p)
        writeFileSync(p, String(args.content ?? ''), 'utf8')
        return { content: [{ type: 'text', text: `Written: ${p}` }] }
      }
      case 'list_directory': {
        const p = expandHome(String(args.path ?? homedir()))
        ensurePathAllowed(p)
        const rows = readdirSync(p).map((entry) => {
          const st = statSync(join(p, entry))
          return `${st.isDirectory() ? 'd' : '-'} ${entry}`
        })
        return { content: [{ type: 'text', text: rows.join('\n') }] }
      }
      case 'system_info': {
        const info = {
          hostname: hostname(),
          platform: platform(),
          arch: arch(),
          uptimeSeconds: uptime(),
          totalMemory: totalmem(),
          freeMemory: freemem(),
          home: homedir()
        }
        return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] }
      }
      case 'read_image': {
        const p = expandHome(String(args.path ?? ''))
        ensurePathAllowed(p)
        const ext = extname(p).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'
        const buf = readFileSync(p)
        return { content: [{ type: 'image', data: buf.toString('base64'), mimeType: mime }] }
      }
      case 'take_screenshot': {
        const out = args.path ? expandHome(String(args.path)) : join(tmpdir(), `mcpoke-shot-${Date.now()}.png`)
        await captureScreenshot(out)
        return { content: [{ type: 'text', text: `Saved screenshot: ${out}` }] }
      }
      default:
        return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  }
}
