import redis, { getIsRedisConnected } from "../config/redis.js";

const CLICK_QUEUE_NAME = "analytics:url_clicks_queue";

/**
 * Click Analytics Event Queue Service
 * Implements an asynchronous producer-consumer message queue using Redis Lists (LPUSH / RPOP).
 */
export class ClickQueueService {
  static QUEUE_NAME = CLICK_QUEUE_NAME;

  /**
   * Producer: Pushes a click analytics event onto the Redis Queue
   * @param {Object} eventData
   * @param {string} eventData.shortCode - Short URL identifier
   * @param {string} [eventData.ip] - Client IP address
   * @param {string} [eventData.userAgent] - Client User-Agent string
   * @param {number} [eventData.timestamp] - Epoch timestamp in milliseconds
   */
  static async pushClickEvent({ shortCode, ip = "unknown", userAgent = "unknown", timestamp = Date.now() }) {
    if (!getIsRedisConnected()) return;

    try {
      const payload = JSON.stringify({
        shortCode,
        ip,
        userAgent,
        timestamp,
      });

      // LPUSH adds click event to the left side of the Redis List (FIFO Queue)
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
      const payloads = eventsList.map((e) => JSON.stringify(e));
      await redis.lpush(CLICK_QUEUE_NAME, ...payloads);
    } catch (err) {
      console.warn(`[ClickQueue Warning] Failed to push batch events: ${err.message}`);
    }
  }

  /**
   * Queries the current total pending events in the Redis Queue
   * @returns {Promise<number>} Queue length
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
   * Consumer: Pops up to `batchSize` events from the right side of the Redis List (RPOP)
   * @param {number} batchSize - Maximum number of events to pull
   * @returns {Promise<Array<Object>>} Array of parsed click events
   */
  static async popBatchEvents(batchSize = 100) {
    if (!getIsRedisConnected()) return [];

    try {
      const multi = redis.multi();
      for (let i = 0; i < batchSize; i++) {
        multi.rpop(CLICK_QUEUE_NAME);
      }
      
      const results = await multi.exec();
      const events = [];

      for (const [err, payload] of results) {
        if (!err && payload) {
          try {
            events.push(JSON.parse(payload));
          } catch (e) {
            // Ignore parse errors for malformed events
          }
        }
      }

      return events;
    } catch (err) {
      console.warn(`[ClickQueue Warning] Failed to pop batch events: ${err.message}`);
      return [];
    }
  }

  /**
   * Clears all pending events from the queue (Used during tests/resets)
   */
  static async clearQueue() {
    if (!getIsRedisConnected()) return;
    await redis.del(CLICK_QUEUE_NAME);
  }
}
