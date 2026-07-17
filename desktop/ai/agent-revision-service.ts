import type {
  AgentRevision,
  AgentRevisionRepository,
} from "../database/ai-agent-revision-repository";
import type { UnitRepository } from "../database/unit-repository";
import { translationContentHash } from "./audit-workflow";

export type ApplyRevisionsResult = {
  applied: number;
  stale: number;
  missing: number;
};

type AgentRevisionServiceOptions = {
  repository: AgentRevisionRepository;
  unitRepository: UnitRepository;
  transaction: <T>(operation: () => T) => T;
  now?: () => Date;
};

/**
 * 应用 Agent 暂存的修改建议。所有写库都在用户显式确认后才发生，并复用
 * 与批量审查相同的内容哈希防陈旧校验：源文/译文自建议生成后被改动过的条目
 * 会被标记为 stale 而不会被覆盖。
 */
export class AgentRevisionService {
  private readonly now: () => Date;

  constructor(private readonly options: AgentRevisionServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  listRevisions(sessionId: string): AgentRevision[] {
    return this.options.repository.listRevisions(sessionId);
  }

  updateRevision(
    revisionId: string,
    suggestedTargetText: string,
  ): AgentRevision {
    if (!suggestedTargetText.trim()) {
      throw new Error("建议译文不能为空");
    }
    const revision = this.options.repository.getRevision(revisionId);
    if (!revision) {
      throw new Error(`修改建议不存在: ${revisionId}`);
    }
    if (revision.status !== "pending") {
      throw new Error("仅待审阅建议可以编辑");
    }
    return this.options.repository.updateSuggestedTargetText(
      revisionId,
      suggestedTargetText,
    );
  }

  ignoreRevision(revisionId: string): AgentRevision {
    return this.options.repository.setStatus(revisionId, "ignored");
  }

  applyRevisions(revisionIds: string[]): ApplyRevisionsResult {
    const revisions = this.options.repository.getRevisionsByIds(revisionIds);
    const missing = revisionIds.length - revisions.length;
    let applied = 0;
    let stale = 0;

    this.options.transaction(() => {
      for (const revision of revisions) {
        if (revision.status !== "pending") {
          continue;
        }
        const current = this.options.unitRepository.getUnitRow(
          revision.projectId,
          revision.rowId,
        );
        if (!current) {
          this.options.repository.setStatus(revision.id, "stale");
          stale += 1;
          continue;
        }
        const currentHash = translationContentHash({
          sourceLang: current.sourceLang,
          sourceText: current.sourceText,
          targetLang: current.targetLang,
          targetText: current.targetText,
        });
        if (currentHash !== revision.contentHash) {
          this.options.repository.setStatus(revision.id, "stale");
          stale += 1;
          continue;
        }
        this.options.unitRepository.updateTranslation(
          revision.projectId,
          revision.rowId,
          {
            sourceText: current.sourceText,
            targetText: revision.suggestedTargetText,
          },
        );
        this.options.repository.setStatus(
          revision.id,
          "applied",
          this.now().toISOString(),
        );
        applied += 1;
      }
    });

    return { applied, stale, missing };
  }
}
