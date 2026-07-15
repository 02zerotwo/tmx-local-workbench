import {
  PROJECT_PAGE_SIZES,
  type ProjectFilters,
  type ProjectPageSize,
} from "./desktop-types";

export const DEFAULT_PAGE_SIZE: ProjectPageSize = 200;

export const DEFAULT_PROJECT_FILTERS: Readonly<ProjectFilters> = {
  query: "",
  targetLanguage: "",
  status: "all",
  duplicateOnly: false,
};

export type WorkspaceState = {
  draftQuery: string;
  filters: ProjectFilters;
  page: number;
  pageSize: ProjectPageSize;
};

export type WorkspaceAction =
  | { type: "setDraftQuery"; query: string }
  | { type: "submitSearch" }
  | { type: "setTargetLanguage"; targetLanguage: string }
  | { type: "setStatus"; status: ProjectFilters["status"] }
  | { type: "setDuplicateOnly"; duplicateOnly: boolean }
  | { type: "clearFilters" }
  | { type: "setPageSize"; pageSize: number }
  | { type: "setPage"; page: number };

type WorkspaceStateOverrides = Partial<Omit<WorkspaceState, "filters">> & {
  filters?: Partial<ProjectFilters>;
};

function createProjectFilters(filters?: Partial<ProjectFilters>): ProjectFilters {
  return {
    ...DEFAULT_PROJECT_FILTERS,
    ...filters,
  };
}

function normalizePage(page: number): number {
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

function isProjectPageSize(pageSize: number): pageSize is ProjectPageSize {
  return PROJECT_PAGE_SIZES.some((allowedPageSize) => allowedPageSize === pageSize);
}

export function createWorkspaceState(overrides: WorkspaceStateOverrides = {}): WorkspaceState {
  const filters = createProjectFilters(overrides.filters);

  return {
    draftQuery: overrides.draftQuery ?? filters.query,
    filters,
    page: normalizePage(overrides.page ?? 1),
    pageSize: isProjectPageSize(overrides.pageSize ?? DEFAULT_PAGE_SIZE)
      ? (overrides.pageSize ?? DEFAULT_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
  };
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "setDraftQuery":
      return {
        ...state,
        draftQuery: action.query,
      };
    case "submitSearch":
      return {
        ...state,
        filters: {
          ...state.filters,
          query: state.draftQuery.trim(),
        },
        page: 1,
      };
    case "setTargetLanguage":
      return {
        ...state,
        filters: {
          ...state.filters,
          targetLanguage: action.targetLanguage,
        },
        page: 1,
      };
    case "setStatus":
      return {
        ...state,
        filters: {
          ...state.filters,
          status: action.status,
        },
        page: 1,
      };
    case "setDuplicateOnly":
      return {
        ...state,
        filters: {
          ...state.filters,
          duplicateOnly: action.duplicateOnly,
        },
        page: 1,
      };
    case "clearFilters":
      return {
        ...state,
        draftQuery: "",
        filters: createProjectFilters(),
        page: 1,
      };
    case "setPageSize":
      if (!isProjectPageSize(action.pageSize)) {
        return state;
      }

      return {
        ...state,
        pageSize: action.pageSize,
        page: 1,
      };
    case "setPage":
      return {
        ...state,
        page: normalizePage(action.page),
      };
  }
}
