/**
 * Expo Push Notification service.
 * Sends push notifications via the Expo Push API.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

export interface PushMessage {
  to: string;          // Expo push token
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Expo accepts up to 100 notifications per request
  const chunks = chunkArray(messages, 100);

  for (const chunk of chunks) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(chunk),
    });
    // Fire-and-forget: don't block on notification delivery
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sends the daily 8 AM workout notification to all users subscribed to an influencer.
 * Called by BullMQ daily scheduler.
 */
export async function sendDailyWorkoutNotifications(
  db: any,
  influencerId: string,
  dayOfWeek: number
): Promise<void> {
  // Get the schedule entry for this day
  const [schedule] = await db`
    SELECT ds.*, v.title AS video_title, v.thumbnail_url
    FROM daily_schedule ds
    LEFT JOIN videos v ON v.id = ds.video_id
    WHERE ds.influencer_id = ${influencerId}
      AND ds.day_of_week = ${dayOfWeek}
      AND ds.is_active = true
  `;

  if (!schedule) return;

  // Get influencer info for the notification
  const [influencer] = await db`
    SELECT ip.handle, a.display_name
    FROM influencer_profiles ip
    JOIN accounts a ON a.id = ip.account_id
    WHERE ip.id = ${influencerId}
  `;

  if (!influencer) return;

  // Get push tokens for all active subscribers
  const tokens = await db`
    SELECT pt.token, pt.platform
    FROM push_tokens pt
    JOIN subscriptions s ON s.account_id = pt.account_id
    WHERE s.influencer_id = ${influencerId}
      AND s.status IN ('active', 'trialing')
  `;

  if (tokens.length === 0) return;

  const messages: PushMessage[] = tokens.map((t: { token: string }) => ({
    to: t.token,
    title: `${influencer.display_name}'s workout is ready 💪`,
    body: schedule.title,
    sound: 'default',
    data: {
      type: 'daily_workout',
      influencerId,
      scheduleId: schedule.id,
      videoId: schedule.video_id ?? null,
      planId: schedule.plan_id ?? null,
    },
  }));

  await sendPushNotifications(messages);
}
