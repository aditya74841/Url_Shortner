import ShortUrl from "../models/url.model.js";
import { ClickQueueService } from "../services/queue.service.js";
import UrlService from "../services/url.service.js";

/**
 * Analytics Background Worker Class
 * Consumes click events from Redis Queue, aggregates click counts in memory,
 * and executes high-throughput batch writes to MongoDB using bulkWrite().
 */
export class AnalyticsWorker {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 3000; // Poll interval (default 3 sec)
    this.batchSize = options.batchSize || 100;    // Max events per batch
    this.timer = null;
    this.isRunning = false;
    this.isProcessing = false;
  }

  /**
   * Starts the periodic background worker loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Analytics Worker] Started background worker loop (Interval: ${this.intervalMs}ms, Batch Size: ${this.batchSize})`);

    this.timer = setInterval(() => {
      this.processBatch().catch((err) => {
        console.error(`[Analytics Worker Error] Error processing batch: ${err.message}`);
      });
    }, this.intervalMs);
  }

  /**
   * Stops the worker loop gracefully
   */
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log(`[Analytics Worker] Stopping worker... Processing final remaining events.`);
    
    // Process any remaining events in queue before shutting down
    await this.processBatch();
    console.log(`[Analytics Worker] Worker stopped cleanly.`);
  }

  /**
   * Single Batch Processing Step:
   * 1. Pops up to `batchSize` events from Redis Queue (RPOP)
   * 2. Groups click counts by shortCode in memory
   * 3. Executes single MongoDB bulkWrite()
   * 4. Updates Redis Cache entries for modified URLs
   * 
   * @returns {Promise<number>} Number of processed click events
   */
  async processBatch() {
    // Avoid overlapping execution if previous batch processing is still in-flight
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      // 1. Pop batch of events from Redis Queue
      const events = await ClickQueueService.popBatchEvents(this.batchSize);

      if (!events || events.length === 0) {
        this.isProcessing = false;
        return 0;
      }

      // 2. Aggregate click counts by shortCode in memory
      // Example: { "D1MaHG9": 45, "aB3x9K2": 55 }
      const clickCountsMap = {};
      for (const event of events) {
        if (event && event.shortCode) {
          clickCountsMap[event.shortCode] = (clickCountsMap[event.shortCode] || 0) + 1;
        }
      }

      const shortCodes = Object.keys(clickCountsMap);
      if (shortCodes.length === 0) {
        this.isProcessing = false;
        return 0;
      }

      // 3. Prepare MongoDB bulkWrite operations array
      const bulkOperations = shortCodes.map((shortCode) => ({
        updateOne: {
          filter: { short: shortCode },
          update: { $inc: { clicks: clickCountsMap[shortCode] } },
        },
      }));

      // 4. Execute single bulkWrite command against MongoDB
      const bulkResult = await ShortUrl.bulkWrite(bulkOperations, { ordered: false });

      // 5. Asynchronously refresh Redis cache for updated short codes
      for (const shortCode of shortCodes) {
        ShortUrl.findOne({ short: shortCode }).then((doc) => {
          if (doc) UrlService.cacheUrlDoc(doc);
        }).catch(() => {});
      }

      console.log(`[Analytics Worker] Processed ${events.length} click events across ${shortCodes.length} short URLs via MongoDB bulkWrite.`);

      this.isProcessing = false;
      return events.length;
    } catch (err) {
      console.error(`[Analytics Worker Error] Ingestion error: ${err.message}`);
      this.isProcessing = false;
      return 0;
    }
  }
}

// Singleton worker instance
export const analyticsWorker = new AnalyticsWorker({ intervalMs: 3000, batchSize: 100 });
