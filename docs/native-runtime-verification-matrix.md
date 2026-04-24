# Native Runtime Verification Matrix

## Scope

Cross-platform validation for MCPoke native parity layer (`poke-gate` + `poke-pc` feature set).

## Tooling parity checklist

- Host tools: `run_command`, `read_file`, `write_file`, `list_directory`, `system_info`, `read_image`, `take_screenshot`
- Terminal tools: `terminal_create_session`, `terminal_list_sessions`, `terminal_run_command`, `terminal_get_command_status`, `terminal_capture_output`, `terminal_kill_session`, `terminal_list_commands`, `terminal_kill_command`
- Permission modes: `full`, `limited`, `sandbox`

## Verification status

| Platform | Typecheck/tests | Native runtime build | Packaging | Notes |
|---|---|---|---|---|
| Windows | Pass | Pass | `dist:win` executed (produced `release/win-unpacked`) | Screenshot implemented via PowerShell graphics APIs |
| macOS | CI planned | Supported by code path | CI workflow target | Screenshot implemented via `screencapture` |
| Linux | CI planned | Supported by code path | CI workflow target | Screenshot fallback chain: `gnome-screenshot` -> `grim` -> `import` |

## Required manual smoke tests (per platform)

1. Start preset `MCPoke Native Host (poke-gate + poke-pc)`.
2. Verify `tools/list` exposes full host + terminal tools.
3. Execute `run_command` in all three permission modes and confirm policy enforcement.
4. Create terminal session, run command, poll status, capture output, terminate command/session.
5. Validate credential path guards for file operations.
6. Validate screenshot behavior and permission prompts.
7. Start tunnel and confirm sync events/logs.
