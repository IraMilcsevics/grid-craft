import { useCallback, useRef, useState } from 'react'
import type { Preset } from '../domain/presets'
import type { ViewState } from '../domain/view'
import type { SavedView } from '../domain/viewStore'
import { useDismiss } from '../hooks/useDismiss'

export interface ViewsMenuProps {
  presets: Preset[]
  saved: SavedView[]
  activeId: string | null
  /** The current table differs from the active view. */
  modified: boolean
  /** False when the browser refuses to store data, so saved views only last for this session. */
  canPersist: boolean
  onApply: (id: string, name: string, view: ViewState) => void
  onSave: (name: string) => void
  onUpdate: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  /** Stop being "in" the view. What is on screen stays as it is. */
  onLeave: () => void
  /** Leave the view and clear every filter, sort and column change. */
  onReset: () => void
  /** Go back to the saved state of the active view. */
  onDiscard: () => void
  onCopyLink: () => void
}

export function ViewsMenu({
  presets,
  saved,
  activeId,
  modified,
  canPersist,
  onApply,
  onSave,
  onUpdate,
  onDelete,
  onRename,
  onLeave,
  onReset,
  onDiscard,
  onCopyLink,
}: ViewsMenuProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, root)

  const active = [...presets, ...saved].find((v) => v.id === activeId)
  const activeSaved = saved.find((v) => v.id === activeId)
  const trimmed = name.trim()
  const replaces = saved.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())

  const submit = () => {
    if (!trimmed) return
    onSave(trimmed)
    setName('')
  }
  const commitRename = () => {
    if (renaming && renaming.text.trim() && renaming.text.trim() !== saved.find((v) => v.id === renaming.id)?.name) {
      onRename(renaming.id, renaming.text.trim())
    }
    setRenaming(null)
  }

  return (
    <div className="menu-root" ref={root}>
      <div className={`btn-group${active ? ' on' : ''}`}>
        <button className="btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 2.5h9v11L8 10.5l-4.5 3z" />
          </svg>
          {active ? (
            <>
              <span className="view-name">{active.name}</span>
              {modified && <span className="count neutral">modified</span>}
            </>
          ) : (
            'Views'
          )}
        </button>
        {active && (
          <button className="btn leave" aria-label={`Leave view “${active.name}”. Filters and columns stay as they are.`} title="Leave this view (keeps what is on screen)" onClick={onLeave}>
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="menu views" role="group" aria-label="Views">
          {active && modified && (
            <div className="menu-banner" role="group" aria-label="Unsaved changes">
              <p>
                “{active.name}” has unsaved changes.
              </p>
              <div className="banner-actions">
                {activeSaved ? (
                  <button className="btn primary" onClick={onUpdate}>
                    Update view
                  </button>
                ) : (
                  <small>Built-in views cannot be changed.</small>
                )}
                <button
                  className="btn"
                  onClick={() => {
                    setName(`${active.name} (copy)`.slice(0, 60))
                    requestAnimationFrame(() => {
                      nameInput.current?.focus()
                      nameInput.current?.select()
                    })
                  }}
                >
                  Save as new…
                </button>
                <button className="btn" onClick={onDiscard}>
                  Discard changes
                </button>
              </div>
            </div>
          )}

          <button
            className="menu-item"
            onClick={() => {
              onReset()
              close()
            }}
          >
            <span>Default view</span>
            <small>No filters or sorting, every column, original order</small>
          </button>

          <div className="menu-title">Built-in views</div>
          {presets.map((p) => (
            <button
              key={p.id}
              className={`menu-item${p.id === activeId ? ' current' : ''}`}
              onClick={() => {
                onApply(p.id, p.name, p.view)
                close()
              }}
            >
              <span>{p.name}</span>
              <small>{p.description}</small>
            </button>
          ))}

          <div className="menu-title">Your views</div>
          {saved.length === 0 && <p className="menu-empty">Nothing saved yet. Set up filters, sorting and columns, then name the view below.</p>}
          {saved.map((v) =>
            renaming?.id === v.id ? (
              <div className="menu-row" key={v.id}>
                <input
                  className="rename-input"
                  autoFocus
                  maxLength={60}
                  aria-label={`Rename ${v.name}`}
                  value={renaming.text}
                  onChange={(e) => setRenaming({ id: v.id, text: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    else if (e.key === 'Escape') {
                      e.stopPropagation()
                      setRenaming(null)
                    }
                  }}
                />
              </div>
            ) : (
              <div className="menu-row" key={v.id}>
                <button
                  className={`menu-item${v.id === activeId ? ' current' : ''}`}
                  onClick={() => {
                    onApply(v.id, v.name, v.view)
                    close()
                  }}
                >
                  <span>{v.name}</span>
                  {v.savedAt && <small>Saved {new Date(v.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>}
                </button>
                <button className="icon-btn" aria-label={`Rename ${v.name}`} title="Rename" onClick={() => setRenaming({ id: v.id, text: v.name })}>
                  ✎
                </button>
                <button className="icon-btn danger" aria-label={`Delete ${v.name}`} title="Delete" onClick={() => onDelete(v.id)}>
                  ✕
                </button>
              </div>
            ),
          )}

          <form
            className="save-row"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input ref={nameInput} value={name} maxLength={60} placeholder="Name this view" aria-label="View name" onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!trimmed}>
              {replaces ? 'Replace' : 'Save'}
            </button>
          </form>

          <div className="menu-foot">
            <span />
            <button className="linkbtn" onClick={onCopyLink}>
              Copy link to this view
            </button>
          </div>
          {!canPersist && <p className="menu-empty warn">This browser blocks storage, so saved views last until you close the tab.</p>}
        </div>
      )}
    </div>
  )
}
