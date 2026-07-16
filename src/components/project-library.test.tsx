import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ProjectDetail,
  ProjectSummary,
  TmxDesktopApi,
} from "@/lib/desktop-types";
import { ProjectLibrary } from "./project-library";

const PROJECT: ProjectDetail = {
  id: "project-1",
  name: "Service Manual",
  fileName: "service-manual.tmx",
  sourceLanguage: "zh-CN",
  targetLanguages: ["en-US", "de-DE"],
  totalUnits: 1_245,
  changedUnits: 18,
  emptyUnits: 7,
  skippedUnits: 12,
  importStatus: "ready",
  fileSize: 4096,
  importedAt: "2026-07-14T02:00:00.000Z",
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "2026-07-14T03:00:00.000Z",
};

function createApi(projects: ProjectSummary[] = []): TmxDesktopApi {
  return {
    listProjects: vi.fn(async () => projects),
    getProject: vi.fn(async () => null),
    importProject: vi.fn(async () => PROJECT),
    renameProject: vi.fn(async (_projectId, name) => ({ ...PROJECT, name })),
    deleteProject: vi.fn(async () => undefined),
    queryProject: vi.fn(),
    updateTranslation: vi.fn(),
    getTranslationHistory: vi.fn(async () => []),
    copyText: vi.fn(async () => undefined),
    exportProject: vi.fn(async () => null),
    openExportDirectory: vi.fn(async () => undefined),
    backupDatabase: vi.fn(async () => null),
    restoreDatabase: vi.fn(async () => false),
    openDataDirectory: vi.fn(async () => undefined),
    confirmAppClose: vi.fn(async () => undefined),
    onImportProgress: vi.fn(() => () => undefined),
    onExportProgress: vi.fn(() => () => undefined),
    onAppCloseRequested: vi.fn(() => () => undefined),
  };
}

describe("ProjectLibrary", () => {
  it("shows a desktop-only message when the preload bridge is unavailable", () => {
    render(<ProjectLibrary api={null} onOpenProject={vi.fn()} />);
    expect(screen.getByText(/请使用桌面版打开/)).toBeInTheDocument();
  });

  it("loads existing projects and opens one from the table", async () => {
    const api = createApi([PROJECT]);
    const onOpenProject = vi.fn();
    render(<ProjectLibrary api={api} onOpenProject={onOpenProject} />);

    expect(await screen.findByText("Service Manual")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "项目" })).toBeInTheDocument();
    expect(screen.getAllByText("1,245")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /导入 TMX/ }))
      .toHaveAttribute("data-variant", "ghost");
    expect(screen.getByRole("button", { name: "删除 Service Manual" }))
      .toHaveAttribute("data-variant", "destructive");
    fireEvent.click(screen.getByRole("button", { name: "打开 Service Manual" }));
    expect(onOpenProject).toHaveBeenCalledWith(PROJECT);
  });

  it("imports a file and automatically opens the completed project", async () => {
    const api = createApi();
    const onOpenProject = vi.fn();
    render(<ProjectLibrary api={api} onOpenProject={onOpenProject} />);

    fireEvent.click(await screen.findByRole("button", { name: /导入 TMX/ }));

    await waitFor(() => expect(api.importProject).toHaveBeenCalledTimes(1));
    expect(onOpenProject).toHaveBeenCalledWith(PROJECT);
  });

  it("renames a project from its row action", async () => {
    const api = createApi([PROJECT]);
    render(<ProjectLibrary api={api} onOpenProject={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", {
      name: "重命名 Service Manual",
    }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "Alarm Manual" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => expect(api.renameProject).toHaveBeenCalledWith(
      "project-1",
      "Alarm Manual",
    ));
    expect(await screen.findByText("Alarm Manual")).toBeInTheDocument();
  });

  it("deletes a project only after confirmation", async () => {
    const api = createApi([PROJECT]);
    render(<ProjectLibrary api={api} onOpenProject={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", {
      name: "删除 Service Manual",
    }));
    expect(screen.getByText(/此操作会删除项目及全部翻译数据/)).toBeInTheDocument();
    expect(api.deleteProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除项目" }));
    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith("project-1"));
    expect(screen.queryByText("Service Manual")).not.toBeInTheDocument();
  });
});
