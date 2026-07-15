import { describe, expect, it } from "vitest";
import type { ExportProgress, ImportProgress } from "./desktop-types";
import {
  createWorkspaceState,
  workspaceReducer,
} from "./workspace-state";

describe("desktop progress contracts", () => {
  it("correlates import progress with an operation and project", () => {
    const progress: ImportProgress = {
      operationId: "import-1",
      projectId: "project-1",
      stage: "saving",
      processed: 100,
      total: 200,
      percent: 50,
      message: "Saving translations",
    };

    expect(progress).toMatchObject({
      operationId: "import-1",
      projectId: "project-1",
    });
  });

  it("correlates export progress with an operation and project", () => {
    const progress: ExportProgress = {
      operationId: "export-1",
      projectId: "project-1",
      stage: "writing",
      processed: 100,
      total: 200,
      percent: 50,
      message: "Writing workbook",
    };

    expect(progress).toMatchObject({
      operationId: "export-1",
      projectId: "project-1",
    });
  });
});

describe("workspaceReducer", () => {
  it("starts with empty filters on page 1 using 200 rows per page", () => {
    expect(createWorkspaceState()).toEqual({
      draftQuery: "",
      filters: {
        query: "",
        targetLanguage: "",
        status: "all",
        duplicateOnly: false,
      },
      page: 1,
      pageSize: 200,
    });
  });

  it("keeps typed search text as a draft until search is submitted", () => {
    const initial = createWorkspaceState({
      draftQuery: "old draft",
      filters: { query: "old result" },
      page: 4,
    });

    const changed = workspaceReducer(initial, {
      type: "setDraftQuery",
      query: "new result",
    });

    expect(changed.draftQuery).toBe("new result");
    expect(changed.filters.query).toBe("old result");
    expect(changed.page).toBe(4);
  });

  it("initializes the search draft from the committed query", () => {
    const state = createWorkspaceState({ filters: { query: "maintenance" } });

    expect(state.draftQuery).toBe("maintenance");
  });

  it("prefers an explicitly supplied search draft over the committed query", () => {
    const state = createWorkspaceState({
      draftQuery: "draft value",
      filters: { query: "committed value" },
    });

    expect(state.draftQuery).toBe("draft value");
  });

  it("commits a trimmed search and resets the page", () => {
    const initial = createWorkspaceState({
      draftQuery: "  maintenance  ",
      page: 4,
    });

    const changed = workspaceReducer(initial, { type: "submitSearch" });

    expect(changed.draftQuery).toBe("  maintenance  ");
    expect(changed.filters.query).toBe("maintenance");
    expect(changed.page).toBe(1);
  });

  it.each([
    [
      { type: "setTargetLanguage", targetLanguage: "zh-CN" } as const,
      { targetLanguage: "zh-CN" },
    ],
    [
      { type: "setStatus", status: "changed" } as const,
      { status: "changed" },
    ],
    [
      { type: "setDuplicateOnly", duplicateOnly: true } as const,
      { duplicateOnly: true },
    ],
  ])("applies %s and resets the page", (action, expectedFilter) => {
    const initial = createWorkspaceState({
      filters: { query: "save" },
      page: 3,
    });

    const changed = workspaceReducer(initial, action);

    expect(changed.filters).toMatchObject({ query: "save", ...expectedFilter });
    expect(changed.page).toBe(1);
  });

  it("clears draft and committed filters and resets the page", () => {
    const initial = createWorkspaceState({
      draftQuery: "save",
      filters: {
        query: "save",
        targetLanguage: "zh-CN",
        status: "empty",
        duplicateOnly: true,
      },
      page: 5,
      pageSize: 500,
    });

    const changed = workspaceReducer(initial, { type: "clearFilters" });

    expect(changed).toEqual({
      draftQuery: "",
      filters: {
        query: "",
        targetLanguage: "",
        status: "all",
        duplicateOnly: false,
      },
      page: 1,
      pageSize: 500,
    });
  });

  it.each([100, 200, 500] as const)(
    "accepts a page size of %i and resets the page",
    (pageSize) => {
      const initial = createWorkspaceState({ page: 8, pageSize: 200 });

      const changed = workspaceReducer(initial, {
        type: "setPageSize",
        pageSize,
      });

      expect(changed.pageSize).toBe(pageSize);
      expect(changed.page).toBe(1);
    },
  );

  it("preserves the current page size when an invalid runtime value is dispatched", () => {
    const initial = createWorkspaceState({ page: 8, pageSize: 500 });

    const changed = workspaceReducer(initial, {
      type: "setPageSize",
      pageSize: 999,
    });

    expect(changed.pageSize).toBe(500);
    expect(changed.page).toBe(8);
  });

  it("preserves filters and page size when changing page", () => {
    const initial = createWorkspaceState({
      draftQuery: "alarm",
      filters: {
        query: "alarm",
        targetLanguage: "en-US",
        status: "changed",
        duplicateOnly: true,
      },
      pageSize: 100,
    });

    const changed = workspaceReducer(initial, { type: "setPage", page: 7 });

    expect(changed).toEqual({ ...initial, page: 7 });
  });

  it("normalizes invalid page numbers to page 1", () => {
    const initial = createWorkspaceState({ page: 3 });

    expect(workspaceReducer(initial, { type: "setPage", page: 0 }).page).toBe(1);
    expect(workspaceReducer(initial, { type: "setPage", page: Number.NaN }).page).toBe(1);
  });
});
