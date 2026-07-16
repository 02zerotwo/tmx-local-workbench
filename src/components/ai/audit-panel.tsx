"use client";

import { useState } from "react";
import { AuditReviewDetail } from "@/components/ai/audit-review-detail";
import { AuditTaskList } from "@/components/ai/audit-task-list";
import type { AiAuditJobRecord, TmxDesktopApi } from "@/lib/desktop-types";

type AuditApi = Pick<
  TmxDesktopApi,
  | "queryProject"
  | "listAiAuditJobs"
  | "startAiAudit"
  | "pauseAiAudit"
  | "resumeAiAudit"
  | "onAiAuditEvent"
  | "getAiAuditDefaults"
  | "saveAiAuditDefaults"
  | "listAiAuditFindings"
  | "decideAiAuditFinding"
  | "acceptAllAiAuditFindings"
  | "applyAiAudit"
>;

type AuditPanelProps = {
  api: AuditApi;
  projectId: string;
  targetLanguages: string[];
  onApplied: () => void;
};

/** 审查区：任务列表 ↔ 单任务审阅详情 的切换容器。 */
export function AuditPanel({
  api,
  projectId,
  targetLanguages,
  onApplied,
}: AuditPanelProps) {
  const [reviewJob, setReviewJob] = useState<AiAuditJobRecord | null>(null);

  if (reviewJob) {
    return (
      <AuditReviewDetail
        api={api}
        job={reviewJob}
        onApplied={onApplied}
        onBack={() => setReviewJob(null)}
      />
    );
  }

  return (
    <AuditTaskList
      api={api}
      onOpenJob={setReviewJob}
      projectId={projectId}
      targetLanguages={targetLanguages}
    />
  );
}
