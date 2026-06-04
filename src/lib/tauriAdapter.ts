/**
 * Checks if the application is running in a Tauri native shell.
 */
export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && (
    '__TAURI__' in window ||
    '__TAURI_INTERNALS__' in window ||
    '__TAURI_METADATA__' in window ||
    '__TAURI_IPC__' in window
  );
}

/**
 * Saves text content to a local file.
 * - In Tauri: Opens a native save file dialog and writes the file.
 * - In Browser: Triggers a file download.
 */
export async function saveTextFile(
  filename: string,
  content: string,
  extensionFilters: { name: string; extensions: string[] }[] = []
): Promise<boolean> {
  if (isTauriEnv()) {
    try {
      // Dynamically import Tauri plugins to prevent browser crashes
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const path = await save({
        defaultPath: filename,
        filters: extensionFilters
      });

      if (path) {
        await writeTextFile(path, content);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Tauri save failed, falling back to browser download:', err);
    }
  }

  // Web Browser Fallback
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Browser download failed:', err);
    return false;
  }
}

/**
 * Triggers a file selection.
 * Note: For standard input uploads, we use HTML file inputs directly in the UI.
 * This helper is for manual loader invocations.
 */
export async function selectTextFile(
  extensionFilters: { name: string; extensions: string[] }[] = []
): Promise<{ name: string; content: string } | null> {
  if (isTauriEnv()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const selected = await open({
        multiple: false,
        directory: false,
        filters: extensionFilters
      });

      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected);
        // Extract filename from path
        const name = selected.split(/[/\\]/).pop() || 'loaded_file';
        return { name, content };
      }
      return null;
    } catch (err) {
      console.error('Tauri file open failed, fall back to browser:', err);
    }
  }

  // Browser doesn't support programmatic file selection without user interaction event.
  // The component should use standard `<input type="file" />` instead.
  return null;
}
