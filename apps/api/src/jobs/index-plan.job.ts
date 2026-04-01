import { Queue, Worker, Job } from 'bullmq';
import type Redis from 'ioredis';

export const INDEX_PLAN_QUEUE = 'index-plan';
export const DAILY_NOTIFICATIONS_QUEUE = 'daily-notifications';

export interface IndexPlanJobData {
  planId: string;
  influencerId: string;
}

export interface DailyNotificationJobData {
  influencerId: string;
  dayOfWeek: number; // 0-6
}

export function createIndexPlanQueue(connection: Redis): Queue<IndexPlanJobData> {
  return new Queue<IndexPlanJobData>(INDEX_PLAN_QUEUE, { connection });
}

export function createDailyNotificationsQueue(connection: Redis): Queue<DailyNotificationJobData> {
  return new Queue<DailyNotificationJobData>(DAILY_NOTIFICATIONS_QUEUE, { connection });
}

export async function enqueueIndexPlan(
  queue: Queue<IndexPlanJobData>,
  data: IndexPlanJobData
): Promise<void> {
  await queue.add('index', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
}
