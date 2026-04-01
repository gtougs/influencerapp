import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(token: string): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const expoPushToken = await Notifications.getExpoPushTokenAsync();

  await api.post('/v1/push/register', {
    token: expoPushToken.data,
    platform: Platform.OS as 'ios' | 'android',
  }, token);
}

export function useDailyWorkoutNotification(
  onNotification: (data: { influencerId: string; videoId?: string; planId?: string }) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as any;
    if (data?.type === 'daily_workout') {
      onNotification({
        influencerId: data.influencerId,
        videoId: data.videoId,
        planId: data.planId,
      });
    }
  });
}
