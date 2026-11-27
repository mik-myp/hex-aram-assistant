import { registerDataAndGameplayIpc } from './registerDataAndGameIpc'
import { registerSystemAndPrefsIpc } from './registerSystemAndPrefsIpc'

export function registerIpcHandlers(): void {
  registerDataAndGameplayIpc()
  registerSystemAndPrefsIpc()
}
