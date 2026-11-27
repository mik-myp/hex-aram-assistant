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

// Trim Chromium Spare Renderer (~60 MB) & lazy V8 heap expansion before app initialization
app.commandLine.appendSwitch(
  'disable-features',
  'SpareRendererForSitePerProcess,BackForwardCache,CalculateNativeWinOcclusion'
)
app.commandLine.appendSwitch('renderer-process-limit', '2')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=192')

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
          syncService.checkAndSync(false).catch(() => {})
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
