import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface ModalDialogProps {
  readonly children: ReactNode;
  readonly className: string;
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly role?: "dialog" | "alertdialog";
  readonly backdropClassName?: string;
  readonly closeDisabled?: boolean;
  readonly onClose: () => void;
}

export function ModalDialog({
  children,
  className,
  labelledBy,
  describedBy,
  role = "dialog",
  backdropClassName = "modal-backdrop",
  closeDisabled = false,
  onClose,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const initialFocus = dialog?.querySelector<HTMLElement>(
      `[data-dialog-initial-focus], [autofocus], ${FOCUSABLE_SELECTOR}`,
    );
    (initialFocus ?? dialog)?.focus();

    return () => {
      if (previouslyFocused?.isConnected === true) previouslyFocused.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape" && !closeDisabled) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={backdropClassName} role="presentation">
      <section
        ref={dialogRef}
        className={className}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </section>
    </div>
  );
}
