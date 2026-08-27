import crypto from "crypto";
import redis, { getIsRedisConnected } from "../config/redis.js";

const CLICK_QUEUE_NAME = "analytics:url_clicks_queue";
const PROCESSING_QUEUE_NAME = "analytics:url_clicks_processing";
const PROCESSED_EVENT_PREFIX = "processed_event:";
const DEDUP_TTL_SECONDS = 86400; // 24 Hours TTL for event deduplication

/**
 * Click Analytics Event Queue Service
 * Implements an idempotent producer-consumer queue with At-Least-Once delivery
 * and Redis RPOPLPUSH reliable queue processing.
 */
export class ClickQueueService {
  static QUEUE_NAME = CLICK_QUEUE_NAME;
  static PROCESSING_QUEUE = PROCESSING_QUEUE_NAME;

  /**
   * Producer: Pushes a click analytics event with a unique eventId
   * @param {Object} eventData
   * @param {string} [eventData.eventId] - Unique UUID for idempotency
   * @param {string} eventData.shortCode - Short URL identifier
   * @param {string} [eventData.ip] - Client IP address
   * @param {string} [eventData.userAgent] - Client User-Agent string
   * @param {number} [eventData.timestamp] - Epoch timestamp in milliseconds
   */
  static async pushClickEvent({ eventId, shortCode, ip = "unknown", userAgent = "unknown", requestId, timestamp = Date.now() }) {
    if (!getIsRedisConnected()) return;

    try {
      const payload = JSON.stringify({
        eventId: eventId || crypto.randomUUID(),
        shortCode,
        ip,
        userAgent,
        requestId,
        timestamp,
      });

      // LPUSH adds click event to the left side of the Redis List
      await redis.lpush(CLICK_QUEUE_NAME, payload);
    } catch (err) {
      console.warn(`[ClickQueue Warning] Failed to push click event: ${err.message}`);
    }
  }

  /**
   * Producer: Pushes multiple click analytics events in 1 Redis network operation
   * @param {Array<Object>} eventsList
   */
  static async pushBatchEvents(eventsList = []) {
    if (!getIsRedisConnected() || eventsList.length === 0) return;

    try {
      const payloads = eventsList.map((e) =>
        JSON.stringify({
          eventId: e.eventId || crypto.randomUUID(),
          shortCode: e.shortCode,
          ip: e.ip || "unknown",
          userAgent: e.userAgent || "unknown",
          requestId: e.requestId,
          timestamp: e.timestamp || Date.now(),
        })
      );
      await redis.lpush(CLICK_QUEUE_NAME, ...payloads);
    } catch (err) {
      console.warn(`[ClickQueue Warning] Failed to push batch events: ${err.message}`);
    }
  }

  /**
   * Consumer (Reliable Queue): Pops events using RPOPLPUSH into processing queue
   * Guarantees At-Least-Once delivery if worker crashes mid-batch.
   * @param {number} batchSize
   * @returns {Promise<{ rawPayloads: Array<string>, events: Array<Object> }>}
   */
  static async popReliableBatch(batchSize = 100) {
    if (!getIsRedisConnected()) return { rawPayloads: [], events: [] };

    try {
      const pipeline = redis.pipeline();
      for (let i = 0; i < batchSize; i++) {
        pipeline.rpoplpush(CLICK_QUEUE_NAME, PROCESSING_QUEUE_NAME);
      }

      const results = await pipeline.exec();
      const rawPayloads = [];
      const events = [];

      for (const [err, rawPayload] of results) {
        if (err || !rawPayload) continue;

        try {
          const parsed = JSON.parse(rawPayload);
          rawPayloads.push(rawPayload);
          events.push(parsed);
        } catch (e) {
          await redis.lrem(PROCESSING_QUEUE_NAME, 1, rawPayload);
        }
      }

      return { rawPayloads, events };
    } catch (err) {
      console.warn(`[ClickQueue Warning] Failed to pop reliable batch: ${err.message}`);
      return { rawPayloads: [], events: [] };
    }
  }

  /**
   * Checks if an eventId has already been processed (Deduplication Check)
   * Uses Redis SET NX with 24-hour TTL for atomic lock-free deduplication
   * @param {string} eventId
   * @returns {Promise<boolean>} True if newly claimed (not duplicate), False if duplicate
   */
  static async claimEventId(eventId) {
    if (!getIsRedisConnected() || !eventId) return true;
    try {
      const key = `${PROCESSED_EVENT_PREFIX}${eventId}`;
      // SET key 1 EX 86400 NX returns "OK" if key set successfully, null if key already existed
      const result = await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS, "NX");
      return result === "OK";
    } catch (err) {
      return true; // Default to process if Redis fails
    }
  }

  /**
   * High-Performance Pipelined Deduplication Check for a batch of eventIds in 1 network RTT
   * @param {Array<string>} eventIds
   * @returns {Promise<Array<boolean>>} Array of booleans (true if new, false if duplicate)
   */
  static async claimEventIdsBatch(eventIds = []) {
    if (!getIsRedisConnected() || eventIds.length === 0) return eventIds.map(() => true);
    try {
      const pipeline = redis.pipeline();
      for (const id of eventIds) {
        if (id) {
          const key = `${PROCESSED_EVENT_PREFIX}${id}`;
          pipeline.set(key, "1", "EX", DEDUP_TTL_SECONDS, "NX");
        } else {
          pipeline.ping(); // fallback placeholder
        }
      }
      const results = await pipeline.exec();
      return results.map(([err, res]) => !err && res === "OK");
    } catch (err) {
      return eventIds.map(() => true);
    }
  }

  /**
   * Cleans up processed event payloads from the processing queue after successful DB bulkWrite
   * @param {Array<string>} rawPayloads
   */
  static async acknowledgeBatch(rawPayloads = []) {
    if (!getIsRedisConnected() || rawPayloads.length === 0) return;

    try {
      const multi = redis.multi();
      for (const payload of rawPayloads) {
        multi.lrem(PROCESSING_QUEUE_NAME, 1, payload);
      }
      await multi.exec();
    } catch (err) {
      console.warn(`[ClickQueue Warning] Failed to acknowledge batch: ${err.message}`);
    }
  }

  /**
   * Crash Recovery: Re-queues stranded events from processing queue back to main queue
   * @returns {Promise<number>} Number of recovered stranded events
   */
  static async recoverStrandedEvents() {
    if (!getIsRedisConnected()) return 0;

    try {
      let count = 0;
      while (true) {
        // Move item back from processing queue to main queue
        const item = await redis.rpoplpush(PROCESSING_QUEUE_NAME, CLICK_QUEUE_NAME);
        if (!item) break;
        count++;
      }
      if (count > 0) {
        console.log(`[Queue Crash Recovery] Successfully recovered ${count} stranded events from processing queue.`);
      }
      return count;
    } catch (err) {
      console.warn(`[Queue Crash Recovery Error] ${err.message}`);
      return 0;
    }
  }

  /**
   * Queries total pending events in main queue
   */
  static async getQueueLength() {
    if (!getIsRedisConnected()) return 0;
    try {
      return await redis.llen(CLICK_QUEUE_NAME);
    } catch (err) {
      return 0;
    }
  }

  /**
   * Queries total stranded events in processing queue
   */
  static async getProcessingQueueLength() {
    if (!getIsRedisConnected()) return 0;
    try {
      return await redis.llen(PROCESSING_QUEUE_NAME);
    } catch (err) {
      return 0;
    }
  }

  /**
   * Clears queues and processed keys (Used in tests)
   */
  static async clearQueue() {
    if (!getIsRedisConnected()) return;
    await redis.del(CLICK_QUEUE_NAME);
    await redis.del(PROCESSING_QUEUE_NAME);
  }
}
