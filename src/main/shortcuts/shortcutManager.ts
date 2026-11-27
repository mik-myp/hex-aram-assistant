import { globalShortcut } from 'electron'
import type { ShortcutSlotStatus, ShortcutStatusMap } from '@shared/types'
import { cyclePlaystyleMindset, runtime } from '../state/runtimeStore'

function registerSingleShortcutSlot(
  accel: string,
  usedSet: Set<string>,
  handler: () => void
): ShortcutSlotStatus {
  const clean = (accel || '').trim()
  if (!clean) {
    return { accelerator: '', registered: true }
  }
  const norm = clean.toLowerCase()
  if (usedSet.has(norm)) {
    return {
      accelerator: clean,
      registered: false,
      error: '与本软件内其他快捷键重复，请更换组合键'
    }
  }
  usedSet.add(norm)
  if (runtime.shortcutRecordingPaused) {
    return { accelerator: clean, registered: true }
  }
  try {
    const ok = globalShortcut.register(clean, handler)
    if (!ok) {
      return {
        accelerator: clean,
        registered: false,
        error: '注册失败：该热键已被微信/QQ/显卡驱动或其他软件占用'
      }
    }
    return { accelerator: clean, registered: true }
  } catch {
    return {
      accelerator: clean,
      registered: false,
      error: '快捷键格式不受系统支持，请点击录制按钮重新按下组合键'
    }
  }
}

export function registerGlobalShortcuts(handlers: {
  onToggleHud: () => void
  onManualOcr: () => void
}): ShortcutStatusMap {
  globalShortcut.unregisterAll()
  const used = new Set<string>()
  runtime.shortcutStatus = {
    overlay: registerSingleShortcutSlot(
      runtime.currentSettings.shortcutOverlay,
      used,
      handlers.onToggleHud
    ),
    ocr: registerSingleShortcutSlot(
      runtime.currentSettings.shortcutOcr,
      used,
      handlers.onManualOcr
    ),
    cycleMindset: registerSingleShortcutSlot(
      runtime.currentSettings.shortcutCycleMindset,
      used,
      cyclePlaystyleMindset
    )
  }
  return runtime.shortcutStatus
}

export function setShortcutRecordingPaused(
  paused: boolean,
  handlers: {
    onToggleHud: () => void
    onManualOcr: () => void
  }
): void {
  runtime.shortcutRecordingPaused = Boolean(paused)
  if (runtime.shortcutRecordingPaused) {
    globalShortcut.unregisterAll()
  } else {
    registerGlobalShortcuts(handlers)
  }
}
