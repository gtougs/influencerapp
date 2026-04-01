/**
 * Daily workout notification worker.
 * Schedules BullMQ repeatable jobs that fire at 8 AM per influencer's subscribers.
 *
 * For each timezone bucket, we compute what UTC time corresponds to 8 AM local
 * and schedule a cron job for that UTC time.
 *
 * Simplified approach: run a single job every hour, check which influencers have
 * subscribers whose local time is 8 AM ± 30 minutes, and send those notifications.
 * This avoids per-timezone job proliferation.
 */

import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { sendDailyWorkoutNotifications } from '../services/notifications.service.js';

const DAILY_WORKOUT_QUEUE = 'daily-workout-check';

export function startDailyWorkoutScheduler(redis: Redis, db: any): void {
  const queue = new Queue(DAILY_WORKOUT_QUEUE, { connection: redis });

  // Schedule a check every hour
  queue.add(
    'check',
    {},
    {
      repeat: { pattern: '0 * * * *' }, // every hour at :00
      removeOnComplete: 10,
      removeOnFail: 50,
    }
  );

  // Worker that runs the hourly check
  new Worker(
    DAILY_WORKOUT_QUEUE,
    async () => {
      const now = new Date();

      // Find all distinct timezones of active subscribers
      const timezones = await db`
        SELECT DISTINCT a.timezone
        FROM accounts a
        JOIN subscriptions s ON s.account_id = a.id
        WHERE s.status IN ('active', 'trialing') AND s.influencer_id IS NOT NULL
      `;

      for (const { timezone } of timezones) {
        // Check if it's 8 AM ± 30 min in this timezone
        const localHour = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getHours();
        const localMinute = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getMinutes();
        const isMorning = localHour === 8 && localMinute < 60; // within the 8 AM hour
        if (!isMorning) continue;

        const localDayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getDay();

        // Find influencers who have subscribers in this timezone with an active daily schedule
        const influencers = await db`
          SELECT DISTINCT ds.influencer_id
          FROM daily_schedule ds
          JOIN subscriptions s ON s.influencer_id = ds.influencer_id
          JOIN accounts a ON a.id = s.account_id
          WHERE ds.day_of_week = ${localDayOfWeek}
            AND ds.is_active = true
            AND s.status IN ('active', 'trialing')
            AND a.timezone = ${timezone}
        `;

        for (const { influencer_id } of influencers) {
          await sendDailyWorkoutNotifications(db, influencer_id, localDayOfWeek);
        }
      }
    },
    { connection: redis }
  );
}
