const form = document.getElementById("createNoteForm");

const senderNameEl = document.getElementById("senderName");
const messageEl = document.getElementById("message");
const charCountEl = document.getElementById("charCount");

const imageInput = document.getElementById("imageInput");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");
const imageFileName = document.getElementById("imageFileName");
const imageFileMeta = document.getElementById("imageFileMeta");
const removeImageBtn = document.getElementById("removeImageBtn");

const expiresInEl = document.getElementById("expiresIn");
const maxOpensEl = document.getElementById("maxOpens");

const passwordOptionEl = document.getElementById("passwordOption");
const passwordFieldWrap = document.getElementById("passwordFieldWrap");
const passwordEl = document.getElementById("password");
const passwordToggleBtn = document.getElementById("passwordToggleBtn");
const passwordToggleIcon = document.getElementById("passwordToggleIcon");

const submitBtn = document.getElementById("submitBtn");
const resetBtn = document.getElementById("resetBtn");

const resultEmpty = document.getElementById("resultEmpty");
const resultSuccess = document.getElementById("resultSuccess");
const generatedLinkEl = document.getElementById("generatedLink");
const statusLinkEl = document.getElementById("statusLink");
const resultSummaryEl = document.getElementById("resultSummary");

const copyLinkBtn = document.getElementById("copyLinkBtn");
const openLinkBtn = document.getElementById("openLinkBtn");

const copyStatusBtn = document.getElementById("copyStatusBtn");
const openStatusBtn = document.getElementById("openStatusBtn");

let selectedImage = null;
let uploadedImage = null;
let currentGeneratedLink = "";
let currentStatusLink = "";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const expiryMap = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "6h": 360,
  "24h": 1440
};

const toast = typeof Swal !== "undefined"
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function updateCount() {
  charCountEl.textContent = `${messageEl.value.length} / 5000`;
}

function togglePasswordField() {
  const enabled = passwordOptionEl.checked;

  passwordFieldWrap.classList.toggle("hidden", !enabled);

  if (!enabled) {
    passwordEl.value = "";
    passwordEl.type = "password";
    passwordToggleIcon.className = "fa-regular fa-eye";
    passwordToggleBtn.setAttribute("aria-label", "Show password");
  }
}

function togglePasswordVisibility() {
  const hidden = passwordEl.type === "password";

  passwordEl.type = hidden ? "text" : "password";
  passwordToggleIcon.className = hidden
    ? "fa-regular fa-eye-slash"
    : "fa-regular fa-eye";

  passwordToggleBtn.setAttribute(
    "aria-label",
    hidden ? "Hide password" : "Show password"
  );
}

function clearSelectedImage() {
  selectedImage = null;
  uploadedImage = null;

  imageInput.value = "";
  imagePreview.removeAttribute("src");
  imagePreviewWrap.classList.add("hidden");
  imageFileName.textContent = "";
  imageFileMeta.textContent = "";
}

function showSelectedImage(file) {
  selectedImage = file;
  uploadedImage = null;

  const url = URL.createObjectURL(file);

  imagePreview.src = url;
  imagePreviewWrap.classList.remove("hidden");

  imageFileName.textContent = file.name;

  imageFileMeta.textContent =
    `${file.type || "Image"} · ${formatBytes(file.size)}`;
}

function validateImage(file) {
  if (!file) {
    return "No image selected";
  }

  const supported = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!supported.includes(file.type)) {
    return "Use JPEG, PNG, WebP or GIF";
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller";
  }

  return null;
}

async function requestUploadSignature() {
  const response = await fetch("/api/cloudinary-sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error || "Could not prepare image upload"
    );
  }

  return data;
}

async function uploadImageToCloudinary(file) {
  const signing =
    await requestUploadSignature();

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  formData.append(
    "api_key",
    signing.apiKey
  );

  formData.append(
    "timestamp",
    String(signing.timestamp)
  );

  formData.append(
    "signature",
    signing.signature
  );

  formData.append(
    "public_id",
    signing.publicId
  );

  formData.append(
    "asset_folder",
    signing.assetFolder
  );

  formData.append(
    "type",
    signing.type
  );

  const uploadUrl =
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(
      signing.cloudName
    )}/image/upload`;

  const response =
    await fetch(
      uploadUrl,
      {
        method: "POST",
        body: formData
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Image upload failed"
    );
  }

  return {
    publicId:
      data.public_id,

    assetId:
      data.asset_id || null,

    format:
      data.format,

    bytes:
      data.bytes,

    width:
      data.width,

    height:
      data.height
  };
}
function setSubmitting(isSubmitting, label = "Create secure link") {
  submitBtn.disabled = isSubmitting;

  submitBtn.innerHTML = isSubmitting
    ? `
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>${label}</span>
    `
    : `
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span>${label}</span>
    `;
}

function showResult(data) {
  currentGeneratedLink = data.link;
  currentStatusLink = data.statusLink;

  generatedLinkEl.textContent = data.link;
  statusLinkEl.textContent = data.statusLink;

  resultSummaryEl.textContent =
    `${data.openCount} / ${data.maxOpens} opens used · ` +
    `Expires ${new Date(data.expiresAt).toLocaleString()}`;

  resultEmpty.classList.add("hidden");
  resultSuccess.classList.remove("hidden");
}

function resetResult() {
  currentGeneratedLink = "";
  currentStatusLink = "";

  generatedLinkEl.textContent = "";
  statusLinkEl.textContent = "";
  resultSummaryEl.textContent = "";

  resultSuccess.classList.add("hidden");
  resultEmpty.classList.remove("hidden");
}

function resetForm() {
  form.reset();

  clearSelectedImage();

  togglePasswordField();
  updateCount();
  resetResult();
}

async function copyText(text, successTitle) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    notify("success", successTitle);
  } catch {
    notify("error", "Could not copy");
  }
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];

  if (!file) {
    clearSelectedImage();
    return;
  }

  const error = validateImage(file);

  if (error) {
    clearSelectedImage();
    notify("error", error);
    return;
  }

  showSelectedImage(file);
});

removeImageBtn.addEventListener(
  "click",
  clearSelectedImage
);

messageEl.addEventListener(
  "input",
  updateCount
);

passwordOptionEl.addEventListener(
  "change",
  togglePasswordField
);

passwordToggleBtn.addEventListener(
  "click",
  togglePasswordVisibility
);

resetBtn.addEventListener(
  "click",
  () => {
    resetForm();
    notify("info", "Form reset");
  }
);

copyLinkBtn.addEventListener(
  "click",
  () => copyText(
    currentGeneratedLink,
    "Recipient link copied"
  )
);

copyStatusBtn.addEventListener(
  "click",
  () => copyText(
    currentStatusLink,
    "Status link copied"
  )
);

openLinkBtn.addEventListener(
  "click",
  () => {
    if (!currentGeneratedLink) return;

    window.open(
      currentGeneratedLink,
      "_blank",
      "noopener,noreferrer"
    );
  }
);

openStatusBtn.addEventListener(
  "click",
  () => {
    if (!currentStatusLink) return;

    window.open(
      currentStatusLink,
      "_blank",
      "noopener,noreferrer"
    );
  }
);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message =
    messageEl.value.trim();

  const senderName =
    senderNameEl.value.trim();

  const passwordEnabled =
    passwordOptionEl.checked;

  const password =
    passwordEl.value;

  if (!message && !selectedImage) {
    notify(
      "warning",
      "Add a message or an image"
    );

    messageEl.focus();
    return;
  }

  if (message.length > 5000) {
    notify(
      "warning",
      "Message is too long"
    );

    messageEl.focus();
    return;
  }

  if (
    passwordEnabled &&
    password.trim().length < 4
  ) {
    notify(
      "warning",
      "Password must be at least 4 characters"
    );

    passwordEl.focus();
    return;
  }

  const durationMinutes =
    expiryMap[expiresInEl.value] ?? 60;

  const maxOpens =
    Number(maxOpensEl.value);

  if (
    !Number.isInteger(maxOpens) ||
    maxOpens < 1 ||
    maxOpens > 100
  ) {
    notify(
      "error",
      "Invalid opening limit"
    );

    return;
  }

  setSubmitting(
    true,
    selectedImage
      ? "Uploading image..."
      : "Creating..."
  );

  try {
    let imagePayload = null;

    if (selectedImage) {
      imagePayload =
        await uploadImageToCloudinary(
          selectedImage
        );

      uploadedImage =
        imagePayload;

      setSubmitting(
        true,
        "Creating secure link..."
      );
    }

    const response =
  await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      senderName,
      message,
      password: passwordEnabled ? password : "",
      durationMinutes,
      maxOpens,
      image: imagePayload
    })
  });

const rawResponse = await response.text();

let data;

try {
  data = rawResponse
    ? JSON.parse(rawResponse)
    : {};
} catch {
  console.error(
    "Non-JSON response from /api/notes:",
    rawResponse
  );

  throw new Error(
    `Server returned an invalid response (${response.status}).`
  );
}

if (!response.ok) {
  throw new Error(
    data?.error ||
    `Server error (${response.status})`
  );
}

    if (!response.ok) {
      throw new Error(
        data?.error ||
        "Failed to create note"
      );
    }

    showResult(data);

    notify(
      "success",
      "Secret note created"
    );

    form.reset();

    clearSelectedImage();
    togglePasswordField();
    updateCount();

  } catch (error) {
    notify(
      "error",
      error?.message ||
      "Something went wrong"
    );
  } finally {
    setSubmitting(false);
  }
});

updateCount();
togglePasswordField();
resetResult();