import { getToken, isLoggedIn, login, logout } from 'poke'
import { BrowserWindow, shell } from 'electron'
import { IPC } from '../../../shared/ipc.js'
import type { AuthViewModel, AuthSessionState } from '../../../shared/mcp-types.js'

function tokenPayload(token: string): Record<string, unknown> | null {
  try {
    const p = token.split('.')[1]
    if (!p) return null
    const b = p.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(Buffer.from(b, 'base64').toString('utf-8')) as Record<string, unknown>
    return json
  } catch {
    return null
  }
}

function sessionState(token: string | undefined): AuthSessionState {
  if (!token) return 'unauthenticated'
  const pl = tokenPayload(token)
  const exp = pl?.exp
  if (typeof exp === 'number' && exp * 1000 < Date.now()) return 'expired'
  return 'authenticated'
}

function identityFromToken(t: string | undefined): string | undefined {
  if (!t) return undefined
  const pl = tokenPayload(t)
  if (!pl) return 'Poke user'
  const s = (pl.email ?? pl.name ?? pl.preferred_username ?? pl.sub) as string | undefined
  return s ?? 'Poke user'
}

function preview(t: string | undefined): string | undefined {
  if (!t || t.length < 12) return t ? '•••' : undefined
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}

export function getAuthViewModel(): AuthViewModel {
  const hasSession = isLoggedIn()
  const token = getToken()
  if (!hasSession && !token) {
    return { state: 'unauthenticated', loginHint: 'Poke.com device login (opens browser when needed)' }
  }
  const state = sessionState(token)
  return {
    state,
    tokenPreview: preview(token),
    identityLabel: identityFromToken(token),
    loginHint: state === 'expired' ? 'Session expired — log in again' : undefined
  }
}

function broadcastAuth() {
  const v = getAuthViewModel()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.onAuth, v)
  }
}

export async function loginInteractive(opts?: { openBrowser?: boolean }): Promise<AuthViewModel> {
  await login({
    openBrowser: opts?.openBrowser !== false,
    onCode: ({ userCode, loginUrl }) => {
      const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      w?.webContents?.send('mcpoke:auth:code', { userCode, loginUrl } as { userCode: string; loginUrl: string })
      if (userCode) {
        // eslint-disable-next-line no-console
        console.info('[MCPoke] Poke user code (if browser does not open):', userCode)
      }
    }
  })
  const a = getAuthViewModel()
  broadcastAuth()
  return a
}

export async function logoutInteractive(): Promise<AuthViewModel> {
  await logout()
  const a = getAuthViewModel()
  broadcastAuth()
  return a
}

export function openPokeUrl(url: string): void {
  void shell.openExternal(url)
}
