const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const themeText = document.getElementById("themeText");

const form = document.getElementById("createNoteForm");
const messageEl = document.getElementById("message");
const expiresInEl = document.getElementById("expiresIn");
const passwordOptionEl = document.getElementById("passwordOption");
const passwordWrapEl = document.getElementById("passwordFieldWrap");
const passwordEl = document.getElementById("password");
const passwordToggleBtn = document.getElementById("passwordToggleBtn");
const passwordToggleIcon = document.getElementById("passwordToggleIcon");
const charCountEl = document.getElementById("charCount");
const submitBtn = document.getElementById("submitBtn");
const resetBtn = document.getElementById("resetBtn");
const resultEmpty = document.getElementById("resultEmpty");
const resultSuccess = document.getElementById("resultSuccess");
const generatedLinkEl = document.getElementById("generatedLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const openLinkBtn = document.getElementById("openLinkBtn");

const THEME_KEY = "encnote-theme";
let currentGeneratedLink = "";

const toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 2800,
  timerProgressBar: true,
  background: "var(--surface-strong)",
  color: "var(--text)"
});

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  themeIcon.className = isDark
    ? "fa-solid fa-sun theme-toggle-icon"
    : "fa-solid fa-moon theme-toggle-icon";
  themeText.textContent = isDark ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-pressed", String(isDark));
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "dark" || savedTheme === "light") {
    applyTheme(savedTheme);
    return;
  }

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function updateCount() {
  charCountEl.textContent = `${messageEl.value.length} / 5000`;
}

function togglePasswordField() {
  const enabled = passwordOptionEl.checked;
  passwordWrapEl.classList.toggle("hidden", !enabled);

  if (!enabled) {
    passwordEl.value = "";
    passwordEl.type = "password";
    passwordToggleIcon.className = "fa-regular fa-eye";
    passwordToggleBtn.setAttribute("aria-label", "Show password");
  }
}

function togglePasswordVisibility() {
  const isHidden = passwordEl.type === "password";
  passwordEl.type = isHidden ? "text" : "password";
  passwordToggleIcon.className = isHidden ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
  passwordToggleBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
}

function showResult(link) {
  currentGeneratedLink = link;
  generatedLinkEl.textContent = link;
  resultEmpty.classList.add("hidden");
  resultSuccess.classList.remove("hidden");
}

function resetResult() {
  currentGeneratedLink = "";
  generatedLinkEl.textContent = "";
  resultEmpty.classList.remove("hidden");
  resultSuccess.classList.add("hidden");
}

function getExpiryMinutes(value) {
  const map = {
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "6h": 360,
    "24h": 1440
  };
  return map[value] ?? 60;
}

themeToggle.addEventListener("click", () => {
  const currentTheme = root.getAttribute("data-theme") || "light";
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
});

passwordOptionEl.addEventListener("change", togglePasswordField);
passwordToggleBtn.addEventListener("click", togglePasswordVisibility);
messageEl.addEventListener("input", updateCount);

resetBtn.addEventListener("click", () => {
  form.reset();
  togglePasswordField();
  updateCount();
  resetResult();
  toast.fire({
    icon: "info",
    title: "Form reset"
  });
});

copyLinkBtn.addEventListener("click", async () => {
  if (!currentGeneratedLink) return;

  try {
    await navigator.clipboard.writeText(currentGeneratedLink);
    toast.fire({
      icon: "success",
      title: "Link copied"
    });
  } catch {
    toast.fire({
      icon: "error",
      title: "Could not copy link"
    });
  }
});

openLinkBtn.addEventListener("click", () => {
  if (!currentGeneratedLink) return;
  window.open(currentGeneratedLink, "_blank", "noopener,noreferrer");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageEl.value.trim();
  const expiresIn = expiresInEl.value;
  const passwordEnabled = passwordOptionEl.checked;
  const password = passwordEl.value.trim();

  if (!message) {
    toast.fire({ icon: "warning", title: "Write a secret message first" });
    messageEl.focus();
    return;
  }

  if (message.length < 5) {
    toast.fire({ icon: "warning", title: "Message is too short" });
    messageEl.focus();
    return;
  }

  if (passwordEnabled && password.length < 4) {
    toast.fire({ icon: "warning", title: "Password must be at least 4 characters" });
    passwordEl.focus();
    return;
  }

  const durationMinutes = getExpiryMinutes(expiresIn);

  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Creating...</span>';

  try {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        password: passwordEnabled ? password : "",
        expiresIn,
        durationMinutes
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Failed to create note");
    }

    const link = data.link || `${window.location.origin}/read.html?slug=${data.slug}`;
    showResult(link);

    toast.fire({
      icon: "success",
      title: "Secret link created"
    });

    form.reset();
    togglePasswordField();
    updateCount();
  } catch (error) {
    toast.fire({
      icon: "error",
      title: error.message || "Something went wrong"
    });
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>Create secure link</span>';
  }
});

initTheme();
togglePasswordField();
updateCount();
resetResult();