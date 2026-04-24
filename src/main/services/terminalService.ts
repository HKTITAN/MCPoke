import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

type Session = {
  id: string
  shell: string
  cwd: string
  process: ChildProcessWithoutNullStreams
  createdAt: number
}

type CommandRun = {
  id: string
  sessionId: string
  command: string
  startedAt: number
  completedAt?: number
  exitCode?: number
  output: string[]
  process?: ChildProcess
}

const sessions = new Map<string, Session>()
const commands = new Map<string, CommandRun>()

function historyPath() {
  return join(app.getPath('userData'), 'terminal', 'history.ndjson')
}

async function writeHistory(event: Record<string, unknown>) {
  const path = historyPath()
  await fs.mkdir(join(app.getPath('userData'), 'terminal'), { recursive: true })
  await fs.appendFile(path, `${JSON.stringify(event)}\n`, 'utf8')
}

function defaultShell() {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/bash'
}

export function createTerminalSession(cwd?: string) {
  const id = randomUUID()
  const shell = defaultShell()
  const workingDir = cwd || app.getPath('home')
  const proc = spawn(shell, [], { cwd: workingDir, stdio: 'pipe' })
  const session: Session = { id, shell, cwd: workingDir, process: proc, createdAt: Date.now() }
  sessions.set(id, session)
  void writeHistory({ type: 'session_created', id, shell, cwd: workingDir, at: Date.now() })
  return { id, shell, cwd: workingDir, createdAt: session.createdAt }
}

export function listTerminalSessions() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    shell: s.shell,
    cwd: s.cwd,
    pid: s.process.pid,
    createdAt: s.createdAt
  }))
}

export function runTerminalCommand(sessionId: string, command: string): Promise<CommandRun> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error(`Unknown session: ${sessionId}`)
  const cmdId = randomUUID()
  const run: CommandRun = { id: cmdId, sessionId, command, startedAt: Date.now(), output: [] }
  commands.set(cmdId, run)
  void writeHistory({ type: 'command_started', id: cmdId, sessionId, command, at: run.startedAt })

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: session.cwd,
      shell: true,
      env: process.env,
      stdio: 'pipe'
    })
    run.process = child
    child.stdout?.on('data', (chunk: Buffer) => {
      run.output.push(chunk.toString('utf8'))
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      run.output.push(chunk.toString('utf8'))
    })
    child.on('error', (err) => {
      run.completedAt = Date.now()
      run.exitCode = 1
      run.output.push(err.message)
      void writeHistory({ type: 'command_failed', id: cmdId, sessionId, command, at: run.completedAt, error: err.message })
      reject(err)
    })
    child.on('close', (code) => {
      run.completedAt = Date.now()
      run.exitCode = code ?? 1
      void writeHistory({ type: 'command_completed', id: cmdId, sessionId, command, at: run.completedAt, exitCode: run.exitCode })
      resolve(run)
    })
  })
}

export function getCommandStatus(commandId: string) {
  const cmd = commands.get(commandId)
  if (!cmd) throw new Error(`Unknown command: ${commandId}`)
  return {
    id: cmd.id,
    sessionId: cmd.sessionId,
    command: cmd.command,
    startedAt: cmd.startedAt,
    completedAt: cmd.completedAt,
    exitCode: cmd.exitCode,
    done: typeof cmd.completedAt === 'number'
  }
}

export function captureCommandOutput(commandId: string) {
  const cmd = commands.get(commandId)
  if (!cmd) throw new Error(`Unknown command: ${commandId}`)
  return cmd.output.join('')
}

export function listCommands(sessionId?: string) {
  return Array.from(commands.values())
    .filter((c) => !sessionId || c.sessionId === sessionId)
    .map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      command: c.command,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      exitCode: c.exitCode
    }))
}

export function killTerminalSession(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return { ok: true }
  session.process.kill('SIGTERM')
  sessions.delete(sessionId)
  void writeHistory({ type: 'session_killed', id: sessionId, at: Date.now() })
  return { ok: true }
}

export function killTerminalCommand(commandId: string) {
  const cmd = commands.get(commandId)
  if (!cmd || !cmd.process) return { ok: true }
  cmd.process.kill('SIGTERM')
  cmd.completedAt = Date.now()
  cmd.exitCode = cmd.exitCode ?? 143
  void writeHistory({ type: 'command_killed', id: commandId, at: cmd.completedAt })
  return { ok: true }
}
