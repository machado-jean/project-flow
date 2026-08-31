import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import { version as appVersion } from "../../package.json";
import {
  checkLatestRelease,
  PROJECTFLOW_OFFLINE_INSTALLER_URL,
  PROJECTFLOW_STANDARD_INSTALLER_URL,
  type ReleaseAvailability,
} from "../domain/updates/release";

export function WorkspaceHelpMenu() {
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<ReleaseAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async (): Promise<void> => {
    setChecking(true);
    setAvailability(null);
    setError(null);
    try {
      setAvailability(await checkLatestRelease(appVersion));
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
            {availability === null ? null : availability.updateAvailable ? (
              <>
                <p>Versão {availability.latestVersion} disponível.</p>
                <button type="button" onClick={() => { void openInstaller(PROJECTFLOW_STANDARD_INSTALLER_URL); }}>
                  Baixar atualização
                </button>
                <button className="text-update-button" type="button" onClick={() => { void openInstaller(PROJECTFLOW_OFFLINE_INSTALLER_URL); }}>
                  Baixar instalador offline
                </button>
              </>
            ) : availability.currentVersion === availability.latestVersion ? (
              <p>Você já está na versão mais recente ({availability.currentVersion}).</p>
            ) : (
              <p>
                Esta compilação ({availability.currentVersion}) é mais recente que a release
                publicada ({availability.latestVersion}).
              </p>
            )}
            {error === null ? null : <p className="update-check-error" role="alert">{error}</p>}
          </div>
        </section>
        <hr />
        <small>Operação local e offline; a atualização é baixada pelo navegador.</small>
        <small>Licenças de terceiros: THIRD_PARTY_NOTICES.md</small>
      </div>
    </details>
  );
}
