// The reader's API keys live in the phone's secure storage (iOS Keychain /
// Android Keystore) via expo-secure-store — never in AsyncStorage, never in
// the data export, never logged. One slot per provider, so switching provider
// doesn't lose the other key.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { useSettings } from '../state/settings';
import type { AiConfig, Provider } from './types';

const slot = (p: Provider) => `comicpill.ai.key.${p}`;

const read = async (p: Provider): Promise<string | null> => {
  try { return (await SecureStore.getItemAsync(slot(p))) || null; } catch { return null; }
};

interface KeyState {
  keys: Record<Provider, string | null>;
  loaded: boolean;
  load: () => Promise<void>;
  save: (p: Provider, key: string) => Promise<void>;
  remove: (p: Provider) => Promise<void>;
}

export const useKeyStore = create<KeyState>((set, get) => ({
  keys: { anthropic: null, openai: null },
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    const [anthropic, openai] = await Promise.all([read('anthropic'), read('openai')]);
    set({ keys: { anthropic, openai }, loaded: true });
  },
  save: async (p, key) => {
    await SecureStore.setItemAsync(slot(p), key);
    set((s) => ({ keys: { ...s.keys, [p]: key } }));
  },
  remove: async (p) => {
    await SecureStore.deleteItemAsync(slot(p)).catch(() => undefined);
    set((s) => ({ keys: { ...s.keys, [p]: null } }));
  },
}));

/** The active provider + model + that provider's key, or null if no key is saved. */
export function getAiConfig(): AiConfig | null {
  const { aiProvider, aiModel } = useSettings.getState();
  const apiKey = useKeyStore.getState().keys[aiProvider];
  return apiKey ? { provider: aiProvider, model: aiModel, apiKey } : null;
}
