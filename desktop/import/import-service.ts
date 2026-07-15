import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type {
  ImportProgress,
  ProjectDetail,
} from "../../src/lib/desktop-types";
import { normalizeDuplicateKey } from "../../src/lib/text-cleaning";
import type { ProjectRepository } from "../database/project-repository";
import {
  type InsertTranslationUnit,
  type UnitRepository,
} from "../database/unit-repository";
import { parseTmxStream } from "./tmx-stream-parser";

const DEFAULT_BATCH_SIZE = 2_000;

export type ImportTmxProjectInput = {
  filePath: string;
  operationId: string;
  projectRepository: ProjectRepository;
  unitRepository: UnitRepository;
  onProgress: (progress: ImportProgress) => void;
  batchSize?: number;
};

function percent(processed: number, total: number): number {
  if (total <= 0) {
    return processed > 0 ? 100 : 0;
  }

  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}

function validateBatchSize(value: number | undefined): number {
  const batchSize = value ?? DEFAULT_BATCH_SIZE;

  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error("导入批次大小必须是正整数");
  }

  return batchSize;
}

function projectNameFromPath(filePath: string): string {
  const fileName = basename(filePath);
  const extension = extname(fileName);
  return fileName.slice(0, extension ? -extension.length : undefined) || fileName;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function importTmxProject(
  input: ImportTmxProjectInput,
): Promise<ProjectDetail> {
  const batchSize = validateBatchSize(input.batchSize);
  const file = await stat(input.filePath);

  if (!file.isFile()) {
    throw new Error("导入失败：选择的路径不是文件");
  }

  const project = input.projectRepository.createProject({
    name: projectNameFromPath(input.filePath),
    sourceFileName: basename(input.filePath),
    sourceLanguage: "",
    targetLanguages: [],
    fileSize: file.size,
    importStatus: "importing",
  });
  const batch: InsertTranslationUnit[] = [];
  let savedRows = 0;
  let parsedRows = 0;
  let processedBytes = 0;
  let lastParsingPercent = -1;

  const report = (
    stage: ImportProgress["stage"],
    processed: number,
    total: number,
    message: string,
    reportedPercent = percent(processed, total),
  ) => {
    input.onProgress({
      operationId: input.operationId,
      projectId: project.id,
      stage,
      processed,
      total,
      percent: reportedPercent,
      message,
    });
  };

  const flushBatch = () => {
    if (batch.length === 0) {
      return;
    }

    input.unitRepository.insertUnits(project.id, batch);
    savedRows += batch.length;
    batch.length = 0;
    report("saving", savedRows, parsedRows, `已保存 ${savedRows} 条翻译`);
  };

  report("reading", 0, file.size, "正在读取 TMX 文件");

  try {
    const summary = await parseTmxStream(createReadStream(input.filePath), {
      onBytes: (bytes) => {
        processedBytes = bytes;
        const nextPercent = bytes >= file.size
          ? 100
          : Math.min(99, percent(bytes, file.size));
        if (nextPercent !== lastParsingPercent) {
          lastParsingPercent = nextPercent;
          report("parsing", bytes, file.size, "正在解析 TMX 内容", nextPercent);
        }
      },
      onPair: (pair) => {
        parsedRows += 1;
        batch.push({
          rowId: `${project.id}:${pair.unitOrdinal}:${pair.targetOrdinal}`,
          id: pair.id,
          position: pair.pairOrdinal,
          sourceLang: pair.sourceLang,
          sourceText: pair.sourceText,
          targetLang: pair.targetLang,
          targetText: pair.targetText,
          originalTargetText: pair.targetText,
          duplicateKey: normalizeDuplicateKey(pair.sourceText),
          metadata: pair.metadata,
        });

        if (batch.length >= batchSize) {
          flushBatch();
        }
      },
    });

    flushBatch();
    input.unitRepository.finalizeDuplicateKeys(project.id);
    const completed = input.projectRepository.completeImport(project.id, {
      sourceLanguage: summary.sourceLanguage,
      targetLanguages: summary.targetLanguages,
      skippedUnits: summary.skippedRows,
    });
    report("complete", savedRows, savedRows, `导入完成，共 ${savedRows} 条翻译`);
    return completed;
  } catch (error) {
    input.projectRepository.failImport(project.id);
    const message = `导入失败：${errorMessage(error)}`;
    report("error", processedBytes, file.size, message);
    throw new Error(message, { cause: error });
  }
}
