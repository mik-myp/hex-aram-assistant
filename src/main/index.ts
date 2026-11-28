import { app, globalShortcut, Menu } from 'electron'
import { ReadOnlyLcuWatcher } from './game/lcuWatcher'
import { ReadOnlyLiveWatcher } from './game/liveWatcher'
import {
  recomputeRealGameState,
  tickSpatialVisionAndCursor,
  triggerManualHudOcr
} from './game/visionLoop'
import { startLeagueWindowTracker, stopLeagueWindowTracker } from './game/windowTracker'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { logDiag } from './logger/diagLogger'
import { terminateOcrWorker } from './ocr/augmentOcr'
import {
  healMissingIconFingerprints,
  initIconFingerprintStore
} from './ocr/iconFingerprintStore'
import { registerGlobalShortcuts } from './shortcuts/shortcutManager'
import {
  isInActiveMatchOrChampSelect,
  loadSettingsAndPrefs,
  runtime,
  syncService,
  updateService
} from './state/runtimeStore'
import {
  clearHudIdleDestroyTimer,
  createMainWindow,
  createSystemTray,
  showMainWindow,
  toggleSpatialHud
} from './window/windowManager'

// Trim Chromium Spare Renderer (~60 MB) while keeping enough V8 headroom for seed bundle + OCR fallback
app.commandLine.appendSwitch(
  'disable-features',
  'SpareRendererForSitePerProcess,BackForwardCache,CalculateNativeWinOcclusion'
)
app.commandLine.appendSwitch('renderer-process-limit', '2')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=384')

// Prevent fatal crash dialogs on edge-case OS/driver/LCU transient errors
process.on('uncaughtException', (err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err)
  logDiag('FATAL-GUARD', `uncaughtException: ${msg.slice(0, 500)}`)
  console.error('[HexBuddy] Uncaught exception guarded:', err)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason)
  logDiag('FATAL-GUARD', `unhandledRejection: ${msg.slice(0, 500)}`)
  console.error('[HexBuddy] Unhandled rejection guarded:', reason)
})

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  runtime.isQuitting = true
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(async () => {
    if (process.platform !== 'darwin') {
      Menu.setApplicationMenu(null)
    }

    await loadSettingsAndPrefs()
    await syncService.init()
    await initIconFingerprintStore()
    registerIpcHandlers()
    createSystemTray(() => {
      triggerManualHudOcr()
    })

    const startedHidden = process.argv.includes('--hidden')
    logDiag('BOOT', `HexBuddy v${app.getVersion()} ready (hidden=${startedHidden})`)
    if (!startedHidden) {
      createMainWindow()
    }

    registerGlobalShortcuts({
      onToggleHud: () => {
        toggleSpatialHud()
      },
      onManualOcr: () => {
        triggerManualHudOcr()
      }
    })

    runtime.lcuWatcher = new ReadOnlyLcuWatcher((snap) => {
      runtime.latestLcu = snap
      recomputeRealGameState()
    })
    runtime.liveWatcher = new ReadOnlyLiveWatcher(
      () => syncService.getBundle().heroes,
      (snap) => {
        runtime.latestLive = snap
        recomputeRealGameState()
      }
    )

    startLeagueWindowTracker()
    runtime.lcuWatcher.start()
    runtime.liveWatcher.start()

    runtime.hudLoopTimer = setInterval(() => {
      tickSpatialVisionAndCursor().catch(() => {})
    }, 300)

    if (runtime.currentPrefs.autoSyncDataOnBoot !== false) {
      setTimeout(() => {
        if (!isInActiveMatchOrChampSelect()) {
          syncService
            .checkAndSync(false)
            .then(() => healMissingIconFingerprints(syncService.getBundle().augments))
            .catch(() => {})
        }
      }, 1500)
    }

    updateService.onStateChanged((st) => {
      for (const win of [runtime.mainWindow, runtime.hudWindow]) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('updater:state-updated', st)
        }
      }
    })

    setTimeout(() => {
      if (!isInActiveMatchOrChampSelect()) {
        updateService.checkForUpdates().catch(() => {})
      }
    }, 2500)

    app.on('activate', () => {
      showMainWindow()
    })
  })
}

app.on('before-quit', () => {
  runtime.isQuitting = true
})

app.on('window-all-closed', () => {
  if (runtime.isQuitting && process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
  clearHudIdleDestroyTimer()
  if (runtime.hudLoopTimer) clearInterval(runtime.hudLoopTimer)
  stopLeagueWindowTracker()
  runtime.lcuWatcher?.stop()
  runtime.liveWatcher?.stop()
  runtime.tray?.destroy()
  await terminateOcrWorker()
})
