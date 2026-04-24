# MCPoke Development Setup

This repository contains the MCPoke Electron desktop app.

## Prerequisites

- Node.js 20+
- npm 10+

## Install

Run from the repository root:

`npm ci`

## Verify toolchain

`npm run typecheck`

`npm test`

## Run the app in development

Standard launch:

`npm run dev`

In Linux cloud/headless environments with GPU limitations, use:

`LIBGL_ALWAYS_SOFTWARE=1 ELECTRON_ENABLE_LOGGING=1 npm run dev -- --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage`

The renderer dev server will be available at `http://localhost:5173/`, and Electron should open the `MCPoke` window.

## Native Host Runtime (poke-pc + poke-gate parity)

MCPoke now ships with a built-in preset:

- `MCPoke Native Host (poke-gate + poke-pc)`

It provides native host tools and persistent terminal sessions:

- `run_command`, `read_file`, `write_file`, `list_directory`, `system_info`, `read_image`, `take_screenshot`
- `terminal_create_session`, `terminal_list_sessions`, `terminal_run_command`, `terminal_get_command_status`, `terminal_capture_output`, `terminal_kill_session`, `terminal_list_commands`

Permission modes are configurable in Settings:

- `full`: unrestricted host actions
- `limited`: read-only + safe command allowlist
- `sandbox`: broader command allowlist, still blocks file writes/screenshot

## Packaging

Build platform installers:

- `npm run dist:win`
- `npm run dist:mac`
- `npm run dist:linux`

Or build all available targets on current host:

- `npm run dist`

## Cross-platform verification matrix

Before release, verify:

- Windows: start native preset, run command tool, create terminal session, tunnel start/stop
- macOS: all above + screenshot capture permission and capture flow
- Linux: start native preset, command/file tools, terminal sessions, tunnel start/stop, screenshot fallback behavior
