# MCPoke Design System

ElevenLabs-inspired visual language adapted for MCPoke desktop workflows.

## Design Intent

- Dark cinematic workspace with strong focus hierarchy.
- Media-console vibe: precise, compact, and instrument-like.
- Audio-inspired interaction cues: subtle pulses, glows, and active signal markers.
- Dense information surfaces that remain readable under prolonged use.

## Brand Personality

- Quiet confidence over loud neon.
- Technical, modern, and purpose-driven.
- Motion is restrained and meaningful, never decorative.

## Color System

Use semantic roles; avoid raw hex in components.

### Core Neutrals

- `--color-canvas`: app background (deepest layer)
- `--color-surface`: primary panel backgrounds
- `--color-elevated`: raised controls and active rows
- `--color-border`: default separators
- `--color-border-strong`: emphasized boundaries
- `--color-fg`: primary text
- `--color-muted`: secondary text and metadata

### Functional Accents

- `--color-accent`: primary action, links, active tabs, focus affordances
- `--color-ok`: healthy/running state
- `--color-warn`: caution/needs attention
- `--color-danger`: errors/failures

### Interactive Tokens

- `--color-hover`: subtle hover lift on surfaces
- `--color-active`: pressed/selected state tint
- `--color-focus`: keyboard focus ring
- `--color-accent-soft`: low-emphasis accent fill
- `--color-danger-soft`: low-emphasis error fill
- `--color-warn-soft`: low-emphasis warning fill
- `--color-ok-soft`: low-emphasis success fill

## Typography

- Sans: `Inter`/system stack for UI labels and body copy.
- Mono: `JetBrains Mono`/system monospace for IDs, ports, logs, and machine output.

### Scale

- 9-10px: micro labels, status chips, metadata.
- 11-12px: default control text and table content.
- 13-14px: section titles and important labels.
- 16px+: rare, only for focal callouts.

### Rules

- Keep line height tight but legible (`1.25` to `1.45`).
- Reserve heavy weights for key hierarchy points only.
- Use muted color first; promote with brighter color rather than larger size when possible.

## Spacing, Radius, and Depth

- Base spacing rhythm: 4px increments.
- Control height target: compact desktop scale (26-32px typical).
- Radius:
  - 6px for controls/chips/cards.
  - Pill radius for status/auth badges.
- Depth:
  - Border-first hierarchy.
  - Sparse, soft shadow only on elevated overlays and focused priority controls.

## Motion

- Duration range: 80-220ms.
- Easing: smooth and slightly springy for indicators/chips; linear-ish for fades.
- Preferred effects:
  - Fade-up on panel/content swaps.
  - Pulse only for live/running signals.
  - Subtle indicator-pop for active navigation.
- Avoid large transforms or long-running ambient animations.

## Component Guidance

### Buttons

- Tertiary (`.mcpoke-btn-ghost`): low emphasis, transparent background.
- Secondary (`.mcpoke-btn`): default action on dark surfaces.
- Primary (`.mcpoke-btn-pri`): accent-tinted with clear hover/focus.
- Danger (`.mcpoke-btn-danger`): reserved for destructive actions only.

### Tabs

- Active tab uses brighter text + accent indicator.
- Inactive tabs stay muted with gentle hover lift.
- Keep tab transitions quick and crisp.

### Chips and Badges

- Use compact mono/sans text.
- Always map status to semantic tokens.
- Prefer soft backgrounds with readable foreground contrast.

### Inputs

- Dark field with visible border.
- Accent focus ring must be keyboard-visible.
- Do not use placeholder-only labels where persistent labels are needed.

### Data Rows and Lists

- Row hover provides subtle lift, not strong color blocks.
- Selected row gets elevated background + left accent marker.
- Keep dense layouts readable through spacing consistency and muted metadata.

### Panels and Cards

- Surface backgrounds should visually separate regions without hard contrast jumps.
- Section headers should use micro-label + dividing rule pattern.

## Accessibility and Usability

- Preserve keyboard focus visibility across all interactive controls.
- Ensure warning/error states are communicated by text and icon/label, not color alone.
- Keep contrast high enough for prolonged dark-mode use.
- Use consistent cursor, hover, and disabled semantics for predictability.

## Do / Do Not

### Do

- Use design tokens and shared classes first.
- Keep inline styles for one-off dynamic values only.
- Favor restrained polish over flashy effects.
- Maintain consistency across all tabs and panels.

### Do Not

- Introduce arbitrary new colors in feature components.
- Mix multiple visual metaphors in the same view.
- Overuse glow, blur, or animation.
- Make high-density screens noisy with oversized text or spacing.
