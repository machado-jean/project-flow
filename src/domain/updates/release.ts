export const PROJECTFLOW_RELEASE_API_URL =
  "https://api.github.com/repos/machado-jean/project-flow/releases/latest";
export const PROJECTFLOW_STANDARD_INSTALLER_URL =
  "https://github.com/machado-jean/project-flow/releases/latest/download/ProjectFlow-Windows-x64-Setup.exe";
export const PROJECTFLOW_OFFLINE_INSTALLER_URL =
  "https://github.com/machado-jean/project-flow/releases/latest/download/ProjectFlow-Windows-x64-Offline-Setup.exe";

const STANDARD_INSTALLER_NAME = "ProjectFlow-Windows-x64-Setup.exe";

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface ReleaseAvailability {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly updateAvailable: boolean;
}

interface GithubReleaseAsset {
  readonly name?: unknown;
}

interface GithubReleaseResponse {
  readonly tag_name?: unknown;
  readonly draft?: unknown;
  readonly prerelease?: unknown;
  readonly assets?: unknown;
}

function parseSemanticVersion(value: string): SemanticVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (match === null) return null;
  const [, major, minor, patch] = match;
  if (major === undefined || minor === undefined || patch === undefined) return null;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateVersion = parseSemanticVersion(candidate);
  const currentVersion = parseSemanticVersion(current);
  if (candidateVersion === null || currentVersion === null) {
    throw new Error("A versão publicada pelo ProjectFlow não está no formato esperado.");
  }

  const parts: readonly (keyof SemanticVersion)[] = ["major", "minor", "patch"];
  for (const part of parts) {
    if (candidateVersion[part] > currentVersion[part]) return true;
    if (candidateVersion[part] < currentVersion[part]) return false;
  }
  return false;
}

function validateRelease(payload: unknown): string {
  if (payload === null || typeof payload !== "object") {
    throw new Error("O GitHub retornou uma resposta de atualização inválida.");
  }
  const release = payload as GithubReleaseResponse;
  if (release.draft !== false || release.prerelease !== false) {
    throw new Error("A release mais recente ainda não está publicada como versão estável.");
  }
  if (typeof release.tag_name !== "string") {
    throw new Error("A release mais recente não informa uma versão válida.");
  }
  if (!Array.isArray(release.assets)) {
    throw new Error("A release mais recente não possui uma lista de instaladores válida.");
  }
  const hasStandardInstaller = release.assets.some(
    (asset: GithubReleaseAsset) => asset.name === STANDARD_INSTALLER_NAME,
  );
  if (!hasStandardInstaller) {
    throw new Error("A release mais recente não contém o instalador padrão do ProjectFlow.");
  }
  return release.tag_name;
}

export async function checkLatestRelease(
  currentVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<ReleaseAvailability> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    controller.abort();
  }, 10_000);
  let response: Response;
  try {
    response = await fetcher(PROJECTFLOW_RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      "Não foi possível consultar a versão mais recente. Confira sua conexão e tente novamente.",
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "O limite temporário de consultas do GitHub foi atingido. Tente novamente mais tarde."
        : "Não foi possível consultar a versão mais recente no GitHub.",
    );
  }

  const latestTag = validateRelease(await response.json());
  const latestVersion = latestTag.replace(/^v/, "");
  return {
    currentVersion,
    latestVersion,
    updateAvailable: isNewerVersion(latestVersion, currentVersion),
  };
}
