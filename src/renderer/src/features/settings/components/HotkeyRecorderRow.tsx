import React, { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { ShortcutSlotStatus } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function formatKeyboardEventToAccelerator(e: React.KeyboardEvent): string | null {
  const modifierOnly = new Set(['Control', 'Shift', 'Alt', 'Meta'])
  if (modifierOnly.has(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  let mainKey = e.key
  if (mainKey === ' ') mainKey = 'Space'
  else if (mainKey.length === 1) mainKey = mainKey.toUpperCase()
  else if (/^Arrow/.test(mainKey)) mainKey = mainKey.replace(/^Arrow/, '')

  if (parts.length === 0 && !/^F([1-9]|1[0-2])$/i.test(mainKey)) {
    return null
  }
  parts.push(mainKey)
  return parts.join('+')
}

export interface HotkeyRecorderRowProps {
  label: string
  description: string
  value: string
  status?: ShortcutSlotStatus
  allowClear?: boolean
  onCommit: (nextAccel: string) => void
}

export const HotkeyRecorderRow: React.FC<HotkeyRecorderRowProps> = ({
  label,
  description,
  value,
  status,
  allowClear,
  onCommit
}) => {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    return () => {
      if (recording) {
        window.hexbuddy.setShortcutRecording(false).catch(() => {})
      }
    }
  }, [recording])

  const startRecording = async (): Promise<void> => {
    await window.hexbuddy.setShortcutRecording(true)
    setRecording(true)
  }

  const stopRecording = async (): Promise<void> => {
    setRecording(false)
    await window.hexbuddy.setShortcutRecording(false)
  }

  const handleKeyDown = async (e: React.KeyboardEvent): Promise<void> => {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      await stopRecording()
      return
    }
    const accel = formatKeyboardEventToAccelerator(e)
    if (!accel) return
    setRecording(false)
    await window.hexbuddy.setShortcutRecording(false)
    onCommit(accel)
  }

  const hasConflict = Boolean(value && status && !status.registered)

  return (
    <div className="rounded-lg border border-border bg-[#10192b] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
            <span>{label}</span>
            {!value ? (
              <Badge variant="outline">已停用</Badge>
            ) : hasConflict ? (
              <Badge variant="destructive">热键冲突</Badge>
            ) : (
              <Badge variant="emerald">✓ 已生效</Badge>
            )}
          </div>
          <p className="text-2xs text-muted-foreground mt-0.5">{description}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => (recording ? stopRecording() : startRecording())}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (recording) stopRecording()
            }}
            className={`h-8 min-w-36 px-3 rounded-md border text-xs font-mono font-semibold transition cursor-pointer ${
              recording
                ? 'bg-accent/20 border-accent text-[#5cf2e5] animate-pulse'
                : hasConflict
                  ? 'bg-destructive/15 border-destructive/60 text-rose-200'
                  : 'bg-[#0b1220] border-primary/40 text-[#f0e6d2] hover:border-primary'
            }`}
          >
            {recording ? '请按下组合键 (Esc取消)...' : value || '未绑定（点击录制）'}
          </button>

          {allowClear && value && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="清空并停用该热键"
              onClick={() => onCommit('')}
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      {hasConflict && status?.error && (
        <div className="text-2xs text-rose-300 flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 shrink-0 text-rose-400" />
          <span>{status.error}</span>
        </div>
      )}
    </div>
  )
}
