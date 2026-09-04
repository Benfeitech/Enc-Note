import { createClient } from "@supabase/supabase-js";
import {
  createDecipheriv,
  pbkdf2Sync
} from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const encryptionSecret =
  process.env.ENCRYPTION_SECRET;

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Supabase environment variables are missing"
    );
  }

  return createClient(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        persistSession: false
      }
    }
  );
}

function configureCloudinary() {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME;

  const apiKey =
    process.env.CLOUDINARY_API_KEY;

  const apiSecret =
    process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary environment variables are missing"
    );
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
    throw new Error(
      "ENCRYPTION_SECRET is not configured"
    );
  }
}

function deriveKey(
  password,
  saltBase64
) {
  requireEncryptionSecret();

  const salt =
    Buffer.from(
      saltBase64,
      "base64"
    );

  const material =
    password
      ? `${password}:${encryptionSecret}`
      : encryptionSecret;

  return pbkdf2Sync(
    material,
    salt,
    100000,
    32,
    "sha256"
  );
}

function decryptPayload(
  encryptedContent,
  ivBase64,
  saltBase64,
  password = ""
) {
  const key = deriveKey(
    password,
    saltBase64
  );

  const iv =
    Buffer.from(
      ivBase64,
      "base64"
    );

  const payload =
    Buffer.from(
      encryptedContent,
      "base64"
    );

  if (payload.length < 17) {
    throw new Error(
      "Invalid encrypted payload"
    );
  }

  const ciphertext =
    payload.subarray(
      0,
      payload.length - 16
    );

  const authTag =
    payload.subarray(
      payload.length - 16
    );

  const decipher =
    createDecipheriv(
      "aes-256-gcm",
      key,
      iv
    );

  decipher.setAuthTag(
    authTag
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        ciphertext
      ),
      decipher.final()
    ]).toString("utf8");

  try {
    return JSON.parse(decrypted);
  } catch {
    // Backward compatibility with
    // existing plain-text Enc-Notes.
    return {
      version: 0,
      text: decrypted
    };
  }
}

function isExpired(
  expiresAt
) {
  return (
    new Date(
      expiresAt
    ).getTime() <= Date.now()
  );
}

function friendlyContent(
  payload
) {
  return {
    text:
      typeof payload?.text === "string"
        ? payload.text
        : null
  };
}

async function createImageUrl(
  publicId,
  format,
  expiresAt
) {
  if (!publicId || !format) {
    return null;
  }

  configureCloudinary();

  const nowSeconds =
    Math.floor(
      Date.now() / 1000
    );

  const noteExpirySeconds =
    Math.floor(
      new Date(
        expiresAt
      ).getTime() / 1000
    );

  const fiveMinutes =
    nowSeconds + 5 * 60;

  const signedExpiry =
    Math.max(
      nowSeconds + 30,
      Math.min(
        fiveMinutes,
        noteExpirySeconds
      )
    );

  return cloudinary.utils.private_download_url(
    publicId,
    format,
    {
      resource_type: "image",
      type: "private",
      expires_at: signedExpiry
    }
  );
}

async function getNote(
  supabase,
  slug,
  includeSecret
) {
  const fields = includeSecret
    ? [
        "id",
        "slug",
        "sender_name",
        "encrypted_content",
        "iv",
        "salt",
        "password_protected",
        "expires_at",
        "is_opened",
        "opened_at",
        "max_opens",
        "open_count",
        "content_type",
        "image_public_id",
        "image_asset_id",
        "image_format"
      ].join(",")
    : [
        "id",
        "slug",
        "sender_name",
        "password_protected",
        "expires_at",
        "is_opened",
        "opened_at",
        "max_opens",
        "open_count",
        "content_type"
      ].join(",");

  const { data, error } =
    await supabase
      .from("notes")
      .select(fields)
      .eq("slug", slug)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Content-Type",
    "application/json"
  );

  try {
    const supabase =
      createSupabaseClient();

    if (req.method === "GET") {
      const slug =
        String(
          req.query?.slug || ""
        ).trim();

      if (!slug) {
        return res.status(400).json({
          error: "Slug is required"
        });
      }

      const note =
        await getNote(
          supabase,
          slug,
          false
        );

      if (!note) {
        return res.status(404).json({
          error: "Note not found"
        });
      }

      if (
        note.open_count >=
        note.max_opens
      ) {
        return res.status(410).json({
          status: "opened",
          error:
            "This note has reached its maximum number of openings"
        });
      }

      if (
        isExpired(
          note.expires_at
        )
      ) {
        return res.status(410).json({
          status: "expired",
          error:
            "This note has expired"
        });
      }

      return res.status(200).json({
        success: true,
        slug: note.slug,
        senderName:
          note.sender_name || null,
        passwordProtected:
          Boolean(
            note.password_protected
          ),
        expiresAt:
          note.expires_at,
        contentType:
          note.content_type || "text",
        maxOpens:
          note.max_opens,
        openCount:
          note.open_count,
        remainingOpens:
          Math.max(
            note.max_opens -
              note.open_count,
            0
          )
      });
    }

    if (req.method === "POST") {
      const slug =
        String(
          req.body?.slug || ""
        ).trim();

      const password =
        String(
          req.body?.password || ""
        );

      if (!slug) {
        return res.status(400).json({
          error: "Slug is required"
        });
      }

      const note =
        await getNote(
          supabase,
          slug,
          true
        );

      if (!note) {
        return res.status(404).json({
          error: "Note not found"
        });
      }

      if (
        note.open_count >=
        note.max_opens
      ) {
        return res.status(410).json({
          status: "opened",
          error:
            "This note has reached its maximum number of openings"
        });
      }

      if (
        isExpired(
          note.expires_at
        )
      ) {
        return res.status(410).json({
          status: "expired",
          error:
            "This note has expired"
        });
      }

      if (
        note.password_protected &&
        !password
      ) {
        return res.status(401).json({
          error:
            "Password is required"
        });
      }

      let payload;

      try {
        payload =
          decryptPayload(
            note.encrypted_content,
            note.iv,
            note.salt,
            note.password_protected
              ? password
              : ""
          );
      } catch {
        return res.status(401).json({
          error: "Wrong password"
        });
      }

      /*
       * Password/content validation has succeeded.
       *
       * NOW atomically consume exactly
       * one opening.
       */
      const {
        data: consumed,
        error: consumeError
      } = await supabase.rpc(
        "consume_note_open",
        {
          p_slug: slug
        }
      );

      if (consumeError) {
        throw consumeError;
      }

      if (
        !consumed ||
        consumed.length === 0
      ) {
        /*
         * Another request may have consumed
         * the final opening while this request
         * was decrypting.
         */
        const current =
          await getNote(
            supabase,
            slug,
            false
          );

        if (
          current &&
          current.open_count >=
            current.max_opens
        ) {
          return res.status(410).json({
            status: "opened",
            error:
              "This note has already reached its maximum number of openings"
          });
        }

        if (
          current &&
          isExpired(
            current.expires_at
          )
        ) {
          return res.status(410).json({
            status: "expired",
            error:
              "This note has expired"
          });
        }

        return res.status(409).json({
          error:
            "The note could not be opened"
        });
      }

      const consumedRow =
        consumed[0];

      let imageUrl = null;

      if (
        note.image_public_id &&
        note.image_format
      ) {
        imageUrl =
          await createImageUrl(
            note.image_public_id,
            note.image_format,
            note.expires_at
          );
      }

      const content =
        friendlyContent(
          payload
        );

      await supabase
        .from("note_access_logs")
        .insert({
          note_id: note.id,
          attempt_type: "read",
          success: true
        });

      return res.status(200).json({
        success: true,

        message:
          content.text || "",

        text:
          content.text,

        imageUrl,

        contentType:
          note.content_type || "text",

        senderName:
          note.sender_name || null,

        openCount:
          consumedRow.open_count,

        maxOpens:
          consumedRow.max_opens,

        remainingOpens:
          consumedRow.remaining_opens,

        fullyConsumed:
          consumedRow.open_count >=
          consumedRow.max_opens
      });
    }

    return res.status(405).json({
      error: "Method not allowed"
    });
  } catch (error) {
    console.error(
      "Read note error:",
      error
    );

    return res.status(500).json({
      error:
        "Something went wrong while processing the note"
    });
  }
}