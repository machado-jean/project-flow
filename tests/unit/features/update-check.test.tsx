import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceHelpMenu } from "../../../src/components/WorkspaceHelpMenu";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("verificação de atualização no menu Ajuda", () => {
  it("baixa, instala passivamente e reinicia quando há nova versão", async () => {
    const downloadAndInstall = vi.fn().mockImplementation((onEvent: (event: unknown) => void) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
      onEvent({ event: "Finished" });
      return Promise.resolve();
    });
    vi.mocked(check).mockResolvedValue({ version: "0.2.0", downloadAndInstall } as never);
    vi.mocked(relaunch).mockResolvedValue(undefined);
    render(<WorkspaceHelpMenu />);

    fireEvent.click(screen.getByText("Ajuda"));
    fireEvent.click(screen.getByRole("button", { name: "Verificar atualizações" }));

    expect(await screen.findByText("Versão 0.2.0 disponível.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Baixar e instalar atualização" }));
    await waitFor(() => {
      expect(downloadAndInstall).toHaveBeenCalledOnce();
      expect(relaunch).toHaveBeenCalledOnce();
    });
  });

  it("confirma quando a versão instalada já é a mais recente", async () => {
    vi.mocked(check).mockResolvedValue(null);
    render(<WorkspaceHelpMenu />);

    fireEvent.click(screen.getByText("Ajuda"));
    fireEvent.click(screen.getByRole("button", { name: "Verificar atualizações" }));

    expect(await screen.findByText("Você já está na versão mais recente (0.1.3)."))
      .toBeVisible();
  });

  it("informa falha de consulta sem iniciar instalação", async () => {
    vi.mocked(check).mockRejectedValue(new Error("latest.json indisponível"));
    render(<WorkspaceHelpMenu />);

    fireEvent.click(screen.getByText("Ajuda"));
    fireEvent.click(screen.getByRole("button", { name: "Verificar atualizações" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("latest.json indisponível");
    expect(openUrl).not.toHaveBeenCalled();
  });
});
