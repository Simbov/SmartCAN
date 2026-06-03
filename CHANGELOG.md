# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.0] - 2026-06-03

### Added
- **Core App Shell**: Created a high-performance desktop shell built on Tauri v2 and React 19.
- **Kvaser Leaf Integration**: Added native support for Kvaser Leaf CAN-to-USB interfaces (dynamically loaded via `canlib` shared libraries on desktop, with an interactive web fallback simulation).
- **Silent Connections**: Fallback web/virtual simulation connections are now silent on load and do not generate random mock telemetry until explicitly toggled.
- **Dynamic Configurable Layout**: Added an interactive panel configuration widget in the header, allowing users to toggle dashboard widgets (`Live Viewer`, `Live Plotter`, `Transmitter`, `Protocol Diagnostics`, `DBC Manager`) and rearrange them across grid slots.
- **Dual Aesthetic Themes**: Implemented a modern glassmorphic UI design system with an eye-friendly **Beige (Light) Mode** and a high-tech **Cyberpunk (Dark) Mode**.
- **DBC File Management**: Integrated a client-side DBC database parser to map CAN frames and decode multiplexed signals into real-world physical values.
- **Live Signal Plotter**: Track decoded DBC signals dynamically in real-time with auto-scrolling charts.
- **Protocol Diagnostics**: Out-of-the-box decoders and state machines for **J1939** (BAM fragmentation/reassembly, PGN/SPN decoding) and **CANopen** (NMT network management, SDO/PDO, Heartbeat).
- **Auto-Updater**: Enabled background in-app updates triggered automatically when a new signed release is drafted on GitHub.
- **Validation Pipeline**: Set up a developer check suite executing ESLint, TypeScript compiler type checks, Vite build validation, and Vitest unit testing.
