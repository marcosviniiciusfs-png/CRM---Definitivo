export const isDemoRoute = () => {
  if (typeof window === "undefined") return false;
  return import.meta.env.DEV && window.location.pathname.startsWith("/demo");
};

export const demoSectionAccess: Record<string, boolean> = {
  dashboard: true,
  pipeline: true,
  "lead-metrics": true,
  "lead-distribution": true,
  chat: true,
  ranking: true,
  reunioes: true,
  colaboradores: true,
  producao: true,
  equipes: true,
  atividades: true,
  tasks: true,
  integrations: true,
  settings: true,
};
