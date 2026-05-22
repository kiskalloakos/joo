import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount } from './finance';

// A project (e.g. "Building a house") — just a name; its cost is the sum
// of its line items. Each line item carries its own currency, so a project
// total is computed by converting every item into the tab's currency.
export interface Project {
  id: string;
  name: string;
  position: number;
  // Finished projects are tucked under a "Previous projects" section.
  finished: boolean;
}

export interface ProjectCost {
  id: string;
  projectId: string;
  label: string;
  amount: string;          // user-typed string (comma-locale safe via parseAmount)
  currency: string;        // ISO code the amount is entered in
  date: string | null;     // optional 'YYYY-MM-DD'
  position: number;
}

export interface ProjectsData {
  projects: Project[];
  costs: ProjectCost[];
}

const NS = 'projects';
const EMPTY: ProjectsData = { projects: [], costs: [] };

export function peekProjects(): ProjectsData {
  return peek<ProjectsData>(NS, EMPTY);
}

export async function getProjects(): Promise<ProjectsData> {
  return load<ProjectsData>(NS, EMPTY);
}

async function persistCache(data: ProjectsData): Promise<void> {
  await save(NS, data);
}

export async function refreshProjects(): Promise<ProjectsData> {
  const uid = await userId();
  if (!uid) return getProjects();

  const [projectsRes, costsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, position, finished')
      .eq('user_id', uid)
      .order('position', { ascending: true }),
    supabase
      .from('project_costs')
      .select('id, project_id, label, amount, currency, cost_date, position')
      .eq('user_id', uid)
      .order('position', { ascending: true }),
  ]);

  if (projectsRes.error || costsRes.error) return getProjects();

  const data: ProjectsData = {
    projects: (projectsRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      finished: r.finished ?? false,
    })),
    costs: (costsRes.data ?? []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      label: r.label,
      amount: String(r.amount),
      currency: r.currency ?? '',
      date: r.cost_date ?? null,
      position: r.position,
    })),
  };
  await persistCache(data);
  return data;
}

export async function saveProject(project: Project): Promise<void> {
  const cache = await getProjects();
  const projects = cache.projects.find((p) => p.id === project.id)
    ? cache.projects.map((p) => (p.id === project.id ? project : p))
    : [...cache.projects, project];
  await persistCache({ ...cache, projects });

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('projects').upsert({
      id: project.id,
      user_id: uid,
      name: project.name,
      position: project.position,
      finished: project.finished,
    }),
  );
}

export async function deleteProject(id: string): Promise<void> {
  const cache = await getProjects();
  await persistCache({
    projects: cache.projects.filter((p) => p.id !== id),
    costs: cache.costs.filter((c) => c.projectId !== id),
  });

  const uid = await userId();
  if (!uid) return;
  // project_costs rows cascade-delete via the FK — only the project row
  // needs removing here.
  await reportable(supabase.from('projects').delete().eq('id', id).eq('user_id', uid));
}

export async function saveProjectCost(cost: ProjectCost): Promise<void> {
  const cache = await getProjects();
  const costs = cache.costs.find((c) => c.id === cost.id)
    ? cache.costs.map((c) => (c.id === cost.id ? cost : c))
    : [...cache.costs, cost];
  await persistCache({ ...cache, costs });

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('project_costs').upsert({
      id: cost.id,
      user_id: uid,
      project_id: cost.projectId,
      label: cost.label,
      amount: parseAmount(cost.amount),
      currency: cost.currency || null,
      cost_date: cost.date ?? null,
      position: cost.position,
    }),
  );
}

export async function deleteProjectCost(id: string): Promise<void> {
  const cache = await getProjects();
  await persistCache({ ...cache, costs: cache.costs.filter((c) => c.id !== id) });

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('project_costs').delete().eq('id', id).eq('user_id', uid),
  );
}
