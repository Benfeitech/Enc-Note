import { v2 as cloudinary } from "cloudinary";
import { randomBytes } from "node:crypto";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

function configureCloudinary() {
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

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    configureCloudinary();

    const timestamp = Math.floor(Date.now() / 1000);

    // Random folder prevents predictable public IDs.
    const uploadId = randomBytes(16).toString("hex");

    const publicId = `note-${uploadId}`;

    const uploadParams = {
      timestamp,
      public_id: publicId,
      asset_folder: "enc-note",
      type: "private",
      resource_type: "image"
    };

    const signature = cloudinary.utils.api_sign_request(
      uploadParams,
      apiSecret
    );

    return res.status(200).json({
      success: true,
      cloudName,
      apiKey,
      timestamp,
      signature,
      publicId,
      assetFolder: "enc-note",
      resourceType: "image",
      type: "private"
    });
  } catch (error) {
    console.error("Cloudinary signature error:", error);

    return res.status(500).json({
      error: "Could not prepare image upload"
    });
  }
}