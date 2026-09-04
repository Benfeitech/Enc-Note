import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const supabaseUrl =
  process.env.SUPABASE_URL;

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseClient() {
  if (
    !supabaseUrl ||
    !supabaseServiceKey
  ) {
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

function hashToken(token) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

function isExpired(expiresAt) {
  return (
    new Date(
      expiresAt
    ).getTime() <= Date.now()
  );
}

function getStatus(note) {
  if (
    note.open_count >=
    note.max_opens
  ) {
    return "consumed";
  }

  if (
    isExpired(
      note.expires_at
    )
  ) {
    return "expired";
  }

  if (
    note.open_count > 0
  ) {
    return "opened";
  }

  return "unopened";
}

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Content-Type",
    "application/json"
  );

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const token =
      String(
        req.query?.token || ""
      ).trim();

    if (
      !token ||
      token.length < 32
    ) {
      return res.status(404).json({
        error: "Status page not found"
      });
    }

    const tokenHash =
      hashToken(token);

    const supabase =
      createSupabaseClient();

    const {
      data: note,
      error
    } = await supabase
      .from("notes")
      .select(
        [
          "sender_name",
          "expires_at",
          "created_at",
          "opened_at",
          "max_opens",
          "open_count",
          "content_type",
          "password_protected"
        ].join(",")
      )
      .eq(
        "sender_status_token_hash",
        tokenHash
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!note) {
      return res.status(404).json({
        error: "Status page not found"
      });
    }

    const remainingOpens =
      Math.max(
        note.max_opens -
          note.open_count,
        0
      );

    return res.status(200).json({
      success: true,

      status:
        getStatus(note),

      senderName:
        note.sender_name || null,

      createdAt:
        note.created_at || null,

      openedAt:
        note.opened_at || null,

      expiresAt:
        note.expires_at,

      maxOpens:
        note.max_opens,

      openCount:
        note.open_count,

      remainingOpens,

      contentType:
        note.content_type,

      passwordProtected:
        Boolean(
          note.password_protected
        )
    });
  } catch (error) {
    console.error(
      "Status error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to load note status"
    });
  }
}