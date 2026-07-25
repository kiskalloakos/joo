let addProject: (() => void) | null = null;

export function registerProjectsHeaderAction(action: () => void): () => void {
  addProject = action;
  return () => {
    if (addProject === action) addProject = null;
  };
}

export function triggerProjectsHeaderAction(): void {
  addProject?.();
}
