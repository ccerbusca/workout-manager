import { isRunningInExpoGo } from 'expo';
import type * as NotificationsModule from 'expo-notifications';

/*
 * The "rest over" alert for when the app is in the background or the phone is locked.
 *
 * JS doesn't run while the app is backgrounded, so the app can't vibrate then. Instead, when rest
 * starts we schedule a local notification for the moment it ends; Android shows it (and vibrates,
 * via the channel's pattern) even with the screen off. When the app is open at that moment, the
 * handler below suppresses it, because the timer already vibrates in-app.
 *
 * Exact timing on Android needs the exact-alarm permission (USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM
 * in app.json); without it Android may delay the alert.
 *
 * Expo Go (SDK 57) doesn't ship all of expo-notifications' native modules, and merely importing the
 * package there throws ("Cannot find native module 'ExpoTopicSubscriptionModule'"), which took the
 * whole app down. So it's loaded lazily, only outside Expo Go; in Expo Go every function here is a
 * no-op and only the in-app vibration works. The installed APK has the native module built in.
 */

// null in Expo Go, or if loading fails for any other reason: the lock-screen alert is then skipped
const Notifications: typeof NotificationsModule | null = (() => {
  if (isRunningInExpoGo()) return null;
  try {
    return require('expo-notifications') as typeof NotificationsModule;
  } catch {
    return null;
  }
})();

// Channel settings are fixed once created on the phone, so a change needs a new id
const CHANNEL_ID = 'rest-timer-v1';
const VIBRATION = [0, 400, 200, 400, 200, 400];

Notifications?.setNotificationHandler({
  handleNotification: async (n) => {
    const isRest = n.request.content.data?.kind === 'rest';
    return {
      shouldShowBanner: !isRest,
      shouldShowList: !isRest,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

let ready: Promise<boolean> | null = null;
let scheduledId: string | null = null;

/** Creates the channel and asks for permission once (the first time rest starts). False if denied. */
function ensureReady(): Promise<boolean> {
  ready ??= (async () => {
    if (!Notifications) return false;
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Rest timer',
        description: 'Vibrates when your rest between sets is over',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: VIBRATION,
        enableVibrate: true,
        sound: null, // vibrate only
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      return (await Notifications.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  })();
  return ready;
}

// Operations run one after another, so quick ±15 s taps can't leave two alerts scheduled
let queue: Promise<void> = Promise.resolve();
const enqueue = (op: () => Promise<void>) => (queue = queue.then(op, op));

/** Schedules (or moves) the "rest over" alert to `endsAt` (epoch ms). */
export function scheduleRestEnd(endsAt: number): Promise<void> {
  return enqueue(async () => {
    await cancelNow();
    if (!Notifications || !(await ensureReady())) return;
    try {
      scheduledId = await Notifications.scheduleNotificationAsync({
        content: { title: 'Rest over', body: 'Time for your next set', data: { kind: 'rest' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: CHANNEL_ID },
      });
    } catch {
      scheduledId = null; // best effort: the in-app vibration still works
    }
  });
}

export function cancelRestEnd(): Promise<void> {
  return enqueue(cancelNow);
}

async function cancelNow(): Promise<void> {
  const id = scheduledId;
  scheduledId = null;
  if (id && Notifications) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
