import * as XLSX from "xlsx";
import type {
  ExportProgress,
  ProjectFilters,
  TranslationUnitRow,
} from "../../src/lib/desktop-types";
import type { UnitRepository } from "../database/unit-repository";

export const EXCEL_EXPORT_HEADINGS = [
  "ID",
  "源语言",
  "源文本",
  "目标语言",
  "目标文本",
  "原始目标文本",
  "是否修改",
  "元数据",
] as const;

const EXPORT_PAGE_SIZE = 500;

const EMPTY_FILTERS: ProjectFilters = {
  query: "",
  targetLanguage: "",
  status: "all",
  duplicateOnly: false,
};

export type ExcelExportInput = {
  projectId: string;
  filters?: ProjectFilters;
  outputPath: string;
  operationId: string;
  unitRepository: UnitRepository;
  onProgress?: (progress: ExportProgress) => void;
};

function formatMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function exportRow(row: TranslationUnitRow): string[] {
  return [
    row.id,
    row.sourceLang,
    row.sourceText,
    row.targetLang,
    row.targetText,
    row.originalTargetText,
    row.changed ? "是" : "否",
    formatMetadata(row.metadata),
  ];
}

export async function exportProjectToExcel({
  projectId,
  filters = EMPTY_FILTERS,
  outputPath,
  operationId,
  unitRepository,
  onProgress = () => undefined,
}: ExcelExportInput): Promise<string> {
  const progress = (
    stage: ExportProgress["stage"],
    processed: number,
    total: number,
    percent: number,
    message: string,
  ) => onProgress({
    operationId,
    projectId,
    stage,
    processed,
    total,
    percent,
    message,
  });

  let processed = 0;
  let total = 0;

  try {
    progress("querying", 0, 0, 0, "正在读取翻译数据");
    const firstPage = unitRepository.queryProject({
      projectId,
      filters,
      page: 1,
      pageSize: EXPORT_PAGE_SIZE,
    });
    total = firstPage.total;
    const worksheet = XLSX.utils.aoa_to_sheet([Array.from(EXCEL_EXPORT_HEADINGS)]);

    for (let page = 1; page <= firstPage.pageCount; page += 1) {
      const result = page === 1
        ? firstPage
        : unitRepository.queryProject({
          projectId,
          filters,
          page,
          pageSize: EXPORT_PAGE_SIZE,
        });

      if (result.rows.length > 0) {
        XLSX.utils.sheet_add_aoa(worksheet, result.rows.map(exportRow), { origin: -1 });
      }
      processed += result.rows.length;
      progress(
        "querying",
        processed,
        total,
        total === 0 ? 90 : Math.round((processed / total) * 90),
        `正在读取翻译数据 ${processed.toLocaleString()} / ${total.toLocaleString()}`,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    worksheet["!cols"] = [
      { wch: 22 },
      { wch: 12 },
      { wch: 50 },
      { wch: 12 },
      { wch: 50 },
      { wch: 50 },
      { wch: 10 },
      { wch: 30 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "TMX");

    progress("writing", processed, total, 95, "正在写入 Excel 文件");
    XLSX.writeFile(workbook, outputPath, { compression: true });
    progress("complete", processed, total, 100, "Excel 导出完成");

    return outputPath;
  } catch (error) {
    progress(
      "error",
      processed,
      total,
      total === 0 ? 0 : Math.min(99, Math.round((processed / total) * 90)),
      error instanceof Error ? error.message : "Excel 导出失败",
    );
    throw error;
  }
}
