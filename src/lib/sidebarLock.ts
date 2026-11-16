export const SIDEBAR_LOCK_KEY = "sidebar-locked";

/** Menu aberto por padrão; recolhe só por escolha do usuário (DESIGN.md). */
export const readSidebarLocked = () => {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SIDEBAR_LOCK_KEY) !== "false";
};
