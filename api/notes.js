import { createClient } from "@supabase/supabase-js";
import {
  createCipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes
} from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionSecret = process.env.ENCRYPTION_SECRET;
const siteUrl = process.env.SITE_URL || "";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 8000;
const MAX_IMAGE_HEIGHT = 8000;

const ALLOWED_IMAGE_FORMATS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif"
]);

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment variables are missing");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  });
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary environment variables are missing");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
}

function requireEncryptionSecret() {
  if (!encryptionSecret) {
    throw new Error("ENCRYPTION_SECRET is not configured");
  }
}

function encryptPayload(payload, password = "") {
  requireEncryptionSecret();

  const salt = randomBytes(16);
  const iv = randomBytes(12);

  const passwordMaterial = password
    ? `${password}:${encryptionSecret}`
    : encryptionSecret;

  const key = pbkdf2Sync(
    passwordMaterial,
    salt,
    100000,
    32,
    "sha256"
  );

  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encryptedContent: Buffer.concat([
      encrypted,
      authTag
    ]).toString("base64"),

    iv: iv.toString("base64"),

    salt: salt.toString("base64")
  };
}

function buildSlug() {
  return `${randomBytes(12).toString("hex")}`;
}

function buildSenderStatusToken() {
  return randomBytes(32).toString("base64url");
}

function hashStatusToken(token) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

function computeExpiry(durationMinutes) {
  const minutes = Number(durationMinutes);

  if (
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    minutes > 7 * 24 * 60
  ) {
    throw new Error("Invalid expiry duration");
  }

  return new Date(
    Date.now() + minutes * 60 * 1000
  ).toISOString();
}

function normalizeMaxOpens(value) {
  const count = Number(value);

  if (!Number.isInteger(count)) {
    throw new Error("Invalid maximum open count");
  }

  if (count < 1 || count > 100) {
    throw new Error(
      "Maximum open count must be between 1 and 100"
    );
  }

  return count;
}

function normalizeImageMeta(image) {
  if (!image || typeof image !== "object") {
    return null;
  }

  const publicId = String(
    image.publicId || ""
  ).trim();

  if (!publicId) {
    throw new Error("Image public ID is missing");
  }

  if (!publicId.startsWith("note-")) {
    throw new Error("Invalid image asset");
  }

  const format = String(
    image.format || ""
  ).toLowerCase().trim();

  if (!ALLOWED_IMAGE_FORMATS.has(format)) {
    throw new Error("Unsupported image format");
  }

  const bytes = Number(image.bytes);

  if (
    !Number.isFinite(bytes) ||
    bytes <= 0 ||
    bytes > MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "Image must be 5 MB or smaller"
    );
  }

  const width = Number(image.width);
  const height = Number(image.height);

  if (
    Number.isFinite(width) &&
    (width < 1 || width > MAX_IMAGE_WIDTH)
  ) {
    throw new Error("Image width is invalid");
  }

  if (
    Number.isFinite(height) &&
    (height < 1 || height > MAX_IMAGE_HEIGHT)
  ) {
    throw new Error("Image height is invalid");
  }

  return {
    publicId,
    assetId: String(image.assetId || "").trim() || null,
    format,
    bytes: Math.floor(bytes),
    width: Number.isFinite(width)
      ? Math.floor(width)
      : null,
    height: Number.isFinite(height)
      ? Math.floor(height)
      : null
  };
}

async function validateCloudinaryImage(image) {
  configureCloudinary();

  const resource = await cloudinary.api.resource(
    image.publicId,
    {
      resource_type: "image",
      type: "private"
    }
  );

  if (!resource) {
    throw new Error("Image could not be verified");
  }

  if (resource.resource_type !== "image") {
    throw new Error("Only image assets are allowed");
  }

  if (resource.type !== "private") {
    throw new Error("Image is not stored as a private asset");
  }

  if (!resource.public_id.startsWith("enc-note/note-")) {
    throw new Error("Invalid Enc-Note image asset");
  }

  if (resource.bytes > MAX_IMAGE_BYTES) {
    await cloudinary.uploader.destroy(
      resource.public_id,
      {
        resource_type: "image",
        type: "private",
        invalidate: true
      }
    );

    throw new Error("Image must be 5 MB or smaller");
  }

  return {
    publicId: resource.public_id,
    assetId: resource.asset_id || image.assetId || null,
    format: String(resource.format || "").toLowerCase(),
    bytes: Number(resource.bytes || 0),
    width: Number(resource.width || 0) || null,
    height: Number(resource.height || 0) || null
  };
}

export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "application/json"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    requireEncryptionSecret();

    const body = req.body || {};

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    const senderName = String(
      body.senderName || ""
    ).trim().slice(0, 80);

    const password = String(
      body.password || ""
    );

    const imageInput = body.image || null;

    if (!message && !imageInput) {
      return res.status(400).json({
        error: "Add a message or image"
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        error: "Message cannot exceed 5000 characters"
      });
    }

    if (password.length > 200) {
      return res.status(400).json({
        error: "Password is too long"
      });
    }

    const durationMinutes =
      Number(body.durationMinutes);

    const expiresAt =
      computeExpiry(durationMinutes);

    const maxOpens =
      normalizeMaxOpens(body.maxOpens ?? 1);

    const passwordProtected =
      Boolean(password.trim());

    let verifiedImage = null;

    if (imageInput) {
      const normalizedImage =
        normalizeImageMeta(imageInput);

      verifiedImage =
        await validateCloudinaryImage(
          normalizedImage
        );
    }

    let contentType = "text";

    if (verifiedImage && message) {
      contentType = "text_image";
    } else if (verifiedImage) {
      contentType = "image";
    }

    const payload = {
      version: 1,
      text: message || null
    };

    const encrypted = encryptPayload(
      payload,
      passwordProtected
        ? password.trim()
        : ""
    );

    const slug = buildSlug();

    const senderStatusToken =
      buildSenderStatusToken();

    const senderStatusTokenHash =
      hashStatusToken(senderStatusToken);

    const supabase =
      createSupabaseClient();

    const { error } =
      await supabase
        .from("notes")
        .insert({
          slug,
          sender_name:
            senderName || null,

          encrypted_content:
            encrypted.encryptedContent,

          iv: encrypted.iv,

          salt: encrypted.salt,

          password_protected:
            passwordProtected,

          expires_at:
            expiresAt,

          is_opened: false,

          opened_at: null,

          max_opens:
            maxOpens,

          open_count:
            0,

          content_type:
            contentType,

          image_public_id:
            verifiedImage?.publicId || null,

          image_asset_id:
            verifiedImage?.assetId || null,

          image_format:
            verifiedImage?.format || null,

          image_bytes:
            verifiedImage?.bytes || null,

          image_width:
            verifiedImage?.width || null,

          image_height:
            verifiedImage?.height || null,

          sender_status_token_hash:
            senderStatusTokenHash
        });

    if (error) {
      throw error;
    }

    const base =
      siteUrl ||
      `https://${process.env.VERCEL_URL || "localhost"}`;

    const cleanBase =
      base.replace(/\/$/, "");

    const link =
      `${cleanBase}/read.html?slug=${encodeURIComponent(slug)}`;

    const statusLink =
      `${cleanBase}/status.html?token=${encodeURIComponent(
        senderStatusToken
      )}`;

    return res.status(201).json({
      success: true,
      slug,
      link,
      statusLink,
      expiresAt,
      senderName:
        senderName || null,
      contentType,
      maxOpens,
      openCount: 0
    });
  } catch (error) {
    console.error(
      "Create note error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Failed to create note"
    });
  }
}