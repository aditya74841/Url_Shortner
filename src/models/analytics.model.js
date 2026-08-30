import mongoose from "mongoose";

const urlAnalyticsSchema = new mongoose.Schema(
  {
    short: {
      type: String,
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    ip: {
      type: String,
      default: "127.0.0.1",
    },
    browser: {
      type: String,
      default: "Other",
      index: true,
    },
    os: {
      type: String,
      default: "Other",
      index: true,
    },
    device: {
      type: String,
      default: "Desktop",
    },
    referrer: {
      type: String,
      default: "Direct / None",
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast time-series aggregation per short URL
urlAnalyticsSchema.index({ short: 1, timestamp: -1 }, { name: "idx_short_timestamp" });

const UrlAnalytics = mongoose.model("UrlAnalytics", urlAnalyticsSchema);

export default UrlAnalytics;
