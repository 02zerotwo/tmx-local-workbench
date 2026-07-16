import { createHash } from "node:crypto";
import type {
  AuditBoundaries,
  AuditFinding,
  AuditJob,
  AuditQueueItem,
  AiAuditRepository,
  NewAuditFinding,
} from "../database/ai-audit-repository";
import type { UnitRepository } from "../database/unit-repository";
import type { DeepSeekModelId, ProjectFilters } from "../../src/lib/desktop-types";

export type AuditAnalysis = Omit<
  NewAuditFinding,
  "contentHash" | "model" | "promptVersion"
>;

export type AnalyzeAuditItem = (input: {
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  targetText: string;
  boundaries: AuditBoundaries;
  model: DeepSeekModelId;
}) => Promise<AuditAnalysis[]>;

export type AuditWorkflowEvent =
  | { type: "status"; job: AuditJob }
  | { type: "progress"; job: AuditJob }
  | { type: "finding"; jobId: string; rowId: string; count: number };

type AuditWorkflowOptions = {
  repository: AiAuditRepository;
  unitRepository: UnitRepository;
  analyzeItem: AnalyzeAuditItem;
  transaction: <T>(operation: () => T) => T;
};

const PROMPT_VERSION = "audit-v1";

export function translationContentHash(input: {
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  targetText: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      sourceLang: input.sourceLang,
      sourceText: input.sourceText,
      targetLang: input.targetLang,
      targetText: input.targetText,
    }))
    .digest("hex");
}

export class AuditWorkflowService {
  private readonly running = new Set<string>();
  private readonly paused = new Set<string>();

  constructor(private readonly options: AuditWorkflowOptions) {}

  createJob(input: {
    projectId: string;
    filters: ProjectFilters;
    boundaries: AuditBoundaries;
    model: DeepSeekModelId;
  }): AuditJob {
    const rows = [];
    let page = 1;
    let pageCount = 1;
    do {
      const result = this.options.unitRepository.queryProject({
        projectId: input.projectId,
        filters: input.filters,
        page,
        pageSize: 500,
      });
      rows.push(...result.rows.map((row) => ({
        rowId: row.rowId,
        contentHash: translationContentHash(row),
      })));
      pageCount = result.pageCount;
      page += 1;
    } while (page <= pageCount);

    if (rows.length === 0) {
      throw new Error("当前筛选范围没有可审查的翻译条目");
    }
    return this.options.repository.createJob({ ...input, rows });
  }

  listJobs(projectId: string): AuditJob[] {
    return this.options.repository.listJobs(projectId);
  }

  getJob(jobId: string): AuditJob | null {
    return this.options.repository.getJob(jobId);
  }

  listFindings(jobId: string): AuditFinding[] {
    return this.options.repository.listFindings(jobId);
  }

  setFindingDecision(
    findingId: string,
    decision: AuditFinding["decision"],
    editedTargetText?: string | null,
  ): AuditFinding {
    return this.options.repository.setFindingDecision(
      findingId,
      decision,
      editedTargetText,
    );
  }

  acceptAllPendingFindings(jobId: string): number {
    return this.options.repository.acceptAllPendingFindings(jobId);
  }

  async runJob(
    jobId: string,
    onEvent: (event: AuditWorkflowEvent) => void,
  ): Promise<AuditJob> {
    if (this.running.has(jobId)) {
      const existing = this.options.repository.getJob(jobId);
      if (!existing) throw new Error("审查任务不存在");
      return existing;
    }
    const initial = this.options.repository.getJob(jobId);
    if (!initial) throw new Error("审查任务不存在");
    if (initial.status === "complete" || initial.status === "applied") return initial;

    this.paused.delete(jobId);
    this.running.add(jobId);
    onEvent({ type: "status", job: this.options.repository.setJobStatus(jobId, "running") });
    try {
      const { boundaries } = initial;

      const processItem = async (item: AuditQueueItem) => {
        try {
          const analyses = await this.options.analyzeItem({
            sourceLang: item.sourceLang,
            sourceText: item.sourceText,
            targetLang: item.targetLang,
            targetText: item.targetText,
            boundaries,
            model: initial.model as DeepSeekModelId,
          });
          const findings = analyses
            .filter((analysis) => analysis.confidence >= boundaries.minConfidence)
            .map((analysis) => ({
              ...analysis,
              suggestedTargetText: boundaries.allowRewrite
                ? analysis.suggestedTargetText
                : null,
              contentHash: item.contentHash,
              model: initial.model,
              promptVersion: PROMPT_VERSION,
            }));
          this.options.repository.recordItemResult(jobId, item.id, findings);
          if (findings.length > 0) {
            onEvent({
              type: "finding",
              jobId,
              rowId: item.rowId,
              count: findings.length,
            });
          }
        } catch (error) {
          this.options.repository.recordItemFailure(
            jobId,
            item.id,
            error instanceof Error ? error.message : "AI 审查失败",
          );
        }
        onEvent({ type: "progress", job: this.options.repository.getJob(jobId)! });
      };

      // 并发消费：启动 concurrency 个 worker，每个原子领取一条处理，直到无待处理项或被暂停。
      const worker = async (): Promise<void> => {
        while (!this.paused.has(jobId)) {
          const [item] = this.options.repository.claimNextPendingItems(jobId, 1);
          if (!item) return;
          await processItem(item);
        }
      };
      await Promise.all(
        Array.from({ length: Math.max(1, boundaries.concurrency) }, () => worker()),
      );

      if (this.paused.has(jobId)) {
        const paused = this.options.repository.setJobStatus(jobId, "paused");
        onEvent({ type: "status", job: paused });
        return paused;
      }
      const current = this.options.repository.getJob(jobId)!;
      const status = current.failedItems > 0 ? "partial_failure" : "complete";
      const finished = this.options.repository.setJobStatus(jobId, status);
      onEvent({ type: "status", job: finished });
      return finished;
    } finally {
      this.running.delete(jobId);
    }
  }

  pauseJob(jobId: string): AuditJob {
    this.paused.add(jobId);
    return this.options.repository.setJobStatus(jobId, "paused");
  }

  resumeJob(
    jobId: string,
    onEvent: (event: AuditWorkflowEvent) => void,
  ): Promise<AuditJob> {
    this.paused.delete(jobId);
    if (this.running.has(jobId)) {
      const running = this.options.repository.setJobStatus(jobId, "running");
      onEvent({ type: "status", job: running });
      return Promise.resolve(running);
    }
    return this.runJob(jobId, onEvent);
  }

  applyConfirmed(jobId: string): { applied: number; stale: number } {
    const accepted = this.options.repository.getAcceptedFindings(jobId);
    const selectedByRow = new Map<string, AuditFinding>();
    for (const finding of accepted) {
      if (finding.suggestedTargetText === null && finding.editedTargetText === null) continue;
      const existing = selectedByRow.get(finding.rowId);
      if (
        !existing
        || finding.decision === "edited"
        || finding.confidence > existing.confidence
      ) {
        selectedByRow.set(finding.rowId, finding);
      }
    }

    let applied = 0;
    let stale = 0;
    this.options.transaction(() => {
      for (const finding of selectedByRow.values()) {
        const currentHash = translationContentHash(finding);
        if (currentHash !== finding.contentHash) {
          this.options.repository.setFindingDecision(finding.id, "stale");
          stale += 1;
          continue;
        }
        this.options.unitRepository.updateTranslation(
          finding.projectId,
          finding.rowId,
          {
            sourceText: finding.sourceText,
            targetText: finding.editedTargetText ?? finding.suggestedTargetText!,
          },
        );
        applied += 1;
      }
      this.options.repository.setJobStatus(jobId, "applied");
    });
    return { applied, stale };
  }
}
