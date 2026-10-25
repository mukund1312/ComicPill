import { Redirect } from 'expo-router';

// Notification taps land here; the digest is the first tab of Mind Space.
export default function DigestRoute() {
  return <Redirect href="/mind?tab=digest" />;
}
