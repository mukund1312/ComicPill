// Renders nothing. Keeps Mind Space current: registers the background job, syncs when the app opens or returns to the
// foreground, and sends a tapped digest notification to the Digest screen.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { getNotifications } from '../../lib/platform/notificationsModule';
import { getMindSettings } from '../../lib/mind/settings';
import { syncMind } from '../../lib/mind/sync';
import { syncMindTask } from '../../lib/mind/task';

export default function MindSync() {
  const running = useRef(false);

  useEffect(() => {
    const run = async () => {
      const s = getMindSettings();
      if (running.current || (!s.watching && !s.digestEnabled)) return;
      running.current = true;
      try { await syncMind(); await syncMindTask(); } catch { /* next foreground tries again */ } finally { running.current = false; }
    };
    void run();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void run(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const N = getNotifications();
    if (!N) return;
    const sub = N.addNotificationResponseReceivedListener((resp) => {
      const route = (resp.notification.request.content.data as { route?: string } | undefined)?.route;
      if (route === '/mind/digest') router.push('/mind/digest');
    });
    return () => sub.remove();
  }, []);

  return null;
}
