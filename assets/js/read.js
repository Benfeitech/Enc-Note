const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const themeText = document.getElementById("themeText");

const readForm = document.getElementById("readForm");
const readBtn = document.getElementById("readBtn");
const readPassword = document.getElementById("readPassword");
const passwordWrap = document.getElementById("passwordWrap");
const readOutput = document.getElementById("readOutput");
const messageText = document.getElementById("messageText");
const readIntro = document.getElementById("readIntro");
const readWarning = document.getElementById("readWarning");
const statusChip = document.getElementById("statusChip");
const expiresAtText = document.getElementById("expiresAtText");
const passwordStateText = document.getElementById("passwordStateText");

const THEME_KEY = "encnote-theme";
const slug = new URLSearchParams(window.location.search).get("slug") || "";

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

themeToggle.addEventListener("click", () => {
  const currentTheme = root.getAttribute("data-theme") || "light";
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
});

function setLoading(isLoading) {
  readBtn.disabled = isLoading;
  readBtn.innerHTML = isLoading
    ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Opening...</span>'
    : '<i class="fa-solid fa-eye" aria-hidden="true"></i><span>Open message</span>';
}

function setState({ chip, intro, protectedText, expiresAt, showPassword }) {
  if (chip) statusChip.textContent = chip;
  if (intro) readIntro.textContent = intro;
  if (protectedText !== undefined) passwordStateText.textContent = protectedText;
  if (expiresAt !== undefined) expiresAtText.textContent = expiresAt;
  passwordWrap.classList.toggle("hidden", !showPassword);
}

function showBurnedMessage(message) {
  messageText.textContent = message;
  readOutput.classList.remove("hidden");
  readWarning.classList.add("hidden");
  readForm.classList.add("hidden");
  statusChip.textContent = "Burned";
}

function friendlyError(message, chip = "Unavailable") {
  statusChip.textContent = chip;
  readIntro.textContent = message;
  readWarning.classList.remove("hidden");
  readOutput.classList.add("hidden");
}

async function loadNoteStatus() {
  if (!slug) {
    friendlyError("No note link was provided. Go back and open a valid Enc Note link.", "Invalid link");
    toast.fire({ icon: "error", title: "Invalid note link" });
    setLoading(false);
    readBtn.disabled = true;
    return;
  }

  try {
    const response = await fetch(`/api/read?slug=${encodeURIComponent(slug)}`);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 410 && data?.status === "expired") {
        friendlyError("This note has expired and can no longer be opened.", "Expired");
      } else if (response.status === 410 && data?.status === "opened") {
        friendlyError("This note was already opened once and has been burned.", "Already opened");
      } else {
        friendlyError(data?.error || "Unable to load this note.", "Error");
      }

      if (data?.error) {
        toast.fire({ icon: "error", title: data.error });
      }

      readBtn.disabled = true;
      return;
    }

    setState({
      chip: data.passwordProtected ? "Password protected" : "Ready to open",
      intro: data.passwordProtected
        ? "Enter the password to open this secret note."
        : "This note is ready. Open it once and it will burn immediately after reading.",
      protectedText: data.passwordProtected ? "Yes" : "No",
      expiresAt: data.expiresAt ? new Date(data.expiresAt).toLocaleString() : "—",
      showPassword: Boolean(data.passwordProtected)
    });

    if (!data.passwordProtected) {
      readPassword.value = "";
    }
  } catch {
    friendlyError("Could not connect to the server. Please try again.", "Network error");
    toast.fire({ icon: "error", title: "Network error" });
    readBtn.disabled = true;
  }
}

readForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = readPassword.value.trim();

  if (passwordWrap && !passwordWrap.classList.contains("hidden") && !password) {
    toast.fire({ icon: "warning", title: "Enter the password first" });
    readPassword.focus();
    return;
  }

  setLoading(true);

  try {
    const response = await fetch("/api/read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        slug,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        toast.fire({ icon: "error", title: "Wrong password" });
      } else if (response.status === 410 && data?.status === "expired") {
        toast.fire({ icon: "error", title: "Note expired" });
      } else if (response.status === 410 && data?.status === "opened") {
        toast.fire({ icon: "error", title: "Note already opened" });
      } else {
        toast.fire({ icon: "error", title: data?.error || "Could not open this note" });
      }

      if (response.status === 410 && data?.status === "expired") {
        friendlyError("This note has expired and can no longer be opened.", "Expired");
      } else if (response.status === 410 && data?.status === "opened") {
        friendlyError("This note was already opened once and has been burned.", "Already opened");
      }

      return;
    }

    showBurnedMessage(data.message || "");
    toast.fire({ icon: "success", title: "Message opened and burned" });
  } catch {
    toast.fire({ icon: "error", title: "Something went wrong" });
  } finally {
    setLoading(false);
  }
});

initTheme();
loadNoteStatus();