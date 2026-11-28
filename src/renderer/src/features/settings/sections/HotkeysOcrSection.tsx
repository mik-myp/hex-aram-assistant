import React from 'react'
import type {
  AiSettings,
  OcrEngineMode,
  ShortcutStatusMap,
  UserPreferences
} from '@shared/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { HotkeyRecorderRow } from '../components/HotkeyRecorderRow'

const OCR_ENGINE_ITEMS: Array<{ value: OcrEngineMode; label: string }> = [
  { value: 'auto', label: '智能优先 Windows 原生 OCR（0MB 常驻内存 · 推荐）' },
  { value: 'tesseract', label: '强制使用内置离线 Tesseract 引擎（适合精简版系统）' }
]

interface HotkeysOcrSectionProps {
  settings: AiSettings
  prefs: UserPreferences
  shortcutStatus: ShortcutStatusMap | null
  onPatchSettings: (patch: Partial<AiSettings>) => Promise<void>
  onPatchPref: (patch: Partial<UserPreferences>) => Promise<void>
}

export const HotkeysOcrSection: React.FC<HotkeysOcrSectionProps> = ({
  settings,
  prefs,
  shortcutStatus,
  onPatchSettings,
  onPatchPref
}) => {
  return (
    <>
      <div>
        <h1 className="text-base font-bold text-foreground">识屏引擎与全局热键录制</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          直接点击右侧键位框并按下键盘组合键即可完成绑定，系统会自动检测是否与微信/QQ/显卡驱动冲突。
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>全局快捷键绑定（支持按键直录与冲突检测）</CardTitle>
            <CardDescription>
              录制时请按下包含 Ctrl / Alt / Shift 的组合键或 F1~F12 功能键，按 Esc 取消录制。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          <HotkeyRecorderRow
            label="显示 / 隐藏原位 HUD"
            description="对局中随时一键开关覆盖层（默认 Alt+H）"
            value={settings.shortcutOverlay}
            status={shortcutStatus?.overlay}
            onCommit={(accel) => onPatchSettings({ shortcutOverlay: accel })}
          />

          <HotkeyRecorderRow
            label="手动重识海克斯卡片"
            description="若自动识屏因特效遮挡漏扫，按一下立即重新识屏（默认 Alt+S）"
            value={settings.shortcutOcr}
            status={shortcutStatus?.ocr}
            onCommit={(accel) => onPatchSettings({ shortcutOcr: accel })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>自动识屏与 OCR 引擎策略</CardTitle>
            <CardDescription>
              选完卡片 15 秒后自动销毁离线识屏 Worker，确保团战期间零额外内存占用。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-foreground">
                3 / 7 / 11 / 15 级选卡窗口自动识屏 + 骰子刷新实时重扫
              </div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                包含阵亡读秒及复活回泉水 14 秒宽限期，选卡关闭时按鼠标所在列自动补录已拿海克斯
              </p>
            </div>
            <Switch
              checked={prefs.autoOcrOnMilestone}
              onCheckedChange={(checked) => onPatchPref({ autoOcrOnMilestone: checked })}
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">OCR 识别引擎优先级</span>
            <Select
              items={OCR_ENGINE_ITEMS}
              value={prefs.ocrEngineMode}
              onValueChange={(val) => {
                if (val) onPatchPref({ ocrEngineMode: val as OcrEngineMode })
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {OCR_ENGINE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
