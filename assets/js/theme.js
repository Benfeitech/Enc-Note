const THEME_KEY = "encnote-theme";

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);

  if (saved === "dark" || saved === "light") {
    return saved;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  const isDark = theme === "dark";

  root.classList.toggle("dark", isDark);
  root.setAttribute("data-theme", theme);

  document.querySelectorAll("[data-theme-icon]").forEach((icon) => {
    icon.className = isDark
      ? "fa-solid fa-sun"
      : "fa-solid fa-moon";
  });

  document.querySelectorAll("[data-theme-label]").forEach((label) => {
    label.textContent = isDark ? "Light mode" : "Dark mode";
  });

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    button.setAttribute("aria-pressed", String(isDark));
  });
}

function initTheme() {
  applyTheme(getPreferredTheme());
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";

  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", toggleTheme);
  });
});