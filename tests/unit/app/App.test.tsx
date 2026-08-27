import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "../../../src/app/App";

describe("App", () => {
  it("identifies the foundation-only scope", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "ProjectFlow" })).toBeVisible();
    expect(
      screen.getByText("Nenhuma funcionalidade de negócio foi implementada nesta etapa."),
    ).toBeVisible();
  });
});
