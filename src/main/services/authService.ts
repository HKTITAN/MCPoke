import { getToken, isLoggedIn, login, logout } from 'poke'
import { BrowserWindow, shell } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { IPC } from '../../../shared/ipc.js'
import type { AuthErrorCode, AuthViewModel, AuthSessionState } from '../../../shared/mcp-types.js'

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

function firstString(payload: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!payload) return undefined
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function sessionState(token: string | undefined): AuthSessionState {
  if (!token) return 'unauthenticated'
  const pl = tokenPayload(token)
  const exp = pl?.exp
  if (typeof exp === 'number' && exp * 1000 < Date.now()) return 'expired'
  return 'authenticated'
}

function preview(t: string | undefined): string | undefined {
  if (!t || t.length < 12) return t ? '•••' : undefined
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}

function resolveCredentialsPathHint(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    return appData ? join(appData, 'poke', 'credentials.json') : join(homedir(), '.config', 'poke', 'credentials.json')
  }
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, 'poke', 'credentials.json')
  return join(homedir(), '.config', 'poke', 'credentials.json')
}

function normalizeAuthErrorMessage(message: string): { code: AuthErrorCode; retryable: boolean } {
  const lower = message.toLowerCase()
  if (lower.includes('cancel') || lower.includes('aborted')) return { code: 'cancelled', retryable: true }
  if (lower.includes('timeout')) return { code: 'timeout', retryable: true }
  if (
    lower.includes('network') ||
    lower.includes('econn') ||
    lower.includes('enotfound') ||
    lower.includes('socket') ||
    lower.includes('503') ||
    lower.includes('500')
  ) {
    return { code: 'network_error', retryable: true }
  }
  if (lower.includes('unauthorized') || lower.includes('invalid') || lower.includes('forbidden')) {
    return { code: 'invalid_credentials', retryable: false }
  }
  return { code: 'unknown', retryable: true }
}

let transientAuthState: AuthViewModel | null = null

export function getAuthViewModel(): AuthViewModel {
  if (transientAuthState) {
    return transientAuthState
  }

  const credentialsPathHint = resolveCredentialsPathHint()
  const hasSession = isLoggedIn()
  const token = getToken()
  if (!hasSession && !token) {
    return {
      state: 'unauthenticated',
      loginHint: 'Sign in with your Poke account to tunnel MCP servers.',
      credentialsPathHint
    }
  }
  const state = sessionState(token)
  const pl = token ? tokenPayload(token) : null

  const email = firstString(pl, ['email', 'preferred_username', 'upn'])
  const givenName = firstString(pl, ['given_name', 'first_name', 'givenName'])
  const familyName = firstString(pl, ['family_name', 'last_name', 'familyName'])
  const fullName = [givenName, familyName].filter(Boolean).join(' ').trim() || undefined
  const name = firstString(pl, ['name', 'display_name', 'full_name', 'nickname']) ?? fullName
  const sub = firstString(pl, ['sub', 'user_id', 'uid'])
  const exp = pl ? (pl.exp as number | undefined) : undefined

  const identityLabel = name ?? email ?? (sub ? sub.slice(0, 10) : 'Poke user')

  return {
    state,
    tokenPreview: preview(token),
    identityLabel,
    name,
    email,
    sub,
    expiresAt: exp ? exp * 1000 : undefined,
    loginHint: state === 'expired' ? 'Session expired — log in again' : undefined,
    credentialsPathHint
  }
}

function broadcastAuth(v: AuthViewModel) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.onAuth, v)
  }
}

function broadcastAuthError(error: { code: AuthErrorCode; message: string; retryable: boolean }) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.onAuthError, error)
  }
}

export async function loginInteractive(opts?: { openBrowser?: boolean }): Promise<AuthViewModel> {
  transientAuthState = {
    state: 'pending_device_code',
    loginHint: 'Waiting for device authorization code…',
    credentialsPathHint: resolveCredentialsPathHint()
  }
  broadcastAuth(transientAuthState)

  try {
    await login({
      openBrowser: opts?.openBrowser !== false,
      onCode: ({ userCode, loginUrl }: { userCode: string; loginUrl: string }) => {
        transientAuthState = {
          state: 'pending_device_code',
          loginCode: { userCode, loginUrl },
          loginHint: 'Enter this device code at poke.com/device to continue.',
          credentialsPathHint: resolveCredentialsPathHint()
        }
        broadcastAuth(transientAuthState)
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send(IPC.onLoginCode, { userCode, loginUrl })
        }
        if (userCode) {
          // eslint-disable-next-line no-console
          console.info('[MCPoke] Poke login code:', userCode, '—', loginUrl)
        }
      }
    })

    transientAuthState = null
    const a = getAuthViewModel()
    broadcastAuth(a)
    return a
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const normalized = normalizeAuthErrorMessage(message)
    transientAuthState = {
      state: 'error',
      loginHint: 'Login failed. Check your connection and try again.',
      error: { ...normalized, message },
      credentialsPathHint: resolveCredentialsPathHint()
    }
    broadcastAuth(transientAuthState)
    broadcastAuthError({ ...normalized, message })
    return transientAuthState
  }
}

export async function logoutInteractive(): Promise<AuthViewModel> {
  try {
    await logout()
    transientAuthState = null
    const a = getAuthViewModel()
    broadcastAuth(a)
    return a
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const normalized = normalizeAuthErrorMessage(message)
    transientAuthState = {
      state: 'error',
      loginHint: 'Logout failed. Try again.',
      error: { ...normalized, message },
      credentialsPathHint: resolveCredentialsPathHint()
    }
    broadcastAuth(transientAuthState)
    broadcastAuthError({ ...normalized, message })
    return transientAuthState
  }
}

export function openPokeUrl(url: string): void {
  void shell.openExternal(url)
}
