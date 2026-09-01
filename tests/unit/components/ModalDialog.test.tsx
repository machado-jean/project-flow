import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ModalDialog } from "../../../src/components/ModalDialog";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); }}>Abrir diálogo</button>
      {open ? (
        <ModalDialog
          className="test-dialog"
          labelledBy="test-dialog-title"
          onClose={() => { setOpen(false); }}
        >
          <h2 id="test-dialog-title">Confirmar operação</h2>
          <button type="button" data-dialog-initial-focus>Cancelar</button>
          <button type="button">Confirmar</button>
        </ModalDialog>
      ) : null}
    </>
  );
}

describe("ModalDialog", () => {
  it("move o foco, o mantém no diálogo e o devolve ao elemento acionador", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Abrir diálogo" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    expect(cancel).toHaveFocus();

    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(confirm, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
