import { describe, expect, it } from 'vitest'
import { PermissionEngine } from './permissionEngine.js'

describe('PermissionEngine policy modes', () => {
  it('allows any command in full mode', () => {
    const engine = new PermissionEngine()
    engine.setMode('full')
    expect(engine.evaluatePolicy('run_command', { command: 'rm -rf /tmp/demo' })).toBeNull()
  })

  it('blocks dangerous or non-allowlisted commands in limited mode', () => {
    const engine = new PermissionEngine()
    engine.setMode('limited')
    expect(engine.evaluatePolicy('run_command', { command: 'ls -la' })).toBeNull()
    expect(engine.evaluatePolicy('run_command', { command: 'node -v' })).toMatch(/blocked/)
    expect(engine.evaluatePolicy('run_command', { command: 'ls && rm -rf /' })).toMatch(/dangerous/)
  })

  it('supports approval token lifecycle', () => {
    const engine = new PermissionEngine()
    engine.setMode('sandbox')
    const args = { command: 'git status' }
    const req = engine.requestApproval('s1', 'run_command', args)
    expect(engine.validateApproval('s1', 'run_command', args, req.token)).toBe(true)
    expect(engine.validateApproval('s1', 'run_command', args, req.token)).toBe(false)
  })
})
