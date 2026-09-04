const loadingState =
  document.getElementById(
    "loadingState"
  );

const statusContent =
  document.getElementById(
    "statusContent"
  );

const errorState =
  document.getElementById(
    "errorState"
  );

const errorTitle =
  document.getElementById(
    "errorTitle"
  );

const errorMessage =
  document.getElementById(
    "errorMessage"
  );

const refreshBtn =
  document.getElementById(
    "refreshBtn"
  );

const statusText =
  document.getElementById(
    "statusText"
  );

const statusDot =
  document.getElementById(
    "statusDot"
  );

const progressText =
  document.getElementById(
    "progressText"
  );

const progressBar =
  document.getElementById(
    "progressBar"
  );

const remainingText =
  document.getElementById(
    "remainingText"
  );

const senderText =
  document.getElementById(
    "senderText"
  );

const contentTypeText =
  document.getElementById(
    "contentTypeText"
  );

const createdText =
  document.getElementById(
    "createdText"
  );

const expiresText =
  document.getElementById(
    "expiresText"
  );

const openedText =
  document.getElementById(
    "openedText"
  );

const passwordText =
  document.getElementById(
    "passwordText"
  );

const token =
  new URLSearchParams(
    window.location.search
  ).get("token") || "";

const toast =
  typeof Swal !== "undefined"
    ? Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2200,
        background: "#0f172a",
        color: "#fff"
      })
    : null;

function notify(icon, title) {
  if (toast) {
    toast.fire({ icon, title });
  }
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (Number.isNaN(
    date.getTime()
  )) {
    return "—";
  }

  return date.toLocaleString();
}

function prettyContentType(type) {
  if (type === "text_image") {
    return "Text + image";
  }

  if (type === "image") {
    return "Image";
  }

  return "Text";
}

function setStatusStyle(status) {
  const styles = {
    unopened: {
      dot: "bg-slate-400"
    },

    opened: {
      dot: "bg-blue-500"
    },

    consumed: {
      dot: "bg-emerald-500"
    },

    expired: {
      dot: "bg-amber-500"
    }
  };

  statusDot.className =
    `h-3 w-3 rounded-full ${
      styles[status]?.dot ||
      "bg-slate-400"
    }`;
}

async function loadStatus() {
  if (!token) {
    showError(
      "Invalid status link",
      "No sender status token was provided."
    );

    return;
  }

  loadingState.classList.remove(
    "hidden"
  );

  statusContent.classList.add(
    "hidden"
  );

  errorState.classList.add(
    "hidden"
  );

  try {
    const response =
      await fetch(
        `/api/status?token=${encodeURIComponent(token)}`,
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
      throw new Error(
        data?.error ||
        "Status unavailable"
      );
    }

    renderStatus(data);

  } catch (error) {
    showError(
      "Status unavailable",
      error?.message ||
        "Could not load note status."
    );
  } finally {
    loadingState.classList.add(
      "hidden"
    );
  }
}

function renderStatus(data) {
  const used =
    Number(data.openCount || 0);

  const max =
    Number(data.maxOpens || 1);

  const remaining =
    Number(
      data.remainingOpens ??
      Math.max(max - used, 0)
    );

  const percentage =
    Math.min(
      100,
      Math.max(
        0,
        (used / max) * 100
      )
    );

  statusText.textContent =
    data.status || "unopened";

  setStatusStyle(
    data.status
  );

  progressText.textContent =
    `${used} / ${max}`;

  progressBar.style.width =
    `${percentage}%`;

  remainingText.textContent =
    remaining === 0
      ? "No openings remaining"
      : `${remaining} opening${remaining === 1 ? "" : "s"} remaining`;

  senderText.textContent =
    data.senderName ||
    "Anonymous";

  contentTypeText.textContent =
    prettyContentType(
      data.contentType
    );

  createdText.textContent =
    formatDate(
      data.createdAt
    );

  expiresText.textContent =
    formatDate(
      data.expiresAt
    );

  openedText.textContent =
    data.openedAt
      ? formatDate(
          data.openedAt
        )
      : "Not opened yet";

  passwordText.textContent =
    data.passwordProtected
      ? "Yes"
      : "No";

  statusContent.classList.remove(
    "hidden"
  );
}

function showError(title, message) {
  loadingState.classList.add(
    "hidden"
  );

  statusContent.classList.add(
    "hidden"
  );

  errorTitle.textContent =
    title;

  errorMessage.textContent =
    message;

  errorState.classList.remove(
    "hidden"
  );
}

refreshBtn.addEventListener(
  "click",
  async () => {
    refreshBtn.disabled = true;

    refreshBtn.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Checking...
    `;

    await loadStatus();

    refreshBtn.disabled = false;

    refreshBtn.innerHTML = `
      <i class="fa-solid fa-rotate"></i>
      Refresh
    `;

    notify(
      "success",
      "Status updated"
    );
  }
);

loadStatus();