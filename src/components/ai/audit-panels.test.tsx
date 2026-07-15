import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AiAuditFindingRecord,
  AiAuditJobRecord,
  ProjectFilters,
  TmxDesktopApi,
} from "@/lib/desktop-types";
import { AuditReviewPanel, AuditSetupPanel } from "./audit-panels";

const filters: ProjectFilters = {
  query: "alarm",
  targetLanguage: "en-US",
  status: "all",
  duplicateOnly: false,
};

const job: AiAuditJobRecord = {
  id: "audit-1",
  projectId: "project-1",
  sessionId: null,
  filters,
  boundaries: { categories: ["accuracy"], minConfidence: 0.8, allowRewrite: true },
  model: "deepseek-v4-flash",
  status: "complete",
  totalItems: 20,
  completedItems: 20,
  findingItems: 1,
  failedItems: 0,
  createdAt: "2026-07-15T07:00:00.000Z",
  startedAt: "2026-07-15T07:00:00.000Z",
  finishedAt: "2026-07-15T07:05:00.000Z",
  updatedAt: "2026-07-15T07:05:00.000Z",
};

const finding: AiAuditFindingRecord = {
  id: "finding-1",
  jobId: job.id,
  itemId: "item-1",
  projectId: "project-1",
  rowId: "row-1",
  sourceLang: "zh-CN",
  sourceText: "启动设备",
  targetLang: "en-US",
  targetText: "Start device",
  category: "fluency",
  severity: "warning",
  summary: "缺少冠词",
  evidence: "表达不自然",
  suggestedTargetText: "Start the device",
  editedTargetText: null,
  confidence: 0.95,
  decision: "pending",
  contentHash: "hash",
  model: "deepseek-v4-flash",
  promptVersion: "audit-v1",
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
};

describe("AI audit panels", () => {
  it("confirms the frozen filter scope before starting", async () => {
    const startAiAudit = vi.fn().mockResolvedValue({ ...job, status: "running" });
    const api = {
      listAiAuditJobs: vi.fn().mockResolvedValue([]),
      startAiAudit,
      pauseAiAudit: vi.fn(),
      resumeAiAudit: vi.fn(),
      onAiAuditEvent: vi.fn().mockReturnValue(() => undefined),
    } as Pick<TmxDesktopApi,
      "listAiAuditJobs" | "startAiAudit" | "pauseAiAudit" | "resumeAiAudit" | "onAiAuditEvent"
    >;

    render(
      <AuditSetupPanel
        api={api}
        filters={filters}
        onReviewReady={() => undefined}
        projectId="project-1"
        resultCount={20}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "确认范围并开始审查" }));
    fireEvent.click(screen.getByRole("button", { name: "开始审查" }));

    await waitFor(() => expect(startAiAudit).toHaveBeenCalled());
    expect(startAiAudit.mock.calls[0][0]).toBe("project-1");
    expect(startAiAudit.mock.calls[0][1]).toEqual(filters);
  });

  it("stages decisions and applies them only after final confirmation", async () => {
    const decideAiAuditFinding = vi.fn().mockResolvedValue({
      ...finding,
      decision: "accepted",
    });
    const applyAiAudit = vi.fn().mockResolvedValue({ applied: 1, stale: 0 });
    const api = {
      listAiAuditJobs: vi.fn().mockResolvedValue([job]),
      listAiAuditFindings: vi.fn()
        .mockResolvedValueOnce([finding])
        .mockResolvedValueOnce([{ ...finding, decision: "accepted" }]),
      decideAiAuditFinding,
      acceptAllAiAuditFindings: vi.fn(),
      applyAiAudit,
    } as Pick<TmxDesktopApi,
      "listAiAuditJobs" | "listAiAuditFindings" | "decideAiAuditFinding" | "acceptAllAiAuditFindings" | "applyAiAudit"
    >;

    render(<AuditReviewPanel api={api} onApplied={() => undefined} projectId="project-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "接受建议" }));
    await waitFor(() => expect(decideAiAuditFinding).toHaveBeenCalledWith(
      "finding-1",
      "accepted",
    ));
    fireEvent.click(await screen.findByRole("button", { name: "确认应用 1 条" }));
    fireEvent.click(screen.getByRole("button", { name: "确认写入数据库" }));

    await waitFor(() => expect(applyAiAudit).toHaveBeenCalledWith("audit-1"));
  });
});
