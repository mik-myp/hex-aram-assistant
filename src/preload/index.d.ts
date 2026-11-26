import type { HexBuddyApi } from './index'

declare global {
  interface Window {
    hexbuddy: HexBuddyApi
  }
}
