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
