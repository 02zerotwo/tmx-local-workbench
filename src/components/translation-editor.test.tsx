import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  TranslationHistoryEntry,
  TranslationTextUpdate,
  TranslationUnitRow,
} from "@/lib/desktop-types";
import { TranslationEditor } from "./translation-editor";

const ROW: TranslationUnitRow = {
  rowId: "row-1",
  projectId: "project-1",
  id: "alarm-1",
  position: 1,
  sourceLang: "zh-CN",
  sourceText: "复制这段源文",
  originalSourceText: "复制这段源文",
  targetLang: "en-US",
  targetText: "Alarm alarm Alarm",
  originalTargetText: "Original alarm",
  changed: false,
  duplicate: false,
  metadata: {},
  updatedAt: "2026-07-14T03:04:05.000Z",
};

const HISTORY: TranslationHistoryEntry[] = [
  {
    projectId: "project-1",
    rowId: "row-1",
    version: 1,
    previousSourceText: "复制这段源文",
    sourceText: "第一版源文",
    previousTargetText: "Original alarm",
    targetText: "First version",
    changedAt: "2026-07-14T03:05:00.000Z",
  },
  {
    projectId: "project-1",
    rowId: "row-1",
    version: 3,
    previousSourceText: "第二版源文",
    sourceText: "最新版源文",
    previousTargetText: "Second version",
    targetText: "Newest version",
    changedAt: "2026-07-14T03:07:00.000Z",
  },
];

type SetupOptions = {
  canPrevious?: boolean;
  canNext?: boolean;
  editingLocked?: boolean;
  onSave?: (
    rowId: string,
    update: TranslationTextUpdate,
  ) => Promise<TranslationUnitRow>;
  onCopyText?: (text: string) => Promise<void>;
  history?: TranslationHistoryEntry[];
  historyError?: string;
  historyLoading?: boolean;
  onRestoreHistory?: (entry: TranslationHistoryEntry) => void | Promise<void>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function applyUpdate(
  update: TranslationTextUpdate | string,
): TranslationUnitRow {
  const next =
    typeof update === "string"
      ? { sourceText: ROW.sourceText, targetText: update }
      : update;
  return {
    ...ROW,
    ...next,
    changed:
      next.sourceText !== ROW.originalSourceText ||
      next.targetText !== ROW.originalTargetText,
    updatedAt: "2026-07-14T08:09:10.000Z",
  };
}

function setup(options: SetupOptions = {}) {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const onSaved = vi.fn();
  const onRestoreHistory = vi.fn(options.onRestoreHistory ?? (() => undefined));
  const onCopyText = vi.fn(options.onCopyText ?? (async () => undefined));
  const onSave =
    options.onSave ?? vi.fn(async (_rowId, update) => applyUpdate(update));

  render(
    <TranslationEditor
      canNext={options.canNext ?? true}
      canPrevious={options.canPrevious ?? true}
      editingLocked={options.editingLocked ?? false}
      history={options.history ?? HISTORY}
      historyError={options.historyError ?? ""}
      historyLoading={options.historyLoading ?? false}
      onNext={onNext}
      onCopyText={onCopyText}
      onPrevious={onPrevious}
      onRestoreHistory={onRestoreHistory}
      onSave={onSave}
      onSaved={onSaved}
      row={ROW}
    />,
  );

  return { onCopyText, onNext, onPrevious, onRestoreHistory, onSave, onSaved };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TranslationEditor navigation and saving", () => {
  it("locks every draft-changing control while an external operation is active", () => {
    setup({ editingLocked: true });

    expect(screen.getByRole("textbox", { name: "源文本" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "目标文本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "复制源文本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "复制目标文本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "恢复原文" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "立即保存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存并下一条" })).toBeDisabled();
  });

  it("keeps all primary actions in one footer and respects disabled navigation", async () => {
    const { onNext, onPrevious } = setup({ canPrevious: false });
    const footer = screen.getByTestId("editor-actions");

    expect(
      within(footer).getByRole("button", { name: "上一条" }),
    ).toBeDisabled();
    expect(
      within(footer).getByRole("button", { name: "下一条" }),
    ).toBeEnabled();
    expect(
      within(footer).queryByRole("button", { name: "复制源文到译文" }),
    ).not.toBeInTheDocument();
    expect(
      within(footer).getByRole("button", { name: "立即保存" }),
    ).toBeVisible();
    expect(
      within(footer).getByRole("button", { name: "保存并下一条" }),
    ).toBeVisible();
    expect(
      within(footer).getByRole("button", { name: "立即保存" }),
    ).toHaveAttribute("data-variant", "default");
    expect(
      within(footer).getByRole("button", { name: "保存并下一条" }),
    ).toHaveAttribute("data-variant", "default");
    expect(within(footer).getByText(/Alt\+↑/)).toBeInTheDocument();
    expect(within(footer).getByText(/Alt\+↓/)).toBeInTheDocument();
    expect(footer).toHaveClass("h-14");

    fireEvent.click(within(footer).getByRole("button", { name: "上一条" }));
    fireEvent.click(within(footer).getByRole("button", { name: "下一条" }));
    expect(onPrevious).not.toHaveBeenCalled();
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
  });

  it("flushes successfully before button navigation and stays put after a failure", async () => {
    const firstSave = deferred<TranslationUnitRow>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockRejectedValueOnce(new Error("disk full"));
    const { onNext, onPrevious } = setup({ onSave });
    const editor = screen.getByRole("textbox", { name: "目标文本" });

    fireEvent.change(editor, { target: { value: "Before next" } });
    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    expect(onNext).not.toHaveBeenCalled();
    firstSave.resolve({
      ...ROW,
      targetText: "Before next",
      updatedAt: "2026-07-14T08:09:10.000Z",
    });
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));

    fireEvent.change(editor, { target: { value: "Before previous" } });
    fireEvent.click(screen.getByRole("button", { name: "上一条" }));
    await waitFor(() => expect(screen.getByText("保存失败")).toBeVisible());
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it.each([
    { key: "ArrowUp", callback: "previous" as const },
    { key: "ArrowDown", callback: "next" as const },
  ])("flushes before Alt+$key navigation", async ({ key, callback }) => {
    const pendingSave = deferred<TranslationUnitRow>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => pendingSave.promise)
      .mockRejectedValueOnce(new Error("disk full"));
    const controls = setup({ onSave });
    fireEvent.change(screen.getByRole("textbox", { name: "目标文本" }), {
      target: { value: `Before ${callback}` },
    });
    screen.getByRole("textbox", { name: "目标文本" }).focus();

    fireEvent.keyDown(window, { key, altKey: true });
    expect(controls.onPrevious).not.toHaveBeenCalled();
    expect(controls.onNext).not.toHaveBeenCalled();

    pendingSave.resolve({
      ...ROW,
      targetText: `Before ${callback}`,
      updatedAt: "2026-07-14T08:09:10.000Z",
    });
    await waitFor(() =>
      expect(
        callback === "previous" ? controls.onPrevious : controls.onNext,
      ).toHaveBeenCalledTimes(1),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "目标文本" }), {
      target: { value: `Failed ${callback}` },
    });
    fireEvent.keyDown(window, { key, altKey: true });
    await waitFor(() => expect(screen.getByText("保存失败")).toBeVisible());
    expect(
      callback === "previous" ? controls.onPrevious : controls.onNext,
    ).toHaveBeenCalledTimes(1);
  });

  it("copies each current draft through the desktop clipboard and reports success", async () => {
    const { onCopyText } = setup();
    const source = screen.getByRole("textbox", { name: "源文本" });
    const target = screen.getByRole("textbox", { name: "目标文本" });

    fireEvent.change(source, { target: { value: "编辑后的源文" } });
    fireEvent.change(target, { target: { value: "Edited target" } });
    fireEvent.click(screen.getByRole("button", { name: "复制源文本" }));
    await waitFor(() =>
      expect(onCopyText).toHaveBeenCalledWith("编辑后的源文"),
    );
    expect(screen.getByText("已复制")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "复制目标文本" }));
    await waitFor(() =>
      expect(onCopyText).toHaveBeenCalledWith("Edited target"),
    );
  });

  it("shows visible feedback when copying fails", async () => {
    setup({
      onCopyText: async () => {
        throw new Error("clipboard denied");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "复制源文本" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("复制失败");
  });

  it("autosaves source and target drafts atomically", async () => {
    vi.useFakeTimers();
    const { onSave } = setup();

    fireEvent.change(screen.getByRole("textbox", { name: "源文本" }), {
      target: { value: "编辑后的源文" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "目标文本" }), {
      target: { value: "Edited target" },
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(500));
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("row-1", {
        sourceText: "编辑后的源文",
        targetText: "Edited target",
      }),
    );
    expect(screen.queryByText("保存成功")).not.toBeInTheDocument();
    expect(screen.getByText(/已保存 \d{2}:\d{2}:\d{2}/)).toBeVisible();
  });

  it("shows a short success notice and the latest save time after an explicit save", async () => {
    vi.useFakeTimers();
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "目标文本" }), {
      target: { value: "Explicit save" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "立即保存" }));
      await Promise.resolve();
    });
    expect(screen.getByText("保存成功")).toBeVisible();
    expect(screen.getByText(/已保存 \d{2}:\d{2}:\d{2}/)).toBeVisible();

    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.queryByText("保存成功")).not.toBeInTheDocument();
  });

  it("moves next only after save succeeds and never moves after save fails", async () => {
    const success = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "目标文本" }), {
      target: { value: "Save then next" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并下一条" }));
    await waitFor(() => expect(success.onNext).toHaveBeenCalledTimes(1));
    expect(vi.mocked(success.onSave).mock.invocationCallOrder[0]).toBeLessThan(
      success.onNext.mock.invocationCallOrder[0],
    );

    const failedSave = vi.fn(async () => {
      throw new Error("disk full");
    });
    const failure = setup({ onSave: failedSave });
    const editors = screen.getAllByRole("textbox", { name: "目标文本" });
    fireEvent.change(editors[1], { target: { value: "Must stay here" } });
    const saveNextButtons = screen.getAllByRole("button", {
      name: "保存并下一条",
    });
    fireEvent.click(saveNextButtons[1]);

    await waitFor(() =>
      expect(screen.getAllByText("保存失败")).toHaveLength(1),
    );
    expect(failure.onNext).not.toHaveBeenCalled();
  });

  it("saves edits made during an in-flight save before moving next", async () => {
    const firstSave = deferred<TranslationUnitRow>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(async (_rowId, update) => ({
        ...applyUpdate(update),
        updatedAt: "2026-07-14T08:09:11.000Z",
      }));
    const { onNext } = setup({ onSave });
    const editor = screen.getByRole("textbox", { name: "目标文本" });

    fireEvent.change(editor, { target: { value: "First draft" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并下一条" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("row-1", {
        sourceText: ROW.sourceText,
        targetText: "First draft",
      }),
    );
    fireEvent.change(editor, { target: { value: "Latest draft" } });
    firstSave.resolve({
      ...ROW,
      targetText: "First draft",
      updatedAt: "2026-07-14T08:09:10.000Z",
    });

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("row-1", {
        sourceText: ROW.sourceText,
        targetText: "Latest draft",
      }),
    );
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(vi.mocked(onSave).mock.invocationCallOrder[1]).toBeLessThan(
      onNext.mock.invocationCallOrder[0],
    );
  });

  it("supports save/navigation shortcuts and ignores disabled directions", async () => {
    const enabled = setup();
    const editor = screen.getByRole("textbox", { name: "目标文本" });
    fireEvent.change(editor, { target: { value: "Shortcut save" } });
    editor.focus();

    fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(enabled.onPrevious).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(enabled.onNext).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(enabled.onNext).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await waitFor(() => expect(enabled.onNext).toHaveBeenCalledTimes(3));

    const disabled = setup({ canPrevious: false, canNext: false });
    const disabledEditor = screen.getAllByRole("textbox", {
      name: "目标文本",
    })[1];
    disabledEditor.focus();
    fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowDown", altKey: true });
    expect(disabled.onPrevious).not.toHaveBeenCalled();
    expect(disabled.onNext).not.toHaveBeenCalled();
  });

  it("ignores all editor shortcuts while an IME composition is active", async () => {
    const { onNext, onPrevious, onSave } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "目标文本" }), {
      target: { value: "Composing text" },
    });
    screen.getByRole("textbox", { name: "目标文本" }).focus();

    fireEvent.keyDown(window, {
      key: "Enter",
      ctrlKey: true,
      isComposing: true,
    });
    fireEvent.keyDown(window, {
      key: "Enter",
      metaKey: true,
      isComposing: true,
    });
    fireEvent.keyDown(window, {
      key: "ArrowUp",
      altKey: true,
      isComposing: true,
    });
    fireEvent.keyDown(window, {
      key: "ArrowDown",
      altKey: true,
      isComposing: true,
    });
    await act(async () => Promise.resolve());

    expect(onSave).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("ignores editor shortcuts while focus is outside the target textarea", async () => {
    const { onNext, onPrevious, onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    render(
      <div>
        <input aria-label="搜索翻译" />
        <select aria-label="目标语言">
          <option>全部</option>
        </select>
      </div>,
    );
    const foreignControls = [
      screen.getByRole("textbox", { name: "搜索翻译" }),
      screen.getByRole("combobox", { name: "目标语言" }),
      screen.getByRole("textbox", { name: "查找内容" }),
    ];

    for (const control of foreignControls) {
      control.focus();
      fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
      fireEvent.keyDown(window, { key: "ArrowDown", altKey: true });
      fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    }
    await act(async () => Promise.resolve());

    expect(onSave).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("TranslationEditor find and replace", () => {
  it("keeps find text as a draft until Enter submits it", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    const query = screen.getByRole("textbox", { name: "查找内容" });
    const editor = screen.getByRole("textbox", {
      name: "目标文本",
    }) as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(6, 6);

    expect(screen.getByRole("button", { name: "替换当前" })).toBeDisabled();
    query.focus();
    fireEvent.change(query, { target: { value: "Alarm" } });
    expect(screen.getByText("0 / 0")).toBeVisible();
    expect(query).toHaveFocus();
    expect(editor.selectionStart).toBe(6);

    fireEvent.keyDown(query, { key: "Enter" });
    expect(screen.getByText("1 / 3")).toBeVisible();
    expect(editor.selectionStart).toBe(0);
    expect(editor.selectionEnd).toBe(5);

    fireEvent.click(screen.getByRole("button", { name: "下一个匹配" }));
    expect(screen.getByText("2 / 3")).toBeVisible();
    expect(editor.selectionStart).toBe(6);
    fireEvent.click(screen.getByRole("button", { name: "上一个匹配" }));
    expect(editor.selectionStart).toBe(0);
  });

  it("submits from the find button and highlights every match", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    fireEvent.change(screen.getByRole("textbox", { name: "查找内容" }), {
      target: { value: "alarm" },
    });

    fireEvent.click(screen.getByRole("button", { name: "执行查找" }));

    expect(screen.getAllByTestId("find-highlight")).toHaveLength(3);
    expect(screen.getByTestId("find-highlight-active")).toHaveTextContent(
      "Alarm",
    );
  });

  it("toggles case-sensitive matching for the committed query", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    const query = screen.getByRole("textbox", { name: "查找内容" });
    fireEvent.change(query, { target: { value: "Alarm" } });
    fireEvent.keyDown(query, { key: "Enter" });
    expect(screen.getByText("1 / 3")).toBeVisible();

    const matchCase = screen.getByRole("button", { name: "区分大小写" });
    fireEvent.click(matchCase);

    expect(matchCase).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 / 2")).toBeVisible();
  });

  it("replaces the current match or all exact matches in the current draft", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    fireEvent.change(screen.getByRole("textbox", { name: "查找内容" }), {
      target: { value: "Alarm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "区分大小写" }));
    fireEvent.click(screen.getByRole("button", { name: "执行查找" }));
    fireEvent.change(screen.getByRole("textbox", { name: "替换为" }), {
      target: { value: "Warning" },
    });

    fireEvent.click(screen.getByRole("button", { name: "替换当前" }));
    const editor = screen.getByRole("textbox", {
      name: "目标文本",
    }) as HTMLTextAreaElement;
    expect(editor).toHaveValue("Warning alarm Alarm");
    expect(editor.selectionStart).toBe(14);
    expect(editor.selectionEnd).toBe(19);

    fireEvent.click(screen.getByRole("button", { name: "全部替换" }));
    expect(editor).toHaveValue("Warning alarm Warning");
    expect(screen.getByText("0 / 0")).toBeVisible();
  });

  it("selects the logical next match and skips matches introduced by the replacement", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    fireEvent.change(screen.getByRole("textbox", { name: "查找内容" }), {
      target: { value: "Alarm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "区分大小写" }));
    fireEvent.click(screen.getByRole("button", { name: "执行查找" }));
    fireEvent.change(screen.getByRole("textbox", { name: "替换为" }), {
      target: { value: "Alarm!" },
    });

    fireEvent.click(screen.getByRole("button", { name: "替换当前" }));
    const editor = screen.getByRole("textbox", {
      name: "目标文本",
    }) as HTMLTextAreaElement;
    expect(editor).toHaveValue("Alarm! alarm Alarm");
    expect(editor.selectionStart).toBe(13);
    expect(editor.selectionEnd).toBe(18);
    expect(screen.getByText("2 / 2")).toBeVisible();
  });

  it("finds and replaces literal Chinese text spanning a line break", async () => {
    vi.useFakeTimers();
    const { onSave } = setup();
    const editor = screen.getByRole("textbox", { name: "目标文本" });
    fireEvent.change(editor, {
      target: { value: "第一行中文\n第二行中文\n第一行中文\n第二行中文" },
    });
    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    fireEvent.change(screen.getByRole("textbox", { name: "查找内容" }), {
      target: { value: "中文\n第二行" },
    });
    fireEvent.click(screen.getByRole("button", { name: "执行查找" }));
    fireEvent.change(screen.getByRole("textbox", { name: "替换为" }), {
      target: { value: "内容换行" },
    });

    expect(screen.getByText("1 / 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "全部替换" }));
    expect(editor).toHaveValue("第一行内容换行中文\n第一行内容换行中文");
    expect(screen.getByText("0 / 0")).toBeVisible();

    await act(async () => vi.advanceTimersByTimeAsync(500));
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith("row-1", {
        sourceText: ROW.sourceText,
        targetText: "第一行内容换行中文\n第一行内容换行中文",
      }),
    );
  });

  it("capitalizes the first English letter only inside the selected target range", () => {
    setup();
    const editor = screen.getByRole("textbox", {
      name: "目标文本",
    }) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: { value: 'prefix "alarm remains lower' },
    });
    editor.focus();
    editor.setSelectionRange(7, 13);
    fireEvent.select(editor);

    const capitalize = screen.getByRole("button", {
      name: "选中区域首字母大写",
    });
    fireEvent.click(capitalize);

    expect(editor).toHaveValue('prefix "Alarm remains lower');
    expect(editor.selectionStart).toBe(7);
    expect(editor.selectionEnd).toBe(13);
  });

  it("does not capitalize target text when there is no selection", () => {
    setup();
    const editor = screen.getByRole("textbox", {
      name: "目标文本",
    }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "alarm remains lower" } });
    editor.setSelectionRange(0, 0);

    fireEvent.click(screen.getByRole("button", { name: "选中区域首字母大写" }));

    expect(editor).toHaveValue("alarm remains lower");
  });

  it("provides hover hints for target editing and find actions", () => {
    setup();
    const toolbarActions = [
      "复制目标文本",
      "选中区域首字母大写",
      "恢复原文",
      "展开查找替换",
    ];
    for (const name of toolbarActions) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("title");
    }

    fireEvent.click(screen.getByRole("button", { name: "展开查找替换" }));
    const findActions = [
      "区分大小写",
      "执行查找",
      "上一个匹配",
      "下一个匹配",
      "替换当前",
      "全部替换",
    ];
    for (const name of findActions) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("title");
    }
  });
});

describe("TranslationEditor history", () => {
  function openHistory() {
    fireEvent.click(screen.getByRole("button", { name: "修改记录" }));
    return screen.getByRole("dialog", { name: "修改记录" });
  }

  it("keeps history out of the editor until the top button opens its overlay drawer", async () => {
    setup();
    expect(
      screen.queryByRole("dialog", { name: "修改记录" }),
    ).not.toBeInTheDocument();

    const historyButton = screen.getByRole("button", { name: "修改记录" });
    const drawer = openHistory();
    expect(drawer).toHaveAttribute("data-slot", "drawer-content");
    expect(drawer).toHaveClass("fixed");
    expect(screen.getByTestId("editor-surface")).toHaveAttribute("inert");
    expect(
      within(drawer).getByRole("button", { name: "关闭修改记录" }),
    ).toHaveFocus();
    expect(within(drawer).getByText("最新版源文")).toBeVisible();
    expect(within(drawer).getByText("Newest version")).toBeVisible();

    fireEvent.click(
      within(drawer).getByRole("button", { name: "关闭修改记录" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "修改记录" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(historyButton).toHaveFocus());
  });

  it("shows and restores the complete imported source and target snapshot", async () => {
    const { onRestoreHistory } = setup();
    const drawer = openHistory();
    const originalCard = within(drawer)
      .getByText("导入版本")
      .closest("article")!;

    expect(
      within(originalCard).getByText(ROW.originalSourceText),
    ).toBeVisible();
    expect(
      within(originalCard).getByText(ROW.originalTargetText),
    ).toBeVisible();
    fireEvent.click(
      within(originalCard).getByRole("button", { name: "恢复此版本" }),
    );

    await waitFor(() =>
      expect(onRestoreHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceText: ROW.originalSourceText,
          targetText: ROW.originalTargetText,
        }),
      ),
    );
  });

  it("shows complete multiline source and target history text without line clamping", () => {
    const longHistory: TranslationHistoryEntry[] = [
      {
        ...HISTORY[0],
        sourceText: "源文第一行\n源文第二行\n源文第三行\n源文第四行",
        targetText:
          "Target line one\nTarget line two\nTarget line three\nTarget line four",
      },
    ];
    setup({ history: longHistory });

    const drawer = openHistory();
    const sourcePreview = within(drawer).getByText(
      (_, element) => element?.textContent === longHistory[0].sourceText,
    );
    const targetPreview = within(drawer).getByText(
      (_, element) => element?.textContent === longHistory[0].targetText,
    );
    expect(sourcePreview).not.toHaveClass("line-clamp-3");
    expect(targetPreview).not.toHaveClass("line-clamp-3");
    expect(sourcePreview).toHaveClass("whitespace-pre-wrap", "break-words");
    expect(targetPreview).toHaveClass("whitespace-pre-wrap", "break-words");
  });

  it("locks editing until an in-flight history restore finishes", async () => {
    const restore = deferred<void>();
    setup({ onRestoreHistory: () => restore.promise });
    const editor = screen.getByRole("textbox", { name: "目标文本" });

    fireEvent.click(
      within(openHistory()).getAllByRole("button", { name: "恢复此版本" })[0],
    );
    await waitFor(() => expect(editor).toBeDisabled());

    restore.resolve();
    await waitFor(() => expect(editor).toBeEnabled());
  });

  it("renders history newest first and sends the selected version to restore", async () => {
    const { onRestoreHistory } = setup();
    const history = within(openHistory()).getByTestId("translation-history");
    const versions = within(history).getAllByText(/版本 \d/);

    expect(versions.map((item) => item.textContent)).toEqual([
      "版本 3",
      "版本 1",
    ]);
    expect(within(history).getByText("Newest version")).toBeVisible();
    await act(async () => {
      fireEvent.click(
        within(history).getAllByRole("button", { name: "恢复此版本" })[0],
      );
      await Promise.resolve();
    });
    expect(onRestoreHistory).toHaveBeenCalledWith(HISTORY[1]);
  });

  it("shows history loading state", () => {
    setup({ history: [], historyLoading: true });
    expect(
      within(openHistory()).getByText("正在加载修改记录..."),
    ).toBeVisible();
  });

  it("shows history loading errors in the drawer", () => {
    setup({ history: [], historyError: "修改记录加载失败" });
    expect(within(openHistory()).getByRole("alert")).toHaveTextContent(
      "修改记录加载失败",
    );
  });

  it("disables history restoration while pending to prevent duplicate requests", async () => {
    const pendingRestore = deferred<void>();
    const { onRestoreHistory } = setup({
      onRestoreHistory: () => pendingRestore.promise,
    });
    const restoreButtons = within(openHistory()).getAllByRole("button", {
      name: "恢复此版本",
    });

    fireEvent.click(restoreButtons[0]);
    expect(restoreButtons[0]).toBeDisabled();
    expect(restoreButtons[1]).toBeDisabled();
    fireEvent.click(restoreButtons[0]);
    expect(onRestoreHistory).toHaveBeenCalledTimes(1);

    pendingRestore.resolve();
    await waitFor(() => expect(restoreButtons[0]).toBeEnabled());
  });

  it("shows an error when restoring a history version fails", async () => {
    setup({
      onRestoreHistory: async () => {
        throw new Error("restore failed");
      },
    });
    fireEvent.click(
      within(openHistory()).getAllByRole("button", { name: "恢复此版本" })[0],
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("恢复失败"),
    );
  });
});
