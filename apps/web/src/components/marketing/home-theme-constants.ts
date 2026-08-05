export const HOME_THEME_STORAGE_KEY = "warden-theme";

export type HomeTheme = "dark" | "light";

/** Inline on `/` only — applies light class before first paint when stored preference is light. */
export const homeThemeFoucScript = `(function(){try{var t=localStorage.getItem("${HOME_THEME_STORAGE_KEY}");if(t==="light"){document.documentElement.classList.add("home-theme-light")}}catch(e){}})();`;
