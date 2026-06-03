# SmartCAN - Developer & Agent Guidelines

Welcome to the **SmartCAN** development workspace! This guide is designed to help developers and AI agents understand the codebase architecture, styling system, and dynamic interfaces, and to prevent common bugs, lints, or runtime crashes during future feature updates.

---

## 🏗️ Architecture Overview

The application is structured into four highly isolated layers:

```
┌─────────────────────────────────────────────────────────┐
│                    Vite + React 19 SPA                  │
│  (Header.tsx, DbcManager.tsx, CanTransmitter.tsx, etc.) │
└────────────┬──────────────────────────────┬─────────────┘
             │ Reads state                  │ Triggers Actions
             ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                   Zustand Global Store                  │
│                 (src/store/useStore.ts)                 │
└────────────┬──────────────────────────────┬─────────────┘
             │ Serializes data              │ Feeds events
             ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│               Pure-Function Protocol Engines            │
│  (src/lib/dbcParser.ts, canopen.ts, j1939.ts)           │
└────────────┬────────────────────────────────────────────┘
             │ Abstracts file IO / native bindings
             ▼
┌─────────────────────────────────────────────────────────┐
│             Tauri Adapter & Native Rust Backend         │
│  (src/lib/tauriAdapter.ts ──► src-tauri/src/kvaser.rs)  │
└─────────────────────────────────────────────────────────┘
```

1. **Vite + React 19 Frontend**: Renders the glassmorphic panels. Relies on theme variables for light/dark modes and distributes panels dynamically using layout grid slots.
2. **Zustand Store**: Single source of truth. Handles telemetry state, logs, ECU configurations, and periodic loop triggers.
3. **Pure-Function Engines**: Perform byte packing, bit segmenting, range checks, NMT state shifts, and BAM segmentation. **Contains no React hooks, store bindings, or UI dependencies.**
4. **Tauri Adapter & Backend**: Provides file dialog/filesystem operations. Dynamically loads Kvaser Leaf `canlib` shared libraries at runtime, falling back to simulation if missing.

---

## 🎨 Theme & Layout Customization

### 1. Panel Layout Grid
Panels are distributed across slots dynamically configured in the header layout menu:
* **`sidebar`**: Left vertical column (fixed 330px width).
* **`main-top`**: Top dashboard row (fills remaining width, splits columns evenly).
* **`main-bottom`**: Bottom dashboard row (fills remaining width, splits columns evenly).

**Rule for modifications**: In `App.tsx`, rows and columns auto-collapse if they contain no active panels. Always preserve this collapsing flexbox layout to ensure the workspace fills 100% width and height.

### 2. Beige (Light) & Cyberpunk (Dark) Themes
SmartCAN does not use hardcoded Tailwind dark classes (e.g. `dark:bg-slate-900`). Instead, colors are managed via CSS Custom Properties in [index.css](file:///Users/simonvollert/Documents/Hobbies/SmartCAN/src/index.css).

When building or updating panels, use the following design system tokens:
* `--bg-color`: App background surface.
* `--bg-card`: Main panel surface background.
* `--bg-card-sub`: Nested container/sub-card background.
* `--bg-input`: Text input and select dropdown background.
* `--border-color`: Primary panel borders.
* `--border-sub`: Internal list or separator borders.
* `--text-color`: Main high-contrast text.
* `--text-muted`: Explanatory label text.

---

## ⚠️ Common Pitfalls & Agent Rules

To avoid compile-time checks, lints, or runtime crashes, future agents **MUST** respect the following rules:

### 1. React 19 Hook Purity
React 19 enforces strict rendering purity. Do **NOT** call impure functions (such as `Date.now()`, `Math.random()`, or random side-effects) directly inside a component's render execution path.
* **Incorrect**:
  ```typescript
  const t = idx * 0.2 + (isSimulating ? Date.now() * 0.005 : 0);
  y = 20 + 15 * (Math.random() - 0.5);
  ```
* **Correct (Animation Time State & Deterministic Sequences)**:
  ```typescript
  const [animationTime, setAnimationTime] = useState(0);
  useEffect(() => {
    if (!isSimulating) return;
    let animId = requestAnimationFrame(function tick() {
      setAnimationTime(t => t + 0.05);
      animId = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(animId);
  }, [isSimulating]);

  // Inside render:
  const t = idx * 0.2 + (isSimulating ? animationTime : 0);
  const y = 20 + 15 * (Math.sin(idx * 73.13 + t) * 0.5); // Deterministic noise
  ```

### 2. Synchronous `setState` in Effects
React forbids triggering state changes synchronously inside an effect, as it causes cascading renders that severely degrade performance.
* **Incorrect**:
  ```typescript
  useEffect(() => {
    if (logReceived) {
      setFeedback("Success!");
    }
  }, [logs]);
  ```
* **Correct (Defer state updates)**:
  ```typescript
  useEffect(() => {
    if (logReceived) {
      setTimeout(() => {
        setFeedback("Success!");
      }, 0);
    }
  }, [logs]);
  ```

### 3. Memoizing derived data in dependency arrays
Arrays or objects created during render (such as filtering lists or fetching dictionary values) have new reference IDs on every render. Placing them in `useEffect` dependency arrays creates infinite loop renders.
* **Incorrect**:
  ```typescript
  const messages = activeDbc ? Object.values(activeDbc.messages) : [];
  useEffect(() => { ... }, [messages]);
  ```
* **Correct**:
  ```typescript
  const activeDbc = dbcs[activeDbcName];
  const messages = useMemo(() => {
    return activeDbc ? Object.values(activeDbc.messages) : [];
  }, [activeDbc]);
  useEffect(() => { ... }, [messages]);
  ```

### 4. Dynamic Import & Fallbacks for Tauri
Since this is a hybrid Tauri desktop + standard browser application, imports to native Tauri packages (e.g. `@tauri-apps/api/core`, `@tauri-apps/plugin-dialog`) will crash standard web browsers if loaded statically at the file level.
* **Always wrap Tauri plugin loads dynamically**:
  ```typescript
  if (isTauriEnv()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('some_backend_command');
  } else {
    // Graceful web fallback simulation
  }
  ```

### 5. Rust Symbol Lifetime Rules
When loading dynamic libraries via `libloading` in Rust:
* Dynamic symbols loaded with `.get()` borrow the lifetime of the underlying library instance.
* To prevent self-referential lifetimes (which prevent packaging the library inside a parent struct or returning it), dereference the symbol immediately upon loading (`*symbol`) to copy the function pointer and drop the borrow.
* Example:
  ```rust
  let can_bus_on: unsafe extern "C" fn(i32) -> i32 = *lib.get::<unsafe extern "C" fn(i32) -> i32>(b"canBusOn").ok()?;
  ```

---

## 🛠️ Verification & Pipeline Commands

Before concluding any change or task, agents **MUST** execute the following checks to guarantee that the codebase remains completely functional:

1. **Verify both frontend and backend compilation & testing**:
   ```bash
   npm run validate
   ```
   This runs:
   - `eslint .` (Linting checks)
   - `tsc -b && vite build` (Vite production compiling)
   - `vitest run` (Running automated unit tests)

2. **Verify Rust backend compiles cleanly**:
   ```bash
   cargo check --manifest-path src-tauri/Cargo.toml
   ```
