// Text editor sheet — used for both scalar String attrs (single-line) and free-text (multi-line).
// Shows current value pre-filled; save writes new value; empty save unsets the attr.

import { useState, useRef, useEffect } from 'react'

interface Props {
  sourceLabel: string           // e.g. "organization · TestOrg"
  attrName: string
  attrType: string              // 'String' / 'Long' / 'free-text' / ...
  multiline: boolean            // true → textarea; false → single-line input
  currentValue: string          // "" if not set yet
  onSave: (newValue: string) => void  // empty string = unset
  onClose: () => void
}

export function TextEditSheet({
  sourceLabel, attrName, attrType, multiline, currentValue, onSave, onClose,
}: Props) {
  const [value, setValue] = useState(currentValue)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.focus()
      if ('setSelectionRange' in el) el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [])

  const save = () => { onSave(value) }
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Single-line: Enter saves. Multi-line: Enter adds newline; Cmd/Ctrl-Enter saves.
    if (e.key === 'Enter') {
      if (!multiline || e.metaKey || e.ctrlKey) {
        e.preventDefault()
        save()
      }
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet text-edit-sheet">
        <div className="sheet-header">
          <button className="sheet-back" onClick={onClose}>取消</button>
          <span className="sheet-title">{sourceLabel} — {attrName} : {attrType}</span>
          <button className="sheet-close primary-text" onClick={save}>保存</button>
        </div>
        <div className="text-edit-body">
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              className="text-edit-textarea"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="(empty = clear this attr)"
              rows={10}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              className="text-edit-input"
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="(empty = clear this attr)"
            />
          )}
          <div className="text-edit-hint">
            {value === ''
              ? 'ⓘ 空文本会清空该属性'
              : multiline
                ? `${value.length} chars, ${value.split('\n').length} lines · ⌘/Ctrl+Enter to save`
                : `${value.length} chars · Enter to save`}
          </div>
        </div>
      </div>
    </>
  )
}
