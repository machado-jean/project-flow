import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ViewErrorBoundary } from "../../../src/features/views/ViewErrorBoundary";

function Failure(): never {
  throw new Error("falha controlada");
}

describe("ViewErrorBoundary", () => {
  it("preserva o restante da interface quando uma visualização falha", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <>
        <span>Navegação preservada</span>
        <ViewErrorBoundary viewName="o gráfico de teste">
          <Failure />
        </ViewErrorBoundary>
      </>,
    );

    expect(screen.getByText("Navegação preservada")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível exibir o gráfico de teste.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
