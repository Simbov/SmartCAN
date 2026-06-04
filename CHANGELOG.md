# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Physical Device Prioritization**: Read channel capabilities (`canCHANNELDATA_CHANNEL_CAP`) to explicitly skip virtual channels during physical scan phase. This prevents default virtual channels from preempting plugged-in physical devices (like Kvaser Leaf v3).

## [0.0.1] - 2026-06-04

### Added
- **Dynamic Device Name Display**: Queries and shows the name of the connected Kvaser channel (e.g., `Kvaser Leaf Light v2 (Ch 0)`) in the Interface header info.
- **Connection Error Dialog**: Detects failed connections, driver/DLL loading errors, and guides the user to retry or enter Simulation Mode.
- **J1939 Structured Builder**: Added input fields for Priority, PGN, SA, and DA in the transmitter that sync automatically with the raw ID.
- **DBC Full-Width Workspace**: Moved the DBC Inspector to its own dedicated tab with a split layout.
- **CSV Matrix Exporter**: Added "Export CAN Specification" CSV exporter to save DBC messages and signals as a specification grid.
- **SDO Index Scan**: Sequentially scans common SDO indices for active CANopen nodes.
- **Generic CANopen Messaging**: Enables sending arbitrary CANopen messages with custom COB-IDs.

### Fixed
- **Tauri v2 Environment Detection**: Upgraded window property checks to correctly identify Tauri desktop execution shell under v2 contexts, fixing simulated fallback behavior.
- **Kvaser Leaf V3 Channels**: Robust scan across physical and virtual channels to open the first available channel.
- **SDO Phantom Responses**: Resolved active request duplicates using timeouts and length tracking.
- **Log Import Delimiter**: Dynamic delimiter parsing supporting both comma and semicolon files.
- **Traffic Layout & Formatting**: Repaired live traffic filters overlapping and reduced decimal places for delta time.

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
