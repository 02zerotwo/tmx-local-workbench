import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExportProgress,
  ProjectDetail,
  ProjectQuery,
  ProjectQueryResult,
  TmxDesktopApi,
  TranslationHistoryEntry,
  TranslationTextUpdate,
  TranslationUnitRow,
} from "@/lib/desktop-types";
import { ProjectWorkspace } from "./project-workspace";

const PROJECT: ProjectDetail = {
  id: "project-1",
  name: "Service Manual",
  fileName: "service-manual.tmx",
  sourceLanguage: "zh-CN",
  targetLanguages: ["en-US", "de-DE"],
  totalUnits: 320,
  changedUnits: 5,
  emptyUnits: 2,
  skippedUnits: 9,
  importStatus: "ready",
  fileSize: 4096,
  importedAt: "2026-07-14T02:00:00.000Z",
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "2026-07-14T03:00:00.000Z",
};

const ROWS: TranslationUnitRow[] = [
  {
    rowId: "row-1",
    projectId: "project-1",
    id: "alarm-1",
    position: 1,
    sourceLang: "zh-CN",
    sourceText: "报警复位步骤",
    originalSourceText: "报警复位步骤",
    targetLang: "en-US",
    targetText: "Reset the alarm",
    originalTargetText: "Reset the alarm",
    changed: false,
    duplicate: true,
    metadata: { section: "alarms" },
    updatedAt: "2026-07-14T03:00:00.000Z",
  },
  {
    rowId: "row-2",
    projectId: "project-1",
    id: "save-1",
    position: 2,
    sourceLang: "zh-CN",
    sourceText: "保存设置",
    originalSourceText: "保存设置",
    targetLang: "de-DE",
    targetText: "Einstellungen speichern",
    originalTargetText: "Einstellungen speichern",
    changed: false,
    duplicate: false,
    metadata: {},
    updatedAt: "2026-07-14T03:00:00.000Z",
  },
];

function resultFor(query: ProjectQuery): ProjectQueryResult {
  return {
    rows: ROWS,
    total: 320,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: 4,
  };
}

function applyUpdate(
  row: TranslationUnitRow,
  update: TranslationTextUpdate | string,
): TranslationUnitRow {
  const next = typeof update === "string"
    ? { sourceText: row.sourceText, targetText: update }
    : update;
  return {
    ...row,
    ...next,
    changed: true,
    updatedAt: "2026-07-14T04:00:00.000Z",
  };
}

function createApi(): TmxDesktopApi {
  return {
    listProjects: vi.fn(async () => []),
    getProject: vi.fn(async () => PROJECT),
    importProject: vi.fn(async () => null),
    renameProject: vi.fn(),
    deleteProject: vi.fn(async () => undefined),
    queryProject: vi.fn(async (query) => resultFor(query)),
    updateTranslation: vi.fn(async (_projectId, rowId, update) => applyUpdate(
      ROWS.find((row) => row.rowId === rowId)!,
      update,
    )),
    getTranslationHistory: vi.fn(async () => []),
    copyText: vi.fn(async () => undefined),
    exportProject: vi.fn(async () => "/tmp/export.xlsx"),
    openExportDirectory: vi.fn(async () => undefined),
    backupDatabase: vi.fn(async () => null),
    restoreDatabase: vi.fn(async () => false),
    openDataDirectory: vi.fn(async () => undefined),
    confirmAppClose: vi.fn(async () => undefined),
    onImportProgress: vi.fn(() => () => undefined),
    onExportProgress: vi.fn(() => () => undefined),
    onAppCloseRequested: vi.fn(() => () => undefined),
  };
}

function createRow(position: number): TranslationUnitRow {
  return {
    ...ROWS[0],
    rowId: `row-${position}`,
    id: `unit-${position}`,
    position,
    sourceText: `源文 ${position}`,
    originalSourceText: `源文 ${position}`,
    targetText: `Target ${position}`,
    originalTargetText: `Target ${position}`,
  };
}

function createPagedApi(): TmxDesktopApi {
  const api = createApi();
  vi.mocked(api.queryProject).mockImplementation(async (query) => ({
    rows: query.page === 1
      ? [createRow(1), createRow(2)]
      : [createRow(3), createRow(4)],
    total: 4,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: 2,
  }));
  vi.mocked(api.updateTranslation).mockImplementation(async (
    _projectId,
    rowId,
    update,
  ) => applyUpdate(createRow(Number(rowId.replace("row-", ""))), update));
  return api;
}

function historyEntry(
  rowId: string,
  version: number,
  targetText: string,
): TranslationHistoryEntry {
  return {
    projectId: PROJECT.id,
    rowId,
    version,
    previousSourceText: "Previous source",
    sourceText: `Source version ${version}`,
    previousTargetText: "Previous",
    targetText,
    changedAt: `2026-07-14T0${version}:00:00.000Z`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitForCondition(condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("Condition was not met before the microtask queue settled");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ProjectWorkspace filtering and pagination", () => {
  it("keeps the pagination footer at the same fixed height as editor actions", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByRole("textbox", { name: "目标文本" });

    expect(screen.getByTestId("pagination-footer")).toHaveClass("h-14");
    expect(screen.getByTestId("editor-actions")).toHaveClass("h-14");
  });

  it("loads page one with an empty target language meaning all languages", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);

    await waitFor(() => expect(api.queryProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        page: 1,
        pageSize: 200,
        filters: {
          query: "",
          targetLanguage: "",
          status: "all",
          duplicateOnly: false,
        },
      }),
    ));
  });

  it("keeps search text as a draft until Enter or the search button", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByRole("textbox", { name: "目标文本" });
    vi.mocked(api.queryProject).mockClear();

    const search = screen.getByRole("searchbox", { name: "搜索翻译" });
    fireEvent.change(search, { target: { value: "alarm" } });
    expect(api.queryProject).not.toHaveBeenCalled();

    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(api.queryProject).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        filters: expect.objectContaining({ query: "alarm" }),
      }),
    ));

    vi.mocked(api.queryProject).mockClear();
    fireEvent.change(search, { target: { value: "save" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(api.queryProject).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ query: "save" }),
      }),
    ));
  });

  it("applies structured filters immediately and resets to page one", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByRole("textbox", { name: "目标文本" });

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() => expect(api.queryProject).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ));

    fireEvent.change(screen.getByLabelText("目标语言"), {
      target: { value: "de-DE" },
    });
    await waitFor(() => expect(api.queryProject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        filters: expect.objectContaining({ targetLanguage: "de-DE" }),
      }),
    ));

    fireEvent.click(screen.getByRole("button", { name: "只看空译文" }));
    await waitFor(() => expect(api.queryProject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        filters: expect.objectContaining({ status: "empty" }),
      }),
    ));
  });

  it("clears every filter and requests page one", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByRole("textbox", { name: "目标文本" });
    const search = screen.getByRole("searchbox", { name: "搜索翻译" });
    fireEvent.change(search, { target: { value: "alarm" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.click(screen.getByRole("checkbox", { name: "仅重复项" }));

    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    await waitFor(() => expect(api.queryProject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        filters: {
          query: "",
          targetLanguage: "",
          status: "all",
          duplicateOnly: false,
        },
      }),
    ));
    expect(search).toHaveValue("");
  });
});

describe("ProjectWorkspace editing", () => {
  it("passes current source and target drafts to the desktop save API", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const source = await screen.findByRole("textbox", { name: "源文本" });
    const target = screen.getByRole("textbox", { name: "目标文本" });

    fireEvent.change(source, { target: { value: "编辑后的报警步骤" } });
    fireEvent.change(target, { target: { value: "Edited reset instructions" } });
    fireEvent.click(screen.getByRole("button", { name: "立即保存" }));

    await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-1",
      {
        sourceText: "编辑后的报警步骤",
        targetText: "Edited reset instructions",
      },
    ));
  });

  it("routes field copy actions through the desktop API", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByRole("textbox", { name: "源文本" });

    fireEvent.click(screen.getByRole("button", { name: "复制源文本" }));
    await waitFor(() => expect(api.copyText).toHaveBeenCalledWith(ROWS[0].sourceText));
  });

  it("debounces one-row saves and does not query on each keystroke", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByRole("textbox", { name: "目标文本" });
    const queryCount = vi.mocked(api.queryProject).mock.calls.length;
    vi.useFakeTimers();

    fireEvent.change(editor, { target: { value: "Reset alarm now" } });
    expect(api.updateTranslation).not.toHaveBeenCalled();
    expect(api.queryProject).toHaveBeenCalledTimes(queryCount);

    await act(async () => vi.advanceTimersByTimeAsync(500));
    await vi.waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-1",
      { sourceText: ROWS[0].sourceText, targetText: "Reset alarm now" },
    ));
    expect(api.queryProject).toHaveBeenCalledTimes(queryCount);
  });

  it("flushes the active edit before changing rows and exporting", async () => {
    const api = createApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByRole("textbox", { name: "目标文本" });

    fireEvent.change(editor, { target: { value: "Unsaved before row change" } });
    fireEvent.click(screen.getByRole("button", { name: "选择 save-1" }));
    await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-1",
      { sourceText: ROWS[0].sourceText, targetText: "Unsaved before row change" },
    ));
    expect(screen.getByRole("textbox", { name: "目标文本" }))
      .toHaveValue("Einstellungen speichern");

    fireEvent.change(screen.getByRole("textbox", { name: "目标文本" }), {
      target: { value: "Vor Export speichern" },
    });
    fireEvent.click(screen.getByRole("button", { name: "导出全部" }));
    await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-2",
      { sourceText: ROWS[1].sourceText, targetText: "Vor Export speichern" },
    ));
    expect(api.exportProject).toHaveBeenCalledWith("project-1", undefined);
  });

  it("flushes the active edit before confirming an application close", async () => {
    let closeListener: (() => void) | undefined;
    const api = createApi();
    vi.mocked(api.onAppCloseRequested).mockImplementation((listener) => {
      closeListener = listener;
      return () => undefined;
    });
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByRole("textbox", { name: "目标文本" });
    fireEvent.change(editor, { target: { value: "Saved before app close" } });

    expect(closeListener).toBeTypeOf("function");
    await act(async () => closeListener?.());

    await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-1",
      { sourceText: ROWS[0].sourceText, targetText: "Saved before app close" },
    ));
    expect(api.confirmAppClose).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.updateTranslation).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.confirmAppClose).mock.invocationCallOrder[0]);
  });

  it("does not confirm application close while an export is running", async () => {
    let closeListener: (() => void) | undefined;
    const pendingExport = deferred<string | null>();
    const api = createApi();
    vi.mocked(api.exportProject).mockImplementation(() => pendingExport.promise);
    vi.mocked(api.onAppCloseRequested).mockImplementation((listener) => {
      closeListener = listener;
      return () => undefined;
    });
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByRole("textbox", { name: "目标文本" });

    fireEvent.click(screen.getByRole("button", { name: "导出全部" }));
    await waitFor(() => expect(api.exportProject).toHaveBeenCalledTimes(1));
    await act(async () => closeListener?.());

    expect(api.confirmAppClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/导出.*完成.*关闭/);

    await act(async () => pendingExport.resolve(null));
  });

  it("locks editing while a filter query is replacing the visible rows", async () => {
    const pendingQuery = deferred<ProjectQueryResult>();
    const api = createApi();
    vi.mocked(api.queryProject)
      .mockImplementationOnce(async (query) => resultFor(query))
      .mockImplementationOnce(() => pendingQuery.promise);
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByRole("textbox", { name: "目标文本" });

    fireEvent.click(screen.getByRole("button", { name: "已修改" }));
    await waitFor(() => expect(api.queryProject).toHaveBeenCalledTimes(2));
    expect(editor).toBeDisabled();

    pendingQuery.resolve(resultFor({
      projectId: PROJECT.id,
      filters: {
        query: "",
        targetLanguage: "",
        status: "changed",
        duplicateOnly: false,
      },
      page: 1,
      pageSize: 100,
    }));
    await waitFor(() => expect(editor).toBeEnabled());
  });
});

describe("ProjectWorkspace editor navigation", () => {
  it("moves within the page and disables the global first boundary", async () => {
    const api = createPagedApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);

    expect(await screen.findByRole("textbox", { name: "目标文本" }))
      .toHaveValue("Target 1");
    expect(screen.getByRole("button", { name: "上一条" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "目标文本" }))
      .toHaveValue("Target 2"));

    fireEvent.click(screen.getByRole("button", { name: "上一条" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "目标文本" }))
      .toHaveValue("Target 1"));
  });

  it("selects the correct edge row when navigating across pages", async () => {
    const api = createPagedApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByDisplayValue("Target 1");

    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    await screen.findByDisplayValue("Target 2");
    fireEvent.click(screen.getByRole("button", { name: "下一条" }));

    await waitFor(() => expect(api.queryProject).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ));
    expect(await screen.findByDisplayValue("Target 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "上一条" }));
    expect(await screen.findByDisplayValue("Target 2")).toBeInTheDocument();
  });

  it("disables the global last boundary", async () => {
    const api = createPagedApi();
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByDisplayValue("Target 1");

    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    await screen.findByDisplayValue("Target 2");
    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    await screen.findByDisplayValue("Target 3");
    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    await screen.findByDisplayValue("Target 4");

    expect(screen.getByRole("button", { name: "下一条" })).toBeDisabled();
  });

  it("rolls back to the last successful page when cross-page loading fails", async () => {
    const api = createPagedApi();
    let pageTwoAttempts = 0;
    vi.mocked(api.queryProject).mockImplementation(async (query) => {
      if (query.page === 2 && pageTwoAttempts++ === 0) {
        throw new Error("page load failed");
      }
      return {
        rows: query.page === 1
          ? [createRow(1), createRow(2)]
          : [createRow(3), createRow(4)],
        total: 4,
        page: query.page,
        pageSize: query.pageSize,
        pageCount: 2,
      };
    });
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByDisplayValue("Target 1");

    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    await screen.findByDisplayValue("Target 2");
    fireEvent.click(screen.getByRole("button", { name: "下一条" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("page load failed");
    await waitFor(() => expect(screen.getByRole("button", { name: "下一条" }))
      .toBeEnabled());
    expect(screen.getByDisplayValue("Target 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    expect(await screen.findByDisplayValue("Target 3")).toBeInTheDocument();
  });
});

describe("ProjectWorkspace history", () => {
  async function openHistoryDrawer() {
    await screen.findByRole("textbox", { name: "目标文本" });
    fireEvent.click(screen.getByRole("button", { name: "修改记录" }));
    return screen.getByRole("complementary", { name: "修改记录" });
  }

  it("ignores a stale history response after selecting another row", async () => {
    const api = createApi();
    const rowOneHistory = deferred<TranslationHistoryEntry[]>();
    const rowTwoHistory = deferred<TranslationHistoryEntry[]>();
    vi.mocked(api.getTranslationHistory).mockImplementation((_projectId, rowId) => (
      rowId === "row-1" ? rowOneHistory.promise : rowTwoHistory.promise
    ));
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByDisplayValue("Reset the alarm");

    fireEvent.click(screen.getByRole("button", { name: "选择 save-1" }));
    await screen.findByDisplayValue("Einstellungen speichern");
    await openHistoryDrawer();
    rowTwoHistory.resolve([historyEntry("row-2", 2, "Row two history")]);
    expect(await screen.findByText("Row two history")).toBeInTheDocument();

    rowOneHistory.resolve([historyEntry("row-1", 1, "Stale row one history")]);
    await act(async () => rowOneHistory.promise);
    expect(screen.queryByText("Stale row one history")).not.toBeInTheDocument();
  });

  it("refreshes history after saving", async () => {
    const api = createApi();
    vi.mocked(api.getTranslationHistory)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([historyEntry("row-1", 1, "Saved version")]);
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByDisplayValue("Reset the alarm");
    await waitFor(() => expect(api.getTranslationHistory).toHaveBeenCalledTimes(1));

    fireEvent.change(editor, { target: { value: "Saved version" } });
    fireEvent.click(screen.getByRole("button", { name: "立即保存" }));

    const drawer = await openHistoryDrawer();
    expect(await within(drawer).findByText("Saved version")).toBeInTheDocument();
    expect(api.getTranslationHistory).toHaveBeenLastCalledWith("project-1", "row-1");
  });

  it("restores a historical version into the database and current draft", async () => {
    const api = createApi();
    vi.mocked(api.getTranslationHistory)
      .mockResolvedValueOnce([historyEntry("row-1", 1, "Historical target")])
      .mockResolvedValueOnce([historyEntry("row-1", 2, "Historical target")]);
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const drawer = await openHistoryDrawer();
    await within(drawer).findByText("Historical target");

    await act(async () => {
      fireEvent.click(within(drawer).getAllByRole("button", { name: "恢复此版本" })[0]);
      await Promise.resolve();
    });
    await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-1",
      { sourceText: "Source version 1", targetText: "Historical target" },
    ));
    expect(await screen.findByDisplayValue("Historical target")).toBeInTheDocument();
    expect(api.getTranslationHistory).toHaveBeenCalledTimes(2);
  });

  it("waits for an onBlur save before restoring history", async () => {
    const api = createApi();
    const pendingSave = deferred<TranslationUnitRow>();
    vi.mocked(api.getTranslationHistory).mockResolvedValue([
      historyEntry("row-1", 1, "Historical target"),
    ]);
    vi.mocked(api.updateTranslation)
      .mockImplementationOnce(() => pendingSave.promise)
      .mockImplementationOnce(async (_projectId, _rowId, update) => ({
        ...applyUpdate(ROWS[0], update),
        updatedAt: "2026-07-14T05:00:00.000Z",
      }));
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByRole("textbox", { name: "目标文本" });
    fireEvent.change(editor, { target: { value: "Unsaved draft" } });
    fireEvent.blur(editor);
    const drawer = await openHistoryDrawer();
    await within(drawer).findByText("Historical target");

    await waitFor(() => expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-1",
      { sourceText: ROWS[0].sourceText, targetText: "Unsaved draft" },
    ));
    fireEvent.click(within(drawer).getAllByRole("button", { name: "恢复此版本" })[0]);
    expect(api.updateTranslation).toHaveBeenCalledTimes(1);

    pendingSave.resolve({
      ...ROWS[0],
      targetText: "Unsaved draft",
      changed: true,
      updatedAt: "2026-07-14T04:00:00.000Z",
    });
    await waitFor(() => expect(api.updateTranslation).toHaveBeenNthCalledWith(
      2,
      "project-1",
      "row-1",
      { sourceText: "Source version 1", targetText: "Historical target" },
    ));
  });

  it("saves every draft typed during an in-flight save before restoring history", async () => {
    const api = createApi();
    const firstSave = deferred<TranslationUnitRow>();
    const latestSave = deferred<TranslationUnitRow>();
    const restoreSave = deferred<TranslationUnitRow>();
    vi.mocked(api.getTranslationHistory).mockResolvedValue([
      historyEntry("row-1", 1, "Historical target"),
    ]);
    vi.mocked(api.updateTranslation)
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => latestSave.promise)
      .mockImplementationOnce(() => restoreSave.promise);
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByRole("textbox", { name: "目标文本" });
    await act(async () => {
      fireEvent.change(editor, { target: { value: "First draft" } });
      fireEvent.blur(editor);
      await waitForCondition(() => vi.mocked(api.updateTranslation).mock.calls.length === 1);
      fireEvent.change(editor, { target: { value: "Latest draft" } });
    });
    const drawer = await openHistoryDrawer();
    await within(drawer).findByText("Historical target");

    await act(async () => {
      fireEvent.click(within(drawer).getAllByRole("button", { name: "恢复此版本" })[0]);
      expect(api.updateTranslation).toHaveBeenNthCalledWith(
        1,
        "project-1",
        "row-1",
        { sourceText: ROWS[0].sourceText, targetText: "First draft" },
      );
      firstSave.resolve({
        ...ROWS[0],
        targetText: "First draft",
        changed: true,
        updatedAt: "2026-07-14T04:00:00.000Z",
      });
      await firstSave.promise;
      await waitForCondition(() => vi.mocked(api.updateTranslation).mock.calls.length === 2);
      expect(api.updateTranslation).toHaveBeenNthCalledWith(
        2,
        "project-1",
        "row-1",
        { sourceText: ROWS[0].sourceText, targetText: "Latest draft" },
      );

      latestSave.resolve({
        ...ROWS[0],
        targetText: "Latest draft",
        changed: true,
        updatedAt: "2026-07-14T05:00:00.000Z",
      });
      await latestSave.promise;
      await waitForCondition(() => vi.mocked(api.updateTranslation).mock.calls.length === 3);
      expect(api.updateTranslation).toHaveBeenNthCalledWith(
        3,
        "project-1",
        "row-1",
        { sourceText: "Source version 1", targetText: "Historical target" },
      );

      restoreSave.resolve({
        ...ROWS[0],
        targetText: "Historical target",
        changed: true,
        updatedAt: "2026-07-14T06:00:00.000Z",
      });
      await restoreSave.promise;
    });
    expect(await screen.findByDisplayValue("Historical target")).toBeVisible();

    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(api.updateTranslation).toHaveBeenCalledTimes(3);
  });

  it("does not restore history when the unsaved draft cannot be saved", async () => {
    const api = createApi();
    vi.mocked(api.getTranslationHistory).mockResolvedValue([
      historyEntry("row-1", 1, "Historical target"),
    ]);
    vi.mocked(api.updateTranslation).mockRejectedValueOnce(new Error("disk full"));
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByRole("textbox", { name: "目标文本" });
    fireEvent.change(editor, { target: { value: "Must be saved first" } });
    const drawer = await openHistoryDrawer();
    await within(drawer).findByText("Historical target");

    fireEvent.click(within(drawer).getAllByRole("button", { name: "恢复此版本" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("恢复失败，请重试");
    expect(api.updateTranslation).toHaveBeenCalledTimes(1);
    expect(api.updateTranslation).toHaveBeenCalledWith(
      "project-1",
      "row-1",
      { sourceText: ROWS[0].sourceText, targetText: "Must be saved first" },
    );
  });

  it("lets the editor report a failed history restore", async () => {
    const api = createApi();
    vi.mocked(api.getTranslationHistory).mockResolvedValue([
      historyEntry("row-1", 1, "Historical target"),
    ]);
    vi.mocked(api.updateTranslation).mockRejectedValue(new Error("write failed"));
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const drawer = await openHistoryDrawer();
    await within(drawer).findByText("Historical target");

    fireEvent.click(within(drawer).getAllByRole("button", { name: "恢复此版本" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("恢复失败，请重试");
  });
});

describe("ProjectWorkspace export feedback", () => {
  it("locks translation editing for the whole export operation", async () => {
    const api = createApi();
    const pendingExport = deferred<string | null>();
    vi.mocked(api.exportProject).mockImplementation(() => pendingExport.promise);
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    const editor = await screen.findByDisplayValue("Reset the alarm");

    fireEvent.click(screen.getByRole("button", { name: "导出全部" }));
    await waitFor(() => expect(editor).toBeDisabled());

    pendingExport.resolve(null);
    await waitFor(() => expect(editor).toBeEnabled());
  });

  it("exposes export progress to assistive technology", async () => {
    const api = createApi();
    const pendingExport = deferred<string | null>();
    let progressListener: ((progress: ExportProgress) => void) | undefined;
    vi.mocked(api.exportProject).mockImplementation(() => pendingExport.promise);
    vi.mocked(api.onExportProgress).mockImplementation((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByDisplayValue("Reset the alarm");
    fireEvent.click(screen.getByRole("button", { name: "导出全部" }));

    act(() => progressListener?.({
      operationId: "export-1",
      projectId: PROJECT.id,
      stage: "writing",
      processed: 42,
      total: 100,
      percent: 42,
      message: "正在导出",
    }));

    const progressbar = screen.getByRole("progressbar", { name: "导出进度" });
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    expect(progressbar).toHaveAttribute("aria-valuenow", "42");
    await act(async () => {
      pendingExport.resolve(null);
      await pendingExport.promise;
    });
  });

  it("shows the exported path and opens its folder", async () => {
    const api = createApi();
    vi.mocked(api.exportProject).mockResolvedValue("/exports/Service Manual-2026-07-14.xlsx");
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByDisplayValue("Reset the alarm");

    fireEvent.click(screen.getByRole("button", { name: "导出全部" }));

    expect(await screen.findByRole("status", { name: "导出成功" }))
      .toHaveTextContent("/exports/Service Manual-2026-07-14.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "打开文件夹" }));
    await waitFor(() => expect(api.openExportDirectory).toHaveBeenCalledWith(
      "/exports/Service Manual-2026-07-14.xlsx",
    ));
  });

  it("does not show success feedback when export is cancelled", async () => {
    const api = createApi();
    vi.mocked(api.exportProject).mockResolvedValue(null);
    render(<ProjectWorkspace api={api} onBack={vi.fn()} project={PROJECT} />);
    await screen.findByDisplayValue("Reset the alarm");

    fireEvent.click(screen.getByRole("button", { name: "导出全部" }));
    await waitFor(() => expect(api.exportProject).toHaveBeenCalled());

    expect(screen.queryByRole("status", { name: "导出成功" })).not.toBeInTheDocument();
  });
});
