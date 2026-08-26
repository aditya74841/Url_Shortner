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
      unique: true,
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

export default mongoose.model("ShortUrl", urlSchema);
