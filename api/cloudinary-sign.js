import { v2 as cloudinary } from "cloudinary";
import { randomBytes } from "node:crypto";

const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME;

const apiKey =
  process.env.CLOUDINARY_API_KEY;

const apiSecret =
  process.env.CLOUDINARY_API_SECRET;

function configureCloudinary() {
  if (
    !cloudName ||
    !apiKey ||
    !apiSecret
  ) {
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

export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "application/json"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    configureCloudinary();

    const timestamp =
      Math.floor(Date.now() / 1000);

    const randomId =
      randomBytes(16).toString("hex");

    /*
     * IMPORTANT:
     * These are the ONLY parameters we sign.
     * The frontend must send these exact values.
     */
    const publicId =
      `note-${randomId}`;

    const assetFolder =
      "enc-note";

    const type =
      "private";

    const paramsToSign = {
      asset_folder: assetFolder,
      public_id: publicId,
      timestamp,
      type
    };

    const signature =
      cloudinary.utils.api_sign_request(
        paramsToSign,
        apiSecret
      );

    return res.status(200).json({
      success: true,

      cloudName,

      apiKey,

      timestamp,

      signature,

      publicId,

      assetFolder,

      type,

      maxFileSize:
        5 * 1024 * 1024,

      allowedFormats: [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "gif"
      ]
    });
  } catch (error) {
    console.error(
      "Cloudinary signing error:",
      error
    );

    return res.status(500).json({
      error:
        "Could not prepare image upload"
    });
  }
}