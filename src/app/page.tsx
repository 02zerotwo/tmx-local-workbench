"use client";

import { useState } from "react";
import { ProjectLibrary } from "@/components/project-library";
import { ProjectWorkspace } from "@/components/project-workspace";
import { getDesktopApi } from "@/lib/desktop-api";
import type { ProjectSummary } from "@/lib/desktop-types";

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [api] = useState(() => getDesktopApi());

  if (!selectedProject) {
    return <ProjectLibrary api={api} onOpenProject={setSelectedProject} />;
  }

  return api ? (
    <ProjectWorkspace
      api={api}
      onBack={() => setSelectedProject(null)}
      project={selectedProject}
    />
  ) : null;
}
