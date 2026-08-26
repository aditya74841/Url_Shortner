import mongoose from "mongoose";
import { generateShortCode } from "../utils/idGenerator.js";

const urlSchema = new mongoose.Schema(
  {
    full: {
      type: String,
      required: [true, "Full URL is required"],
      trim: true,
    },
    short: {
      type: String,
      required: true,
      default: () => generateShortCode(7),
    },
    clicks: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Explicit DB Indexing Strategy for O(1) / O(log N) lookups & efficient sorting
urlSchema.index({ short: 1 }, { unique: true, name: "idx_short_code" });
urlSchema.index({ full: 1 }, { unique: true, name: "idx_full_url" });
urlSchema.index({ createdAt: -1 }, { name: "idx_created_at_desc" });

export default mongoose.model("ShortUrl", urlSchema);
