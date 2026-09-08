const readForm = document.getElementById("readForm");
const readBtn = document.getElementById("readBtn");
const readPassword = document.getElementById("readPassword");
const passwordWrap = document.getElementById("passwordWrap");

const readOutput = document.getElementById("readOutput");
const textContentWrap = document.getElementById("textContentWrap");
const imageContentWrap = document.getElementById("imageContentWrap");

const messageText = document.getElementById("messageText");
const messageImage = document.getElementById("messageImage");

const readIntro = document.getElementById("readIntro");
const readWarning = document.getElementById("readWarning");

const statusChip = document.getElementById("statusChip");
const expiresAtText = document.getElementById("expiresAtText");
const passwordStateText = document.getElementById("passwordStateText");
const openingsText = document.getElementById("openingsText");

const senderNameWrap = document.getElementById("senderNameWrap");
const senderNameText = document.getElementById("senderNameText");

const readPasswordToggleBtn =
  document.getElementById("readPasswordToggleBtn");

const readPasswordToggleIcon =
  document.getElementById("readPasswordToggleIcon");

const consumptionText =
  document.getElementById("consumptionText");

const slug =
  new URLSearchParams(window.location.search).get("slug") || "";


/* =========================================================
   SWEETALERT2 — RESTORED TOP-END NOTIFICATIONS
   ========================================================= */

const toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3200,
  timerProgressBar: true,
  background: "var(--surface-strong, #ffffff)",
  color: "var(--text, #0f172a)",
  customClass: {
    popup: "encnote-toast"
  }
});

function notify(icon, title, text = "") {
  return toast.fire({
    icon,
    title,
    ...(text ? { text } : {})
  });
}


/* =========================================================
   UI HELPERS
   ========================================================= */

function setLoading(isLoading) {
  readBtn.disabled = isLoading;

  readBtn.innerHTML = isLoading
    ? `
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Opening...</span>
    `
    : `
      <i class="fa-solid fa-eye"></i>
      <span>Open message</span>
    `;
}

function setSender(senderName) {
  const exists =
    Boolean(
      senderName &&
      String(senderName).trim()
    );

  senderNameWrap.classList.toggle(
    "hidden",
    !exists
  );

  senderNameText.textContent =
    exists ? String(senderName) : "";
}

function setError(message, chip = "Unavailable") {
  statusChip.textContent = chip;
  readIntro.textContent = message;

  readWarning.classList.remove("hidden");
  readOutput.classList.add("hidden");

  readBtn.disabled = true;

  /* Keep the password form hidden when note is unavailable */
  passwordWrap.classList.add("hidden");
}


/* =========================================================
   STATUS DISPLAY
   ========================================================= */

function showStatus(data) {
  statusChip.textContent =
    data.passwordProtected
      ? "Password protected"
      : "Ready to open";

  readIntro.textContent =
    data.passwordProtected
      ? "Enter the password to open this secret note."
      : "This note is available. Opening it will consume one allowed opening.";

  expiresAtText.textContent =
    data.expiresAt
      ? new Date(data.expiresAt).toLocaleString()
      : "—";

  passwordStateText.textContent =
    data.passwordProtected
      ? "Yes"
      : "No";

  openingsText.textContent =
    `${data.openCount} / ${data.maxOpens} used · ${data.remainingOpens} remaining`;

  setSender(data.senderName);

  passwordWrap.classList.toggle(
    "hidden",
    !data.passwordProtected
  );

  readBtn.disabled = false;
}


/* =========================================================
   DISPLAY MESSAGE / IMAGE
   ========================================================= */

function showOutput(data) {
  const text =
    typeof data.text === "string"
      ? data.text
      : "";

  const hasText =
    text.length > 0;

  const hasImage =
    Boolean(data.imageUrl);

  messageText.textContent = text;

  textContentWrap.classList.toggle(
    "hidden",
    !hasText
  );

  imageContentWrap.classList.toggle(
    "hidden",
    !hasImage
  );

  if (hasImage) {
    messageImage.src = data.imageUrl;
  } else {
    messageImage.removeAttribute("src");
  }

  const remaining =
    Number.isFinite(data.remainingOpens)
      ? data.remainingOpens
      : 0;

  const maxOpens =
    Number.isFinite(data.maxOpens)
      ? data.maxOpens
      : 1;

  const openCount =
    Number.isFinite(data.openCount)
      ? data.openCount
      : 1;

  if (data.fullyConsumed) {
    consumptionText.textContent =
      `Opening ${openCount} of ${maxOpens}. This note has now reached its maximum number of successful openings.`;
  } else {
    consumptionText.textContent =
      `Opening ${openCount} of ${maxOpens}. ${remaining} opening${remaining === 1 ? "" : "s"} remaining.`;
  }

  readOutput.classList.remove("hidden");
  readWarning.classList.add("hidden");

  statusChip.textContent =
    data.fullyConsumed
      ? "Consumed"
      : "Opened";

  readForm.classList.add("hidden");
}


/* =========================================================
   PASSWORD VISIBILITY
   ========================================================= */

function togglePasswordVisibility() {
  const hidden =
    readPassword.type === "password";

  readPassword.type =
    hidden ? "text" : "password";

  readPasswordToggleIcon.className =
    hidden
      ? "fa-regular fa-eye-slash"
      : "fa-regular fa-eye";

  readPasswordToggleBtn.setAttribute(
    "aria-label",
    hidden
      ? "Hide password"
      : "Show password"
  );
}


/* =========================================================
   LOAD NOTE STATUS
   ========================================================= */

async function loadNoteStatus() {
  if (!slug) {
    setError(
      "No note link was provided. Please open a valid Enc-Note link.",
      "Invalid link"
    );

    notify(
      "error",
      "Invalid note link"
    );

    return;
  }

  try {
    const response =
      await fetch(
        `/api/read?slug=${encodeURIComponent(slug)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    /* ============================================
       NOT FOUND
       ============================================ */
    if (response.status === 404) {
      setError(
        "This note could not be found. The link may be invalid or incomplete.",
        "Not found"
      );

      notify(
        "error",
        "Note not found"
      );

      return;
    }

    /* ============================================
       EXPIRED
       ============================================ */
    if (
      response.status === 410 &&
      data?.status === "expired"
    ) {
      setError(
        "This note has expired and can no longer be opened.",
        "Expired"
      );

      notify(
        "warning",
        "Note expired",
        "This secret message is no longer available."
      );

      return;
    }

    /* ============================================
       MAX OPEN COUNT REACHED
       ============================================ */
    if (
      response.status === 410 &&
      data?.status === "opened"
    ) {
      setError(
        "This note has reached its maximum number of openings.",
        "Fully consumed"
      );

      notify(
        "info",
        "Note already consumed",
        "The allowed number of openings has been used."
      );

      return;
    }

    /* ============================================
       OTHER API ERROR
       ============================================ */
    if (!response.ok) {
      setError(
        data?.error ||
          "Unable to load this note.",
        "Unavailable"
      );

      notify(
        "error",
        data?.error ||
          "Unable to load note"
      );

      return;
    }

    showStatus(data);

    /* ============================================
       IMPORTANT:
       SHOW REMAINING OPEN COUNT TO RECIPIENT
       ============================================ */

    const remaining =
      Number(data.remainingOpens ?? 0);

    const maxOpens =
      Number(data.maxOpens ?? 1);

    if (remaining === 1) {
      notify(
        "warning",
        "1 opening remaining",
        `This link allows ${maxOpens} successful opening${maxOpens === 1 ? "" : "s"} in total.`
      );
    } else {
      notify(
        "info",
        `${remaining} openings remaining`,
        `${data.openCount} of ${maxOpens} allowed openings have been used.`
      );
    }

  } catch (error) {
    console.error(
      "Load note status error:",
      error
    );

    setError(
      "Could not connect to the server. Please try again.",
      "Network error"
    );

    notify(
      "error",
      "Network error",
      "Could not connect to Enc-Note."
    );
  }
}


/* =========================================================
   PASSWORD TOGGLE
   ========================================================= */

if (readPasswordToggleBtn) {
  readPasswordToggleBtn.addEventListener(
    "click",
    togglePasswordVisibility
  );
}


/* =========================================================
   OPEN NOTE
   ========================================================= */

readForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const password =
      readPassword.value;

    if (
      !passwordWrap.classList.contains(
        "hidden"
      ) &&
      !password
    ) {
      notify(
        "warning",
        "Enter the password first"
      );

      readPassword.focus();

      return;
    }

    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/read",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json"
            },

            body:
              JSON.stringify({
                slug,
                password
              })
          }
        );

      const data =
        await response.json();

      /* ==========================================
         WRONG PASSWORD
         ========================================== */

      if (
        response.status === 401
      ) {
        notify(
          "error",
          "Wrong password",
          "The opening was not consumed."
        );

        return;
      }

      /* ==========================================
         EXPIRED
         ========================================== */

      if (
        response.status === 410 &&
        data?.status === "expired"
      ) {
        setError(
          "This note has expired and can no longer be opened.",
          "Expired"
        );

        notify(
          "warning",
          "Note expired"
        );

        return;
      }

      /* ==========================================
         OPEN COUNT EXHAUSTED
         ========================================== */

      if (
        response.status === 410 &&
        data?.status === "opened"
      ) {
        setError(
          "This note has already reached its maximum number of openings.",
          "Fully consumed"
        );

        notify(
          "info",
          "No openings remaining"
        );

        return;
      }

      /* ==========================================
         NOT FOUND
         ========================================== */

      if (
        response.status === 404
      ) {
        setError(
          "This note could not be found.",
          "Not found"
        );

        notify(
          "error",
          "Note not found"
        );

        return;
      }

      /* ==========================================
         OTHER FAILURE
         ========================================== */

      if (!response.ok) {
        notify(
          "error",
          data?.error ||
            "Could not open this note"
        );

        return;
      }

      /* ==========================================
         SUCCESS
         ========================================== */

      showOutput(data);

      const remaining =
        Number(
          data.remainingOpens ?? 0
        );

      if (
        data.fullyConsumed
      ) {
        notify(
          "success",
          "Message opened and consumed",
          "This was the final allowed opening."
        );
      } else {
        notify(
          "success",
          "Message opened",
          `${remaining} opening${remaining === 1 ? "" : "s"} remaining.`
        );
      }

    } catch (error) {
      console.error(
        "Open note error:",
        error
      );

      notify(
        "error",
        "Something went wrong",
        "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }
);


/* =========================================================
   START
   ========================================================= */

loadNoteStatus();
