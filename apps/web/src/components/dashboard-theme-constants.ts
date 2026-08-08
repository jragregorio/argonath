export const DASHBOARD_THEME_STORAGE_KEY = "warden-dashboard-theme";

export type DashboardTheme = "maiev" | "blackberry";

export const DASHBOARD_THEMES: DashboardTheme[] = ["maiev", "blackberry"];

/** Inline in dashboard layout — applies stored theme before first paint. */
export const dashboardThemeFoucScript = `(function(){try{var t=localStorage.getItem("${DASHBOARD_THEME_STORAGE_KEY}");if(t==="blackberry"){document.documentElement.setAttribute("data-dashboard-theme","blackberry")}}catch(e){}})();`;
