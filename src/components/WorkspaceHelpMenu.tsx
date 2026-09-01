import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { useState } from "react";

import { version as appVersion } from "../../package.json";
import {
  PROJECTFLOW_OFFLINE_INSTALLER_URL,
} from "../domain/updates/release";

export function WorkspaceHelpMenu() {
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [checkedCurrent, setCheckedCurrent] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async (): Promise<void> => {
    setChecking(true);
    setAvailableUpdate(null);
    setCheckedCurrent(false);
    setProgress(null);
    setError(null);
    try {
      const update = await check({ timeout: 15_000 });
      setAvailableUpdate(update);
      setCheckedCurrent(update === null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível verificar atualizações. Confira sua conexão.",
      );
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async (): Promise<void> => {
    if (availableUpdate === null) return;
    setInstalling(true);
    setError(null);
    let downloaded = 0;
    let total: number | undefined;
    const onProgress = (event: DownloadEvent): void => {
      if (event.event === "Started") {
        total = event.data.contentLength;
        setProgress("Baixando atualização…");
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        setProgress(total === undefined || total === 0
          ? "Baixando atualização…"
          : `Baixando atualização… ${String(Math.min(100, Math.round((downloaded / total) * 100)))}%`);
      } else {
        setProgress("Download concluído. Preparando instalação…");
      }
    };
    try {
      await availableUpdate.downloadAndInstall(onProgress);
      setProgress("Atualização instalada. Reiniciando o ProjectFlow…");
      await relaunch();
    } catch (reason) {
      setError(reason instanceof Error
        ? `Não foi possível instalar a atualização: ${reason.message}`
        : "Não foi possível instalar a atualização.");
      setProgress(null);
      setInstalling(false);
    }
  };

  const openInstaller = async (url: string): Promise<void> => {
    try {
      await openUrl(url);
    } catch {
      setError("Não foi possível abrir o navegador padrão para baixar a atualização.");
    }
  };

  return (
    <details className="workspace-menu help-menu" name="workspace-menu">
      <summary>Ajuda</summary>
      <div className="workspace-menu-popover help-menu-popover">
        <strong>Orientações rápidas</strong>
        <p>A Tabela é a visualização principal para editar tarefas e dependências.</p>
        <p>Kanban e Gantt usam as mesmas tarefas e refletem as alterações salvas.</p>
        <p>Feriados municipais podem ser criados manualmente no menu Calendário.</p>
        <hr />
        <section className="update-check" aria-labelledby="update-check-title">
          <strong id="update-check-title">Atualizações</strong>
          <small>ProjectFlow {appVersion} · a consulta ocorre somente quando solicitada.</small>
          <button type="button" disabled={checking} onClick={() => { void checkForUpdates(); }}>
            {checking ? "Verificando…" : "Verificar atualizações"}
          </button>
          <div className="update-check-result" aria-live="polite">
            {availableUpdate === null ? null : (
              <>
                <p>Versão {availableUpdate.version} disponível.</p>
                <button type="button" disabled={installing} onClick={() => { void installUpdate(); }}>
                  {installing ? "Atualizando…" : "Baixar e instalar atualização"}
                </button>
                <button className="text-update-button" type="button" onClick={() => { void openInstaller(PROJECTFLOW_OFFLINE_INSTALLER_URL); }}>
                  Baixar instalador offline
                </button>
              </>
            )}
            {checkedCurrent ? <p>Você já está na versão mais recente ({appVersion}).</p> : null}
            {progress === null ? null : <p>{progress}</p>}
            {error === null ? null : <p className="update-check-error" role="alert">{error}</p>}
          </div>
        </section>
        <hr />
        <small>Operação local e offline; atualizações só são consultadas quando solicitadas.</small>
        <small>Licenças de terceiros: THIRD_PARTY_NOTICES.md</small>
      </div>
    </details>
  );
}
