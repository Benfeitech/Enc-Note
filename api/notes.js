import { createClient } from "@supabase/supabase-js";
import {
  createCipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes
} from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appSecret = process.env.ENCRYPTION_SECRET || "enc-note-dev-secret";
const siteUrl = process.env.SITE_URL || "";

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment variables are missing");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
}

function encryptMessage(message, password = "") {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const passwordMaterial = password ? `${password}:${appSecret}` : appSecret;
  const key = pbkdf2Sync(passwordMaterial, salt, 100000, 32, "sha256");

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(message, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedContent: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
    salt: salt.toString("base64")
  };
}

function buildSlug(message) {
  const randomPart = randomBytes(6).toString("hex");
  const hashPart = createHash("sha1").update(message).digest("hex").slice(0, 4);
  return `${randomPart}${hashPart}`;
}

function computeExpiry(durationMinutes) {
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("Invalid expiry duration");
  }

  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, password = "", durationMinutes } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const trimmedMessage = message.trim();

    if (trimmedMessage.length < 5) {
      return res.status(400).json({ error: "Message is too short" });
    }

    const expiresAt = computeExpiry(durationMinutes);
    const slug = buildSlug(trimmedMessage);
    const passwordProtected = Boolean(password && password.trim());
    const { encryptedContent, iv, salt } = encryptMessage(
      trimmedMessage,
      passwordProtected ? password.trim() : ""
    );

    const supabase = createSupabaseClient();

    const { error } = await supabase.from("notes").insert({
      slug,
      encrypted_content: encryptedContent,
      iv,
      salt,
      password_protected: passwordProtected,
      expires_at: expiresAt,
      is_opened: false,
      opened_at: null
    });

    if (error) {
      throw error;
    }

    const base = siteUrl || `https://${process.env.VERCEL_URL || "localhost"}`;
    const link = `${base.replace(/\/$/, "")}/read.html?slug=${slug}`;

    return res.status(201).json({
      success: true,
      slug,
      link,
      expiresAt
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to create note"
    });
  }
}