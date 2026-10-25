import { useEffect } from 'react';
import { useSettings } from '../state/settings';
import { useKeyStore } from './keyStore';
import type { AiConfig, Provider } from './types';

/** Live view of the AI setup: which provider/model, whether a key is saved,
 *  and the ready-to-use config (null until there is a key). */
export function useAiConfig(): { provider: Provider; model: string; key: string | null; loaded: boolean; config: AiConfig | null } {
  const provider = useSettings((s) => s.aiProvider);
  const model = useSettings((s) => s.aiModel);
  const keys = useKeyStore((s) => s.keys);
  const loaded = useKeyStore((s) => s.loaded);
  useEffect(() => { void useKeyStore.getState().load(); }, []);
  const key = keys[provider];
  return { provider, model, key, loaded, config: key ? { provider, model, apiKey: key } : null };
}
