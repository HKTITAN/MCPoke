import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { LogEntry, LogLevel, LogStreamType } from '../../../shared/mcp-types.js'
import { IPC } from '../../../shared/ipc.js'

const RING = 2000
const byServer = new Map<string, LogEntry[]>()

function ring(id: string): LogEntry[] {
  let a = byServer.get(id)
  if (!a) {
    a = []
    byServer.set(id, a)
  }
  return a
}

function emitLogs(serverId: string, log: LogEntry) {
  const tail = getLogs(serverId)
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.onLogs, { id: serverId, log, tail })
  }
}

export function pushLog(
  serverId: string,
  part: { message: string; level?: LogLevel; stream: LogStreamType; source: string }
): LogEntry {
  const log: LogEntry = {
    id: randomUUID(),
    timestamp: Date.now(),
    level: part.level ?? 'info',
    source: part.source,
    message: part.message,
    stream: part.stream
  }
  const arr = ring(serverId)
  arr.push(log)
  if (arr.length > RING) arr.splice(0, arr.length - RING)
  emitLogs(serverId, log)
  return log
}

export function getLogs(serverId: string, max = 500): LogEntry[] {
  const a = ring(serverId)
  if (a.length <= max) return [...a]
  return a.slice(-max)
}

export function clearLogs(serverId: string): void {
  byServer.set(serverId, [])
}
