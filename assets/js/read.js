const root = document.documentElement;

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
  document.getElementById(
    "readPasswordToggleBtn"
  );

const readPasswordToggleIcon =
  document.getElementById(
    "readPasswordToggleIcon"
  );

const consumptionText =
  document.getElementById(
    "consumptionText"
  );

const slug =
  new URLSearchParams(
    window.location.search
  ).get("slug") || "";

const toast =
  typeof Swal !== "undefined"
    ? Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2800,
        timerProgressBar: true,
        background: "#0f172a",
        color: "#fff"
      })
    : null;

function notify(icon, title) {
  if (toast) {
    toast.fire({ icon, title });
  }
}

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
    exists
      ? senderName
      : "";
}

function setError(message, chip = "Unavailable") {
  statusChip.textContent = chip;
  readIntro.textContent = message;

  readWarning.classList.remove("hidden");
  readOutput.classList.add("hidden");

  readBtn.disabled = true;
}

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
      ? new Date(
          data.expiresAt
        ).toLocaleString()
      : "—";

  passwordStateText.textContent =
    data.passwordProtected
      ? "Yes"
      : "No";

  openingsText.textContent =
    `${data.openCount} / ${data.maxOpens} used · ${data.remainingOpens} remaining`;

  setSender(
    data.senderName
  );

  passwordWrap.classList.toggle(
    "hidden",
    !data.passwordProtected
  );

  readBtn.disabled = false;
}

function showOutput(data) {
  const text =
    typeof data.text === "string"
      ? data.text
      : "";

  const hasText =
    text.length > 0;

  const hasImage =
    Boolean(data.imageUrl);

  messageText.textContent =
    text;

  textContentWrap.classList.toggle(
    "hidden",
    !hasText
  );

  imageContentWrap.classList.toggle(
    "hidden",
    !hasImage
  );

  if (hasImage) {
    messageImage.src =
      data.imageUrl;
  } else {
    messageImage.removeAttribute(
      "src"
    );
  }

  const remaining =
    Number.isFinite(
      data.remainingOpens
    )
      ? data.remainingOpens
      : 0;

  consumptionText.textContent =
    data.fullyConsumed
      ? "This note has now reached its maximum number of successful openings."
      : `${remaining} opening${remaining === 1 ? "" : "s"} remaining.`;

  readOutput.classList.remove(
    "hidden"
  );

  readWarning.classList.add(
    "hidden"
  );

  statusChip.textContent =
    data.fullyConsumed
      ? "Consumed"
      : "Opened";

  readForm.classList.add(
    "hidden"
  );
}

function togglePasswordVisibility() {
  const hidden =
    readPassword.type ===
    "password";

  readPassword.type =
    hidden
      ? "text"
      : "password";

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
            "Accept":
              "application/json"
          },
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      if (
        response.status === 410 &&
        data?.status === "expired"
      ) {
        setError(
          "This note has expired and can no longer be opened.",
          "Expired"
        );
      } else if (
        response.status === 410 &&
        data?.status === "opened"
      ) {
        setError(
          "This note has reached its maximum number of openings.",
          "Fully consumed"
        );
      } else {
        setError(
          data?.error ||
            "Unable to load this note.",
          "Unavailable"
        );
      }

      return;
    }

    showStatus(data);

  } catch {
    setError(
      "Could not connect to the server. Please try again.",
      "Network error"
    );

    notify(
      "error",
      "Network error"
    );
  }
}

readPasswordToggleBtn.addEventListener(
  "click",
  togglePasswordVisibility
);

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
              "Accept":
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

      if (!response.ok) {
        if (
          response.status === 401
        ) {
          notify(
            "error",
            "Wrong password"
          );
        } else if (
          response.status === 410 &&
          data?.status ===
            "expired"
        ) {
          setError(
            "This note has expired and can no longer be opened.",
            "Expired"
          );
        } else if (
          response.status === 410 &&
          data?.status ===
            "opened"
        ) {
          setError(
            "This note has already reached its maximum number of openings.",
            "Fully consumed"
          );
        } else {
          notify(
            "error",
            data?.error ||
              "Could not open this note"
          );
        }

        return;
      }

      showOutput(data);

      notify(
        "success",
        "Message opened"
      );

    } catch {
      notify(
        "error",
        "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }
);

loadNoteStatus();