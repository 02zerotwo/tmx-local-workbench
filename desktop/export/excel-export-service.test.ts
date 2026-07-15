// @vitest-environment node

import * as XLSX from "xlsx";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportProgress, ProjectFilters } from "../../src/lib/desktop-types";
import { ProjectRepository } from "../database/project-repository";
import { createTestDatabase, type TestDatabase } from "../database/test-database";
import { UnitRepository } from "../database/unit-repository";
import { exportProjectToExcel } from "./excel-export-service";

const EMPTY_FILTERS: ProjectFilters = {
  query: "",
  targetLanguage: "",
  status: "all",
  duplicateOnly: false,
};

const HEADINGS = [
  "ID",
  "源语言",
  "源文本",
  "目标语言",
  "目标文本",
  "原始目标文本",
  "是否修改",
  "元数据",
];

let testDatabase: TestDatabase;
let outputDirectory: string;
let projectId: string;
let unitRepository: UnitRepository;

beforeEach(() => {
  testDatabase = createTestDatabase();
  outputDirectory = mkdtempSync(join(tmpdir(), "tmx-export-test-"));
  const projectRepository = new ProjectRepository(testDatabase.db, {
    createId: () => "project-export",
  });
  projectId = projectRepository.createProject({
    name: "Service Manual",
    sourceFileName: "service-manual.tmx",
    sourceLanguage: "zh-CN",
    targetLanguages: ["en-US"],
    fileSize: 1024,
    importStatus: "ready",
  }).id;
  unitRepository = new UnitRepository(testDatabase.db);
  unitRepository.insertUnits(projectId, [
    {
      rowId: "row-original",
      id: "original-1",
      position: 1,
      sourceLang: "zh-CN",
      sourceText: "启动设备",
      targetLang: "en-US",
      targetText: "Start the machine",
      originalTargetText: "Start the machine",
      metadata: { section: "start", owner: "QA" },
    },
    {
      rowId: "row-changed",
      id: "changed-2",
      position: 2,
      sourceLang: "zh-CN",
      sourceText: "复位报警",
      targetLang: "en-US",
      targetText: "Reset the alarm now",
      originalTargetText: "Reset alarm",
      metadata: {},
    },
  ]);
});

afterEach(() => {
  testDatabase.cleanup();
  rmSync(outputDirectory, { recursive: true, force: true });
});

function readSheet(path: string): unknown[][] {
  const workbook = XLSX.readFile(path);
  const worksheet = workbook.Sheets.TMX;
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
}

describe("exportProjectToExcel", () => {
  it("exports all rows with the existing headings and metadata format", async () => {
    const outputPath = join(outputDirectory, "all.xlsx");

    await exportProjectToExcel({
      projectId,
      outputPath,
      operationId: "export-all",
      unitRepository,
    });

    expect(readSheet(outputPath)).toEqual([
      HEADINGS,
      [
        "original-1", "zh-CN", "启动设备", "en-US", "Start the machine",
        "Start the machine", "否", "section=start; owner=QA",
      ],
      [
        "changed-2", "zh-CN", "复位报警", "en-US", "Reset the alarm now",
        "Reset alarm", "是", "",
      ],
    ]);
  });

  it("applies filters and reports querying, writing, and completion progress", async () => {
    const outputPath = join(outputDirectory, "changed.xlsx");
    const progress: ExportProgress[] = [];
    const onProgress = vi.fn((event: ExportProgress) => progress.push(event));

    await exportProjectToExcel({
      projectId,
      filters: { ...EMPTY_FILTERS, status: "changed" },
      outputPath,
      operationId: "export-filtered",
      unitRepository,
      onProgress,
    });

    expect(readSheet(outputPath)).toEqual([
      HEADINGS,
      [
        "changed-2", "zh-CN", "复位报警", "en-US", "Reset the alarm now",
        "Reset alarm", "是", "",
      ],
    ]);
    expect(progress.map(({ stage }) => stage)).toEqual([
      "querying",
      "querying",
      "writing",
      "complete",
    ]);
    expect(progress.at(-1)).toMatchObject({
      operationId: "export-filtered",
      projectId,
      processed: 1,
      total: 1,
      percent: 100,
    });
  });

  it("reports an error progress event when database reading fails", async () => {
    const onProgress = vi.fn();
    const failingRepository = {
      queryProject: vi.fn(() => {
        throw new Error("read failed");
      }),
    } as unknown as UnitRepository;

    await expect(exportProjectToExcel({
      projectId,
      outputPath: join(outputDirectory, "failed.xlsx"),
      operationId: "export-failed",
      unitRepository: failingRepository,
      onProgress,
    })).rejects.toThrow("read failed");

    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      operationId: "export-failed",
      projectId,
      stage: "error",
      percent: 0,
      message: "read failed",
    }));
  });
});
