import type { ElectronApi } from '../../shared/ipc.js'

export {}

declare global {
  interface Window {
    mcpoke: ElectronApi
  }
}
