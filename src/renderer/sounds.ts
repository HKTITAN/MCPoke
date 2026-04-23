let _ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') void _ctx.resume()
  return _ctx
}

function tone(freq: number, ms: number, gain = 0.05, type: OscillatorType = 'sine') {
  try {
    const c = ac()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(c.destination)
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(gain, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + ms / 1000 + 0.01)
  } catch { /* AudioContext blocked */ }
}

export const sounds = {
  click:   () => tone(900, 30, 0.04),
  tab:     () => tone(720, 25, 0.03),
  success: () => { tone(600, 70, 0.055); setTimeout(() => tone(900, 110, 0.055), 70) },
  start:   () => { tone(480, 55, 0.05); setTimeout(() => tone(720, 70, 0.05), 55); setTimeout(() => tone(960, 100, 0.05), 125) },
  stop:    () => { tone(600, 55, 0.05); setTimeout(() => tone(400, 90, 0.04), 55) },
  error:   () => tone(200, 160, 0.07, 'triangle'),
  select:  () => tone(800, 20, 0.03),
}

export function initSounds() {
  document.addEventListener('mousedown', (e) => {
    const el = e.target as HTMLElement
    if (el.matches('button') || el.closest('button')) sounds.click()
  }, { passive: true })
}
