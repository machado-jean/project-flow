import { describe, expect, it } from "vitest";

import {
  checkLatestRelease,
  isNewerVersion,
} from "../../../src/domain/updates/release";

const STANDARD_ASSET = { name: "ProjectFlow-Windows-x64-Setup.exe" };

function releaseResponse(tag: string, assets: readonly object[] = [STANDARD_ASSET]): Response {
  return Response.json({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets,
  });
}

describe("verificação manual de versões", () => {
  it("compara versões sem confundir os segmentos semânticos", () => {
    expect(isNewerVersion("0.1.1", "0.1.0")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.0.9", "0.1.0")).toBe(false);
  });

  it("aceita uma release estável com o instalador padrão", async () => {
    const result = await checkLatestRelease(
      "0.1.0",
      () => Promise.resolve(releaseResponse("v0.2.0")),
    );

    expect(result).toEqual({
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      updateAvailable: true,
    });
  });

  it("rejeita release sem o asset permanente esperado", async () => {
    await expect(
      checkLatestRelease("0.1.0", () => Promise.resolve(releaseResponse("v0.2.0", []))),
    ).rejects.toThrow("não contém o instalador padrão");
  });

  it("explica o limite de consultas do GitHub", async () => {
    await expect(
      checkLatestRelease(
        "0.1.0",
        () => Promise.resolve(new Response(null, { status: 403 })),
      ),
    ).rejects.toThrow("limite temporário");
  });
});
