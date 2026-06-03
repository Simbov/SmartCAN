import { isTauriEnv } from './tauriAdapter';

export const MAX_NOTE_LINES = 8;
export const MAX_NOTE_CHARS = 480;

export function buildUpdatePrompt(version: string, currentVersion: string, body?: string) {
  const header = `SmartCAN ${version} is available (you have ${currentVersion}).`;

  let notes = (body || '').trim();
  let truncated = false;
  if (notes) {
    const lines = notes.split('\n');
    if (lines.length > MAX_NOTE_LINES) {
      notes = lines.slice(0, MAX_NOTE_LINES).join('\n');
      truncated = true;
    }
    if (notes.length > MAX_NOTE_CHARS) {
      notes = notes.slice(0, MAX_NOTE_CHARS).trimEnd();
      truncated = true;
    }
    if (truncated) notes += '\n…  (see the full changelog on the releases page)';
  }

  const notesBlock = notes ? `\n\n${notes}` : '';
  return `${header}${notesBlock}\n\nDownload and install now?`;
}

export async function checkForUpdates({ silent = true } = {}) {
  if (!isTauriEnv()) return;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update) {
      if (!silent) {
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message("You're running the latest version.", {
          title: 'SmartCAN',
          kind: 'info',
        });
      }
      return;
    }

    const { ask } = await import('@tauri-apps/plugin-dialog');
    const ok = await ask(
      buildUpdatePrompt(update.version, update.currentVersion, update.body),
      {
        title: 'Update available',
        kind: 'info',
        okLabel: 'Update',
        cancelLabel: 'Later',
      }
    );
    if (!ok) return;

    await update.downloadAndInstall();

    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    console.error('Update check failed:', err);
    if (!silent) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Could not check for updates.\n\n${err}`, {
        title: 'Update',
        kind: 'error',
      });
    }
  }
}
