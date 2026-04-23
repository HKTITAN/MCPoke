import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { getAuthViewModel, loginInteractive, logoutInteractive } from './services/authService.js'
import {
  initRuntime,
  getRegistryList,
  installServer,
  startServer,
  stopServer,
  restartServer,
  startTunnel,
  stopTunnel,
  refreshToolsOnServer,
  setPortFor,
  checkPortFor,
  pickRandomPort,
  upsertRegistryItem,
  deleteRegistryItem,
  getLogsFor
} from './services/runtimeCoordinator.js'
import { IPC, type IpcResult } from '../../shared/ipc.js'
import type { LogEntry, PortConfig, ServerRegistryItem } from '../../shared/mcp-types.js'

const __dir = dirname(fileURLToPath(import.meta.url))

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function er<T = never>(message: string, code?: string): IpcResult<T> {
  return { ok: false, error: message, code }
}

function createWindow() {
  const w = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'MCPoke',
    backgroundColor: '#0a0a0a',
    show: true,
    webPreferences: {
      preload: join(__dir, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void w.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void w.loadFile(join(__dir, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await initRuntime()
  createWindow()
  installIpc()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

function installIpc() {
  ipcMain.handle(IPC.authGet, () => getAuthViewModel())
  ipcMain.handle(IPC.authLogin, async () => {
    try {
      return ok(await loginInteractive({ openBrowser: true }))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.authLogout, async () => {
    try {
      return ok(await logoutInteractive())
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.registryList, () => getRegistryList())
  ipcMain.handle(IPC.registryUpsert, async (_e, p: { item: ServerRegistryItem }) => {
    try {
      return ok(await upsertRegistryItem(p.item))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.registryDelete, async (_e, p: { id: string }) => {
    try {
      await deleteRegistryItem(p.id)
      return ok(undefined)
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.runtimeInstall, async (_e, id: string) => {
    try {
      return ok(await installServer(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.runtimeStart, async (_e, id: string) => {
    try {
      return ok(await startServer(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.runtimeStop, async (_e, id: string) => {
    try {
      return ok(await stopServer(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.runtimeRestart, async (_e, id: string) => {
    try {
      return ok(await restartServer(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.runtimeTunnel, async (_e, id: string) => {
    try {
      return ok(await startTunnel(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.runtimeTunnelStop, async (_e, id: string) => {
    try {
      return ok(await stopTunnel(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.refreshTools, async (_e, id: string) => {
    try {
      return ok(await refreshToolsOnServer(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.checkPort, async (_e, id: string) => {
    try {
      return ok(await checkPortFor(id))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.pickPort, async () => {
    try {
      return ok(await pickRandomPort())
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.setPort, async (_e, p: { id: string; config: PortConfig }) => {
    try {
      return ok(await setPortFor(p.id, p.config))
    } catch (e) {
      return er(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.getLogs, async (_e, p: { id: string; max?: number }): Promise<LogEntry[]> => {
    return getLogsFor(p.id)
  })
  ipcMain.handle('mcpoke:openExternal', async (_e, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
  })
  ipcMain.handle('mcpoke:version', () => ({
    node: process.versions.node,
    electron: process.versions.electron,
    mcpoke: '0.1.0'
  }))
  ipcMain.handle('mcpoke:ref:mcp', () => {
    void shell.openExternal('https://github.com/modelcontextprotocol')
  })
  ipcMain.handle('mcpoke:ref:poke', () => {
    void shell.openExternal('https://www.npmjs.com/package/poke?activeTab=readme')
  })
  ipcMain.handle('mcpoke:ref:inspector', (_e, u?: string) => {
    void shell.openExternal(u && u.startsWith('http') ? u : 'https://github.com/modelcontextprotocol/inspector')
  })
}
