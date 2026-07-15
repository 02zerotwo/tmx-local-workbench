import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportProgress } from "../../src/lib/desktop-types";
import { ProjectRepository } from "../database/project-repository";
import { createTestDatabase, type TestDatabase } from "../database/test-database";
import { UnitRepository } from "../database/unit-repository";
import { importTmxProject } from "./import-service";

const VALID_TMX = `<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <header srclang="zh-CN" />
  <body>
    <tu tuid="duplicate-1">
      <tuv xml:lang="zh-CN"><seg>{}报警 333{}</seg></tuv>
      <tuv xml:lang="en-US"><seg>Alarm 333</seg></tuv>
    </tu>
    <tu tuid="duplicate-2">
      <prop type="section">safety</prop>
      <tuv xml:lang="zh-CN"><seg>  报警 333  </seg></tuv>
      <tuv xml:lang="de-DE"><seg>Alarm 333 DE</seg></tuv>
    </tu>
    <tu tuid="empty">
      <tuv xml:lang="zh-CN"><seg>保存</seg></tuv>
      <tuv xml:lang="en-US"><seg></seg></tuv>
    </tu>
    <tu tuid="unique">
      <tuv xml:lang="zh-CN"><seg>关闭</seg></tuv>
      <tuv xml:lang="en-US"><seg>Close</seg></tuv>
    </tu>
    <tu tuid="style">
      <tuv xml:lang="zh-CN"><seg>&lt;font latin=&quot;x&quot; typeface=&quot;y&quot;&gt;</seg></tuv>
      <tuv xml:lang="en-US"><seg>style</seg></tuv>
    </tu>
  </body>
</tmx>`;

type Harness = {
  db: TestDatabase;
  directory: string;
  filePath: string;
  projects: ProjectRepository;
  units: UnitRepository;
};

let activeHarness: Harness | undefined;

function createHarness(contents = VALID_TMX): Harness {
  const directory = mkdtempSync(join(tmpdir(), "tmx-import-service-"));
  const filePath = join(directory, "service-manual.tmx");
  writeFileSync(filePath, contents, "utf8");
  const db = createTestDatabase();
  const projects = new ProjectRepository(db.db, {
    createId: () => "import-project",
    now: () => new Date("2026-07-14T01:00:00.000Z"),
  });
  const units = new UnitRepository(db.db, {
    now: () => new Date("2026-07-14T01:00:00.000Z"),
  });

  activeHarness = { db, directory, filePath, projects, units };
  return activeHarness;
}

afterEach(() => {
  activeHarness?.db.cleanup();
  if (activeHarness) {
    rmSync(activeHarness.directory, { force: true, recursive: true });
  }
  activeHarness = undefined;
});

describe("importTmxProject", () => {
  it("creates an importing project immediately, saves fixed batches, and completes metadata", async () => {
    const harness = createHarness();
    const progress: ImportProgress[] = [];
    const batchSizes: number[] = [];
    const originalInsert = harness.units.insertUnits.bind(harness.units);
    vi.spyOn(harness.units, "insertUnits").mockImplementation((projectId, rows) => {
      batchSizes.push(rows.length);
      originalInsert(projectId, rows);
    });

    const project = await importTmxProject({
      filePath: harness.filePath,
      operationId: "operation-success",
      projectRepository: harness.projects,
      unitRepository: harness.units,
      batchSize: 2,
      onProgress: (event) => {
        progress.push(event);
        if (event.stage === "reading") {
          expect(harness.projects.getProject(event.projectId)).toMatchObject({
            importStatus: "importing",
            totalUnits: 0,
          });
        }
      },
    });

    expect(batchSizes).toEqual([2, 2]);
    expect(project).toMatchObject({
      id: "import-project",
      name: "service-manual",
      fileName: basename(harness.filePath),
      fileSize: statSync(harness.filePath).size,
      sourceLanguage: "zh-CN",
      targetLanguages: ["de-DE", "en-US"],
      totalUnits: 4,
      changedUnits: 0,
      emptyUnits: 1,
      skippedUnits: 1,
      importStatus: "ready",
    });

    const rows = harness.db.db.prepare(`
      SELECT row_id, external_id, duplicate_key
      FROM translation_units
      ORDER BY ordinal
    `).all() as Array<{
      row_id: string;
      external_id: string;
      duplicate_key: string | null;
    }>;
    expect(rows.map(({ row_id }) => row_id)).toEqual([
      "import-project:1:1",
      "import-project:2:1",
      "import-project:3:1",
      "import-project:4:1",
    ]);
    expect(rows.filter(({ duplicate_key }) => duplicate_key !== null))
      .toHaveLength(2);
    expect(rows.find(({ external_id }) => external_id === "unique")?.duplicate_key)
      .toBeNull();

    expect(progress[0]).toMatchObject({
      operationId: "operation-success",
      projectId: "import-project",
      stage: "reading",
      processed: 0,
      total: statSync(harness.filePath).size,
    });
    expect(progress.some(({ stage }) => stage === "parsing")).toBe(true);
    expect(progress.filter(({ stage }) => stage === "saving").map(({ processed }) => processed))
      .toEqual([2, 4]);
    expect(progress.at(-1)).toMatchObject({
      stage: "complete",
      processed: 4,
      total: 4,
      percent: 100,
    });
    const finalParsing = progress.filter(({ stage }) => stage === "parsing").at(-1);
    expect(finalParsing).toMatchObject({
      processed: statSync(harness.filePath).size,
      total: statSync(harness.filePath).size,
      percent: 100,
    });
  });

  it("uses the default batch size of 2000 without retaining all imported rows", async () => {
    const units = Array.from({ length: 2_001 }, (_, index) => `
      <tu><tuv xml:lang="en"><seg>Source ${index}</seg></tuv><tuv xml:lang="zh"><seg>目标 ${index}</seg></tuv></tu>
    `).join("");
    const harness = createHarness(
      `<tmx><header srclang="en"/><body>${units}</body></tmx>`,
    );
    const batchSizes: number[] = [];
    const originalInsert = harness.units.insertUnits.bind(harness.units);
    vi.spyOn(harness.units, "insertUnits").mockImplementation((projectId, rows) => {
      batchSizes.push(rows.length);
      originalInsert(projectId, rows);
    });

    await importTmxProject({
      filePath: harness.filePath,
      operationId: "operation-default-batch",
      projectRepository: harness.projects,
      unitRepository: harness.units,
      onProgress: () => undefined,
    });

    expect(batchSizes).toEqual([2_000, 1]);
  });

  it("bounds parsing progress updates for large files while still reporting 100 percent", async () => {
    const padding = "x".repeat(7 * 1024 * 1024);
    const harness = createHarness(
      `<tmx><header srclang="en"/><body><!--${padding}--><tu><tuv xml:lang="en"><seg>Save</seg></tuv><tuv xml:lang="zh"><seg>保存</seg></tuv></tu></body></tmx>`,
    );
    const progress: ImportProgress[] = [];

    await importTmxProject({
      filePath: harness.filePath,
      operationId: "operation-progress-bound",
      projectRepository: harness.projects,
      unitRepository: harness.units,
      onProgress: (event) => progress.push(event),
    });

    const parsingProgress = progress.filter(({ stage }) => stage === "parsing");
    expect(parsingProgress.length).toBeLessThanOrEqual(101);
    expect(parsingProgress.at(-1)).toMatchObject({
      processed: statSync(harness.filePath).size,
      percent: 100,
    });
  });

  it("atomically clears units and FTS, resets counters, and marks failed on malformed XML", async () => {
    const harness = createHarness(`
      <tmx><header srclang="en"/><body>
        <tu><tuv xml:lang="en"><seg>Saved first</seg></tuv><tuv xml:lang="zh"><seg>先保存</seg></tuv></tu>
        <tu><tuv xml:lang="en"><seg>Broken</seg></tuv></body></tmx>
    `);
    const progress: ImportProgress[] = [];

    await expect(importTmxProject({
      filePath: harness.filePath,
      operationId: "operation-parse-failure",
      projectRepository: harness.projects,
      unitRepository: harness.units,
      batchSize: 1,
      onProgress: (event) => progress.push(event),
    })).rejects.toThrow(/导入失败.*TMX XML 格式有误/);

    expect(harness.projects.getProject("import-project")).toMatchObject({
      importStatus: "failed",
      totalUnits: 0,
      changedUnits: 0,
      emptyUnits: 0,
      skippedUnits: 0,
    });
    expect(harness.db.db.prepare(
      "SELECT COUNT(*) AS count FROM translation_units",
    ).get()).toEqual({ count: 0 });
    expect(harness.db.db.prepare(
      "SELECT COUNT(*) AS count FROM translation_search",
    ).get()).toEqual({ count: 0 });
    expect(progress.at(-1)).toMatchObject({
      operationId: "operation-parse-failure",
      projectId: "import-project",
      stage: "error",
    });
  });

  it("performs the same atomic cleanup when a batch write fails", async () => {
    const harness = createHarness();
    harness.db.db.exec(`
      CREATE TRIGGER abort_second_import_row
      BEFORE INSERT ON translation_units
      WHEN new.row_id = 'import-project:2:1'
      BEGIN
        SELECT RAISE(ABORT, 'simulated import write failure');
      END
    `);

    await expect(importTmxProject({
      filePath: harness.filePath,
      operationId: "operation-write-failure",
      projectRepository: harness.projects,
      unitRepository: harness.units,
      batchSize: 1,
      onProgress: () => undefined,
    })).rejects.toThrow(/^导入失败：simulated import write failure/);

    expect(harness.projects.getProject("import-project")).toMatchObject({
      importStatus: "failed",
      totalUnits: 0,
      emptyUnits: 0,
    });
    expect(harness.db.db.prepare(
      "SELECT COUNT(*) AS count FROM translation_units",
    ).get()).toEqual({ count: 0 });
    expect(harness.db.db.prepare(
      "SELECT COUNT(*) AS count FROM translation_search",
    ).get()).toEqual({ count: 0 });
  });

  it("does not allow editing a project after it is marked failed", () => {
    const harness = createHarness();
    harness.projects.createProject({
      id: "failed-project",
      name: "Failed",
      sourceFileName: "failed.tmx",
      sourceLanguage: "en",
      targetLanguages: ["zh"],
      fileSize: 10,
    });
    harness.units.insertUnits("failed-project", [{
      rowId: "failed-project:1:1",
      id: "1",
      position: 1,
      sourceLang: "en",
      sourceText: "Save",
      targetLang: "zh",
      targetText: "保存",
      originalTargetText: "保存",
    }]);
    harness.projects.setImportStatus("failed-project", "failed");

    expect(() => harness.units.updateTranslation(
      "failed-project",
      "failed-project:1:1",
      { sourceText: "Save", targetText: "另存" },
    )).toThrow(/failed|不可编辑/i);
  });
});
