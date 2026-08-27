import ShortUrl from "../models/url.model.js";
import { ClickQueueService } from "../services/queue.service.js";
import UrlService from "../services/url.service.js";

/**
 * Analytics Background Worker Class (Idempotent & Crash Resilient)
 * Features:
 * - At-Least-Once Delivery via Redis RPOPLPUSH reliable queue
 * - Idempotent Deduplication via Redis SET NX eventId locks
 * - Automatic Crash Recovery for stranded events
 * - Batch writes to MongoDB via bulkWrite()
 */
export class AnalyticsWorker {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 3000;
    this.batchSize = options.batchSize || 100;
    this.timer = null;
    this.isRunning = false;
    this.isProcessing = false;
  }

  /**
   * Starts periodic worker loop and runs crash recovery on boot
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Analytics Worker] Started idempotent background worker loop (Interval: ${this.intervalMs}ms, Batch Size: ${this.batchSize})`);

    // Step 1: Automatically recover any stranded events from previous worker crashes
    await ClickQueueService.recoverStrandedEvents();

    this.timer = setInterval(() => {
      this.processBatch().catch((err) => {
        console.error(`[Analytics Worker Error] Error processing batch: ${err.message}`);
      });
    }, this.intervalMs);
  }

  /**
   * Stops worker cleanly after flushing remaining events
   */
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log(`[Analytics Worker] Stopping worker... Processing final remaining events.`);
    await this.processBatch();
    console.log(`[Analytics Worker] Worker stopped cleanly.`);
  }

  /**
   * Batch Ingestion Process with Deduplication & Reliability:
   * 1. Pops reliable batch using RPOPLPUSH into processing queue
   * 2. Checks eventId deduplication lock (SET NX) to skip duplicate events
   * 3. Aggregates unique click counts by shortCode
   * 4. Flushes to MongoDB via bulkWrite()
   * 5. Acknowledges and removes processed batch from processing queue
   * 
   * @returns {Promise<{ processed: number, duplicates: number }>} Batch processing report
   */
  async processBatch() {
    if (this.isProcessing) return { processed: 0, duplicates: 0 };
    this.isProcessing = true;

    try {
      // 1. Pop reliable batch using RPOPLPUSH
      const { rawPayloads, events } = await ClickQueueService.popReliableBatch(this.batchSize);

      if (!events || events.length === 0) {
        this.isProcessing = false;
        return { processed: 0, duplicates: 0 };
      }

      const clickCountsMap = {};
      let uniqueCount = 0;
      let duplicateCount = 0;

      // 2. Perform Idempotent Deduplication Check for each event
      for (const event of events) {
        if (!event || !event.shortCode) continue;

        // Atomic deduplication check
        const isNewEvent = await ClickQueueService.claimEventId(event.eventId);

        if (isNewEvent) {
          clickCountsMap[event.shortCode] = (clickCountsMap[event.shortCode] || 0) + 1;
          uniqueCount++;
        } else {
          duplicateCount++;
          console.log(`[Analytics Worker] Skipped duplicate event: ${event.eventId} (shortCode: ${event.shortCode})`);
        }
      }

      const shortCodes = Object.keys(clickCountsMap);

      // 3. Execute MongoDB bulkWrite if new unique events exist
      if (shortCodes.length > 0) {
        const bulkOperations = shortCodes.map((shortCode) => ({
          updateOne: {
            filter: { short: shortCode },
            update: { $inc: { clicks: clickCountsMap[shortCode] } },
          },
        }));

        await ShortUrl.bulkWrite(bulkOperations, { ordered: false });

        // Refresh Redis cache for updated short codes
        for (const shortCode of shortCodes) {
          ShortUrl.findOne({ short: shortCode }).then((doc) => {
            if (doc) UrlService.cacheUrlDoc(doc);
          }).catch(() => {});
        }
      }

      // 4. Acknowledge and clear processing queue
      await ClickQueueService.acknowledgeBatch(rawPayloads);

      if (events.length > 0) {
        console.log(`[Analytics Worker] Batch Complete: ${uniqueCount} unique events written to DB, ${duplicateCount} duplicate events filtered out.`);
      }

      this.isProcessing = false;
      return { processed: uniqueCount, duplicates: duplicateCount };
    } catch (err) {
      console.error(`[Analytics Worker Error] Ingestion error: ${err.message}`);
      this.isProcessing = false;
      return { processed: 0, duplicates: 0 };
    }
  }
}

// Singleton worker instance
export const analyticsWorker = new AnalyticsWorker({ intervalMs: 3000, batchSize: 100 });
