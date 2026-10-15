import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

/** Native <dialog>: focus trap, Esc to close and inert background come from the browser. */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="modal-card">
        <header>
          <h2>{title}</h2>
          <button className="btn ghost" onClick={() => ref.current?.close()} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </dialog>
  )
}
