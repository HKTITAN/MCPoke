import { createServer } from 'node:net'

/** True if the local host can bind to this port (nothing is listening). */
export async function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer()
    s.unref()
    s.once('error', () => resolve(false))
    s.listen(port, host, () => {
      s.close(() => resolve(true))
    })
  })
}

export async function findFreePort(host = '127.0.0.1', min = 10000, max = 50000, tries = 200): Promise<number> {
  for (let i = 0; i < tries; i += 1) {
    const port = min + Math.floor(Math.random() * (max - min))
    if (await isPortFree(port, host)) return port
  }
  throw new Error('Could not find a free port')
}

export function assertPortInRange(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error('Port must be an integer 1-65535')
  }
}
