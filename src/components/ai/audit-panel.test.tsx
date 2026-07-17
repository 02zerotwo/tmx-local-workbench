import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  AiAuditFindingRecord,
  AiAuditJobRecord,
} from "@/lib/desktop-types";
import { AuditPanel } from "./audit-panel";

type AuditApi = ComponentProps<typeof AuditPanel>["api"];

function job(overrides: Partial<AiAuditJobRecord> = {}): AiAuditJobRecord {
  return {
    id: "job-1",
    projectId: "project-1",
    sessionId: null,
    filters: { query: "", targetLanguage: "en-US", status: "all", duplicateOnly: false },
    boundaries: { customRules: "", minConfidence: 0.8, allowRewrite: true, concurrency: 8 },
    model: "deepseek-v4-flash",
    status: "complete",
    totalItems: 10,
    completedItems: 10,
    findingItems: 2,
    failedItems: 0,
    createdAt: "2026-07-16T00:00:00.000Z",
    startedAt: "2026-07-16T00:01:00.000Z",
    finishedAt: "2026-07-16T00:05:00.000Z",
    updatedAt: "2026-07-16T00:05:00.000Z",
    ...overrides,
  };
}

function finding(overrides: Partial<AiAuditFindingRecord> = {}): AiAuditFindingRecord {
  return {
    id: "f-1",
    jobId: "job-1",
    itemId: "i-1",
    projectId: "project-1",
    rowId: "row-1",
    sourceLang: "zh-CN",
    sourceText: "报警复位",
    targetLang: "en-US",
    targetText: "Reset alarm",
    category: "accuracy",
    severity: "warning",
    summary: "应更贴合原文",
    evidence: "缺少定冠词",
    suggestedTargetText: "Reset the alarm",
    editedTargetText: null,
    confidence: 0.9,
    decision: "pending",
    contentHash: "hash",
    model: "deepseek-v4-flash",
    promptVersion: "audit-v1",
    createdAt: "2026-07-16T00:04:00.000Z",
    updatedAt: "2026-07-16T00:04:00.000Z",
    ...overrides,
  };
}

function createApi(overrides: Partial<AuditApi> = {}): AuditApi {
  return {
    queryProject: vi.fn().mockResolvedValue({
      rows: [], total: 5, page: 1, pageSize: 100, pageCount: 1,
    }),
    listAiAuditJobs: vi.fn().mockResolvedValue([]),
    startAiAudit: vi.fn().mockResolvedValue(job({ status: "running", completedItems: 0 })),
    pauseAiAudit: vi.fn(),
    resumeAiAudit: vi.fn(),
    onAiAuditEvent: vi.fn().mockReturnValue(() => undefined),
    getAiAuditDefaults: vi.fn().mockResolvedValue({
      customRules: "", minConfidence: 0.8, allowRewrite: true, concurrency: 8,
    }),
    saveAiAuditDefaults: vi.fn().mockImplementation(async (defaults) => defaults),
    listAiAuditFindings: vi.fn().mockResolvedValue([finding()]),
    decideAiAuditFinding: vi.fn(),
    acceptAllAiAuditFindings: vi.fn().mockResolvedValue(1),
    applyAiAudit: vi.fn().mockResolvedValue({ applied: 1, stale: 0 }),
    ...overrides,
  } as AuditApi;
}

describe("AuditPanel", () => {
  it("creates a task with free-form rules and the chosen concurrency", async () => {
    const api = createApi();
    render(
      <AuditPanel
        api={api}
        onApplied={vi.fn()}
        projectId="project-1"
        targetLanguages={["en-US"]}
      />,
    );

    await screen.findByText(/还没有审查任务/);
    fireEvent.click(screen.getByRole("button", { name: "新建任务" }));

    expect(await screen.findByText("预计 5 条")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("审查规则"), {
      target: { value: "术语统一为 server" },
    });
    fireEvent.click(screen.getByRole("button", { name: /开始审查/ }));

    await waitFor(() => expect(api.saveAiAuditDefaults).toHaveBeenCalled());
    await waitFor(() => expect(api.startAiAudit).toHaveBeenCalled());
    const call = vi.mocked(api.startAiAudit).mock.calls[0];
    expect(call[0]).toBe("project-1");
    expect(call[2]).toMatchObject({
      customRules: "术语统一为 server",
      minConfidence: 0.8,
      allowRewrite: true,
      concurrency: 8,
    });
  });

  it("enters review, shows a highlighted diff, and applies accepted findings", async () => {
    const listFindings = vi.fn<() => Promise<AiAuditFindingRecord[]>>()
      .mockResolvedValueOnce([finding()])
      .mockResolvedValue([finding({ decision: "accepted" })]);
    const api = createApi({
      listAiAuditJobs: vi.fn().mockResolvedValue([job()]),
      listAiAuditFindings: listFindings,
    });
    const { container } = render(
      <AuditPanel
        api={api}
        onApplied={vi.fn()}
        projectId="project-1"
        targetLanguages={["en-US"]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /进入审阅/ }));
    expect(await screen.findByText("应更贴合原文")).toBeInTheDocument();
    // The inserted word is highlighted (monochrome, underlined) in the diff.
    await waitFor(() => {
      const insert = container.querySelector(".underline");
      expect(insert?.textContent).toContain("the");
    });

    fireEvent.click(screen.getByRole("button", { name: "接受建议" }));
    await waitFor(() =>
      expect(api.decideAiAuditFinding).toHaveBeenCalledWith("f-1", "accepted"),
    );

    fireEvent.click(await screen.findByRole("button", { name: /应用 1 条/ }));
    fireEvent.click(await screen.findByRole("button", { name: "确认写入" }));
    await waitFor(() => expect(api.applyAiAudit).toHaveBeenCalledWith("job-1"));
    expect(await screen.findByText("该审查任务已应用，当前为只读状态。"))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "接受建议" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "拒绝建议" })).toBeDisabled();
  });

  it("opens an applied audit job in read-only mode", async () => {
    const api = createApi({
      listAiAuditJobs: vi.fn().mockResolvedValue([job({ status: "applied" })]),
      listAiAuditFindings: vi.fn().mockResolvedValue([
        finding({ decision: "accepted" }),
      ]),
    });
    render(
      <AuditPanel
        api={api}
        onApplied={vi.fn()}
        projectId="project-1"
        targetLanguages={["en-US"]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /进入审阅/ }));

    expect(await screen.findByText("该审查任务已应用，当前为只读状态。"))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "全部接受" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "接受建议" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "拒绝建议" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /应用 1 条/ })).toBeDisabled();
  });
});
