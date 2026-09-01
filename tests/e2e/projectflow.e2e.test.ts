import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");
const E2E_ROOT = resolve(PROJECT_ROOT, ".local", "e2e");
const DATA_DIR = resolve(E2E_ROOT, "data");
const WEBVIEW_DIR = resolve(E2E_ROOT, "webview");
const ARTIFACTS_DIR = resolve(E2E_ROOT, "artifacts");
const PACKAGE_PATH = resolve(ARTIFACTS_DIR, "workspace.projectflow");
const EXECUTABLE = resolve(PROJECT_ROOT, "src-tauri", "target", "debug", "project-flow.exe");
const CDP_PORT = 9_222;
const CDP_URL = `http://127.0.0.1:${String(CDP_PORT)}`;
type SearchContext = Page | Locator;

interface RunningApp {
  readonly browser: Browser;
  readonly child: ChildProcess;
  readonly page: Page;
}

function assertInsideE2eRoot(path: string): void {
  const pathFromRoot = relative(E2E_ROOT, resolve(path));
  if (pathFromRoot.startsWith("..") || pathFromRoot.length === 0) {
    throw new Error(`Caminho E2E inseguro: ${path}`);
  }
}

async function resetE2eRoot(): Promise<void> {
  if (relative(PROJECT_ROOT, E2E_ROOT) !== join(".local", "e2e")) {
    throw new Error(`Raiz E2E inesperada: ${E2E_ROOT}`);
  }
  await rm(E2E_ROOT, { force: true, recursive: true });
  await Promise.all([mkdir(DATA_DIR, { recursive: true }), mkdir(ARTIFACTS_DIR, { recursive: true })]);
}

async function resetRuntimeData(): Promise<void> {
  for (const path of [DATA_DIR, WEBVIEW_DIR]) {
    assertInsideE2eRoot(path);
    await rm(path, { force: true, recursive: true });
  }
  await mkdir(DATA_DIR, { recursive: true });
}

async function isPortAvailable(): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(CDP_PORT, "127.0.0.1", resolveListen);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) {
      await new Promise<void>((resolveClose) => { server.close(() => { resolveClose(); }); });
    }
  }
}

async function waitUntil<T>(operation: () => Promise<T | false> | T | false, description: string): Promise<T> {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result !== false) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  const lastErrorMessage = lastError instanceof Error ? lastError.message : "";
  throw new Error(`Tempo esgotado aguardando ${description}.${lastErrorMessage.length === 0 ? "" : ` ${lastErrorMessage}`}`);
}

async function startApp(): Promise<RunningApp> {
  if (!await isPortAvailable()) throw new Error(`A porta CDP ${String(CDP_PORT)} está em uso.`);
  const child = spawn(EXECUTABLE, [], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PROJECTFLOW_E2E_EXPORT_PATH: PACKAGE_PATH,
      PROJECTFLOW_E2E_IMPORT_PATH: PACKAGE_PATH,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostic = "";
  child.stdout.on("data", (chunk: Buffer) => { diagnostic += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { diagnostic += chunk.toString(); });

  try {
    await waitUntil(async () => {
      if (child.exitCode !== null) {
        throw new Error(`ProjectFlow E2E encerrou com código ${String(child.exitCode)}.`);
      }
      try {
        const response = await fetch(`${CDP_URL}/json/version`);
        return response.ok && diagnostic.includes("started with database schema");
      } catch {
        return false;
      }
    }, `o WebView2 expor CDP em ${CDP_URL}`);
  } catch (error) {
    stopProcessTree(child);
    const message = error instanceof Error ? error.message : "Falha desconhecida ao iniciar o E2E.";
    throw new Error(`${message}\n${diagnostic}`, { cause: error });
  }

  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = await waitUntil(() => {
      const pages = browser.contexts().flatMap((context) => context.pages());
      return pages.find((candidate) => !candidate.url().startsWith("devtools://")) ?? false;
    }, "a página principal do ProjectFlow");
    await page.waitForLoadState("domcontentloaded");
    return { browser, child, page };
  } catch (error) {
    stopProcessTree(child);
    throw error;
  }
}

function stopProcessTree(child: ChildProcess | null): void {
  if (child?.exitCode !== null) return;
  if (child.pid === undefined) {
    child.kill();
    return;
  }
  spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
    encoding: "utf8",
    windowsHide: true,
  });
}

async function stopApp(app: RunningApp | null): Promise<void> {
  if (app === null) return;
  await app.browser.close().catch(() => undefined);
  stopProcessTree(app.child);
  await delay(500);
}

async function findByExactText(context: SearchContext, selector: string, text: string): Promise<Locator> {
  return await waitUntil(async () => {
    const candidates = context.locator(selector);
    const count = await candidates.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if ((await candidate.innerText()).trim() === text) return candidate;
    }
    return false;
  }, `${selector} com texto “${text}”`);
}

async function waitForInputValue(locator: Locator, expected: string): Promise<void> {
  await waitUntil(async () => await locator.inputValue() === expected, `o valor “${expected}”`);
}

async function setValue(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function taskRow(page: Page, title: string, occurrence = 0): Promise<Locator> {
  return await waitUntil(async () => {
    const rows = page.locator("tr.task-row");
    let matchIndex = 0;
    for (let index = 0; index < await rows.count(); index += 1) {
      const row = rows.nth(index);
      if (await row.locator('[aria-label="Título da tarefa"]').inputValue() !== title) continue;
      if (matchIndex === occurrence) return row;
      matchIndex += 1;
    }
    return false;
  }, `a linha da tarefa “${title}”`);
}

async function waitForTaskCount(page: Page, expected: number): Promise<void> {
  const label = `${String(expected)} ${expected === 1 ? "tarefa" : "tarefas"}`;
  await waitUntil(async () => (await page.locator(".project-meta").innerText()).includes(label), label);
}

async function createTask(page: Page, title: string, parentLabel?: string): Promise<void> {
  await page.locator("#quick-task-parent").selectOption({ label: parentLabel ?? "Sem tarefa-pai" });
  await setValue(page.locator("#quick-task-title"), title);
  await (await findByExactText(page, "button", "Adicionar")).click();
}

async function scheduleTask(page: Page, title: string, startDate: string, duration: number): Promise<void> {
  const row = await taskRow(page, title);
  await setValue(row.locator('[aria-label="Início da tarefa"]'), startDate);
  await setValue(row.locator('[aria-label="Duração da tarefa"]'), String(duration));
  await (await findByExactText(row, "button", "Salvar")).click();
  await waitUntil(async () => (await row.innerText()).includes("Salva"), `o salvamento de “${title}”`);
}

describe("fluxo mínimo do ProjectFlow no Tauri real", () => {
  let app: RunningApp | null = null;

  beforeAll(async () => {
    expect(existsSync(EXECUTABLE)).toBe(true);
    await resetE2eRoot();
  });

  afterAll(async () => { await stopApp(app); });

  it("planeja, propaga, visualiza, duplica, exporta e importa um workspace", async () => {
    app = await startApp();
    let { page } = app;
    await findByExactText(page, "h1,h2,h3", "Organize seu primeiro projeto");
    await page.locator('[aria-label="Criar projeto"]').click();
    const projectForm = page.locator("form.create-project-form");
    await setValue(projectForm.locator("input"), "E2E — Fluxo mínimo");
    await setValue(projectForm.locator("textarea"), "Workspace isolado criado por automação.");
    await (await findByExactText(projectForm, "button", "Criar")).click();
    await waitForInputValue(page.locator("#project-name"), "E2E — Fluxo mínimo");

    await createTask(page, "Tarefa A"); await waitForTaskCount(page, 1);
    await createTask(page, "Tarefa B"); await waitForTaskCount(page, 2);
    await createTask(page, "Tarefa C"); await waitForTaskCount(page, 3);
    await createTask(page, "Entrega com subtarefa"); await waitForTaskCount(page, 4);
    await createTask(page, "Subtarefa de validação", "4. Entrega com subtarefa"); await waitForTaskCount(page, 5);

    await scheduleTask(page, "Tarefa A", "2026-09-01", 2);
    await scheduleTask(page, "Tarefa B", "2026-09-03", 2);
    await scheduleTask(page, "Tarefa C", "2026-09-08", 1);
    await scheduleTask(page, "Subtarefa de validação", "2026-09-01", 3);

    const rowB = await taskRow(page, "Tarefa B");
    await rowB.locator('[aria-label="Nova predecessora de Tarefa B"]').selectOption({ label: "1. Tarefa A" });
    await rowB.locator('[aria-label="Confirmar predecessora de Tarefa B"]').click();
    await waitUntil(async () => (await rowB.innerText()).includes("1. Tarefa A"), "a predecessora de Tarefa B");
    const rowC = await taskRow(page, "Tarefa C");
    await rowC.locator('[aria-label="Nova predecessora de Tarefa C"]').selectOption({ label: "2. Tarefa B" });
    await rowC.locator('[aria-label="Confirmar predecessora de Tarefa C"]').click();
    await waitUntil(async () => (await rowC.innerText()).includes("2. Tarefa B"), "a predecessora de Tarefa C");

    const rowA = await taskRow(page, "Tarefa A");
    await setValue(rowA.locator('[aria-label="Início da tarefa"]'), "2026-09-03");
    await (await findByExactText(rowA, "button", "Salvar")).click();
    await waitForInputValue(rowB.locator('[aria-label="Início da tarefa"]'), "2026-09-07");
    await waitForInputValue(rowC.locator('[aria-label="Início da tarefa"]'), "2026-09-09");

    await (await findByExactText(page, '[role="tab"]', "Kanban")).click();
    await findByExactText(page, "h1,h2,h3", "Quadro Kanban");
    expect(await page.locator("article.kanban-card").count()).toBe(5);
    await (await findByExactText(page, '[role="tab"]', "Gantt")).click();
    await findByExactText(page, "h1,h2,h3", "Gráfico de Gantt");
    await page.locator('[data-testid="projectflow-gantt"]').waitFor();
    await (await findByExactText(page, '[role="tab"]', "Tabela")).click();

    const summaryRow = await taskRow(page, "Entrega com subtarefa");
    await (await findByExactText(summaryRow, "button", "Detalhes")).click();
    const detailsRow = summaryRow.locator("xpath=following-sibling::tr[1]");
    await (await findByExactText(detailsRow, "button", "Duplicar árvore")).click();
    await waitForTaskCount(page, 7);

    await (await findByExactText(page, "summary", "Arquivo")).click();
    await (await findByExactText(page, "button", "Exportar workspace")).click();
    await waitUntil(async () => (await page.locator("body").innerText()).includes("Workspace exportado para"), "a exportação do workspace");
    expect((await stat(PACKAGE_PATH)).size).toBeGreaterThan(0);

    await stopApp(app); app = null;
    await resetRuntimeData();
    app = await startApp(); page = app.page;
    await findByExactText(page, "h1,h2,h3", "Organize seu primeiro projeto");
    await (await findByExactText(page, "summary", "Arquivo")).click();
    await (await findByExactText(page, "button", "Importar pacote")).click();
    const importDialog = page.locator('[role="dialog"]');
    await waitUntil(async () => (await importDialog.innerText()).includes("E2E — Fluxo mínimo"), "a prévia do pacote");
    await (await findByExactText(importDialog, "button", "Importar seleção")).click();

    await waitForInputValue(page.locator("#project-name"), "E2E — Fluxo mínimo");
    await waitForTaskCount(page, 7);
    await waitForInputValue((await taskRow(page, "Tarefa A")).locator('[aria-label="Início da tarefa"]'), "2026-09-03");
    await waitForInputValue((await taskRow(page, "Tarefa B")).locator('[aria-label="Início da tarefa"]'), "2026-09-07");
    await waitForInputValue((await taskRow(page, "Tarefa C")).locator('[aria-label="Início da tarefa"]'), "2026-09-09");
    expect((await (await taskRow(page, "Tarefa B")).innerText()).includes("1. Tarefa A")).toBe(true);
    expect((await (await taskRow(page, "Tarefa C")).innerText()).includes("2. Tarefa B")).toBe(true);

    await (await findByExactText(page, '[role="tab"]', "Kanban")).click();
    await findByExactText(page, "h1,h2,h3", "Quadro Kanban");
    expect(await page.locator("article.kanban-card").count()).toBe(7);
    await (await findByExactText(page, '[role="tab"]', "Gantt")).click();
    await findByExactText(page, "h1,h2,h3", "Gráfico de Gantt");
    await page.locator('[data-testid="projectflow-gantt"]').waitFor();
  });
});
