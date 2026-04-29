import { createClient } from "@supabase/supabase-js";
import {
  createDecipheriv,
  pbkdf2Sync
} from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appSecret = process.env.ENCRYPTION_SECRET || "enc-note-dev-secret";

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment variables are missing");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
}

function deriveKey(password, saltBase64) {
  const salt = Buffer.from(saltBase64, "base64");
  const material = password ? `${password}:${appSecret}` : appSecret;
  return pbkdf2Sync(material, salt, 100000, 32, "sha256");
}

function decryptMessage(encryptedContent, ivBase64, saltBase64, password = "") {
  const key = deriveKey(password, saltBase64);
  const iv = Buffer.from(ivBase64, "base64");
  const payload = Buffer.from(encryptedContent, "base64");

  if (payload.length < 17) {
    throw new Error("Invalid encrypted payload");
  }

  const ciphertext = payload.subarray(0, payload.length - 16);
  const authTag = payload.subarray(payload.length - 16);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

function isExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now();
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    const supabase = createSupabaseClient();

    if (req.method === "GET") {
      const slug = String(req.query.slug || "").trim();

      if (!slug) {
        return res.status(400).json({ error: "Slug is required" });
      }

      const { data: note, error } = await supabase
        .from("notes")
        .select("id, slug, sender_name, password_protected, expires_at, is_opened")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;

      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }

      if (note.is_opened) {
        return res.status(410).json({ status: "opened", error: "This note has already been opened" });
      }

      if (isExpired(note.expires_at)) {
        return res.status(410).json({ status: "expired", error: "This note has expired" });
      }

      return res.status(200).json({
        success: true,
        slug: note.slug,
        senderName: note.sender_name || null,
        passwordProtected: note.password_protected,
        expiresAt: note.expires_at,
        opened: note.is_opened
      });
    }

    if (req.method === "POST") {
      const { slug, password = "" } = req.body || {};
      const cleanSlug = String(slug || "").trim();
      const cleanPassword = String(password || "");

      if (!cleanSlug) {
        return res.status(400).json({ error: "Slug is required" });
      }

      const { data: note, error } = await supabase
        .from("notes")
        .select("id, slug, sender_name, encrypted_content, iv, salt, password_protected, expires_at, is_opened")
        .eq("slug", cleanSlug)
        .maybeSingle();

      if (error) throw error;

      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }

      if (note.is_opened) {
        return res.status(410).json({ status: "opened", error: "This note has already been opened" });
      }

      if (isExpired(note.expires_at)) {
        return res.status(410).json({ status: "expired", error: "This note has expired" });
      }

      if (note.password_protected && !cleanPassword) {
        return res.status(401).json({ error: "Password is required" });
      }

      let decryptedMessage;
      try {
        decryptedMessage = decryptMessage(
          note.encrypted_content,
          note.iv,
          note.salt,
          note.password_protected ? cleanPassword : ""
        );
      } catch {
        return res.status(401).json({ error: "Wrong password" });
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from("notes")
        .update({
          is_opened: true,
          opened_at: new Date().toISOString()
        })
        .eq("id", note.id)
        .eq("is_opened", false)
        .select("id");

      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        return res.status(410).json({ status: "opened", error: "This note has already been opened" });
      }

      await supabase.from("note_access_logs").insert({
        note_id: note.id,
        attempt_type: "read",
        success: true
      });

      return res.status(200).json({
        success: true,
        message: decryptedMessage,
        senderName: note.sender_name || null
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Something went wrong"
    });
  }
}