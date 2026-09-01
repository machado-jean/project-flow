import type { KeyboardEvent, ReactNode } from "react";

interface WorkspaceMenuBarProps {
  readonly children: ReactNode;
}

export function WorkspaceMenuBar({ children }: WorkspaceMenuBarProps) {
  const closeOpenMenu = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape") return;
    const openMenu = event.currentTarget.querySelector<HTMLDetailsElement>("details[open]");
    if (openMenu === null) return;

    event.preventDefault();
    openMenu.open = false;
    const summary = Array.from(openMenu.children).find(
      (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "SUMMARY",
    );
    summary?.focus();
  };

  return (
    <nav className="workspace-menu-bar" aria-label="Menu principal" onKeyDown={closeOpenMenu}>
      {children}
    </nav>
  );
}
