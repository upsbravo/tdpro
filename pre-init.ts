import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load local environment variables from .env if present
dotenv.config();

try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.projectId) {
      process.env.GOOGLE_CLOUD_PROJECT = config.projectId;
      process.env.GOOGLE_CLOUD_QUOTA_PROJECT = config.projectId;
      process.env.GCLOUD_PROJECT = config.projectId;
      console.log("[Pre-Init] Set GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_QUOTA_PROJECT, and GCLOUD_PROJECT to:", config.projectId);
    }
  }
} catch (err) {
  console.error("[Pre-Init] Failed to load config in pre-init:", err);
}
