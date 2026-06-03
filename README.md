# SmartCAN 🚗⚡

SmartCAN is a modern, high-performance desktop CAN bus analyzer, simulation, and diagnostics suite. Built on **Tauri v2**, **React 19**, and **TypeScript**, it serves as an improved and visually stunning alternative to Kvaser CanKing. It features advanced protocol decoders for **J1939** and **CANopen**, interactive signal plotting, client-side DBC database parsing, and dynamic UI panels.

---

## ✨ Features

- **🔌 Kvaser Leaf Integration**: Automatically loads the native Kvaser Leaf `canlib` shared libraries at runtime on Windows and macOS. Includes an interactive web fallback simulation for developers.
- **🎨 Glassmorphic Dual Themes**: Sleek, eye-friendly design. Toggle between a soothing **Beige (Light) Mode** and a high-tech **Cyberpunk (Dark) Mode**.
- **🧱 Configurable Workspace**: Choose which widgets to show and where they show up. Toggle layout slots for **Live Viewer**, **Transmitter**, **DBC Manager**, **Signal Plotter**, and **Protocol Diagnostics** dynamically.
- **📋 Client-Side DBC Parsing**: Upload `.dbc` database files to decode raw CAN frame payloads into physical parameters, ranges, and units in real-time.
- **📈 Live Signal Plotter**: Plot multiple signals decoded from incoming CAN messages onto real-time scrolling canvas charts.
- **📡 Protocol Diagnostics**:
  - **J1939**: Full support for Parameter Group Numbers (PGN), Suspect Parameter Numbers (SPN), and Broadcast Announce Message (BAM) multi-packet fragmentation and reassembly.
  - **CANopen**: Real-time NMT state machine tracking, Node Guarding/Heartbeat, SDO/PDO mapping, and network management command transmission.
- **🔄 In-App Auto-Updater**: Seamless integration with GitHub Releases. Pushing new version tags automatically compiles, signs, packages, and drafts multi-platform releases, notifying users to update in-app.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Zustand (state management)
- **Desktop Runtime**: Tauri v2, Rust
- **Native Bindings**: `libloading` for dynamic runtime library calls to Kvaser `canlib`
- **Testing**: Vitest for unit testing, ESLint + TypeScript compiler for linting and type checks

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js**: Version 22 or higher
2. **Rust & Cargo**: Standard Rust toolchain for Tauri compilation
3. **Kvaser Drivers**: Ensure Kvaser Canlib SDK is installed if you want to connect to real Kvaser USB hardware.

### Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/Simbov/SmartCAN.git
cd SmartCAN
npm install
```

### Development

Run the frontend only (web simulation fallback mode):

```bash
npm run dev
```

Run the native desktop application in development mode:

```bash
npx tauri dev
```

### Code Validation & Testing

Run the full validation suite (linting, type checking, production build, and Vitest unit tests):

```bash
npm run validate
```

---

## 📦 Release & Update Pipeline

To draft a new release and build signed installers for macOS and Windows, follow these steps:

1. Update the version inside `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Document your changes under a new version heading in `CHANGELOG.md`.
3. Create and push a git tag matching the version:
   ```bash
   git tag v0.0.0
   git push origin v0.0.0
   ```
4. GitHub Actions will pick up the tag, build the native binaries, sign them using the repository's `TAURI_SIGNING_PRIVATE_KEY` secret, and publish a draft release.

---

## 📝 License

This project is private and owned by the developer. All rights reserved.
