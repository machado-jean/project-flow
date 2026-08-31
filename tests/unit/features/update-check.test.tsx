import { openUrl } from "@tauri-apps/plugin-opener";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceHelpMenu } from "../../../src/components/WorkspaceHelpMenu";
import { PROJECTFLOW_STANDARD_INSTALLER_URL } from "../../../src/domain/updates/release";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("verificação de atualização no menu Ajuda", () => {
  it("informa nova versão e abre o instalador permanente no navegador", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({
      tag_name: "v0.2.0",
      draft: false,
      prerelease: false,
      assets: [{ name: "ProjectFlow-Windows-x64-Setup.exe" }],
    }))));
    vi.mocked(openUrl).mockResolvedValue(undefined);
    render(<WorkspaceHelpMenu />);

    fireEvent.click(screen.getByText("Ajuda"));
    fireEvent.click(screen.getByRole("button", { name: "Verificar atualizações" }));

    expect(await screen.findByText("Versão 0.2.0 disponível.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Baixar atualização" }));
    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith(PROJECTFLOW_STANDARD_INSTALLER_URL);
    });
  });

  it("confirma quando a versão instalada já é a mais recente", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({
      tag_name: "v0.1.1",
      draft: false,
      prerelease: false,
      assets: [{ name: "ProjectFlow-Windows-x64-Setup.exe" }],
    }))));
    render(<WorkspaceHelpMenu />);

    fireEvent.click(screen.getByText("Ajuda"));
    fireEvent.click(screen.getByRole("button", { name: "Verificar atualizações" }));

    expect(await screen.findByText("Você já está na versão mais recente (0.1.1)."))
      .toBeVisible();
  });

  it("distingue uma compilação ainda mais nova que a release publicada", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({
      tag_name: "v0.1.0",
      draft: false,
      prerelease: false,
      assets: [{ name: "ProjectFlow-Windows-x64-Setup.exe" }],
    }))));
    render(<WorkspaceHelpMenu />);

    fireEvent.click(screen.getByText("Ajuda"));
    fireEvent.click(screen.getByRole("button", { name: "Verificar atualizações" }));

    expect(await screen.findByText(
      "Esta compilação (0.1.1) é mais recente que a release publicada (0.1.0).",
    )).toBeVisible();
  });
});
