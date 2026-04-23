import { describe, it, expect } from 'vitest'
import { assertPortInRange, isPortFree, findFreePort } from './portUtils'

describe('portUtils', () => {
  it('assertPortInRange throws on bad input', () => {
    expect(() => assertPortInRange(0)).toThrow()
    expect(() => assertPortInRange(70000)).toThrow()
  })
  it('isPortFree and findFreePort return usable ports', async () => {
    const p = await findFreePort('127.0.0.1', 20000, 20100, 20)
    expect(p).toBeGreaterThanOrEqual(20000)
    expect(p).toBeLessThan(20100)
    expect(await isPortFree(p)).toBe(true)
  })
})
