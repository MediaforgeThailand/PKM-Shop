import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabaseConfigStatus = {
  isConfigured: Boolean(supabaseUrl && supabasePublishableKey),
  message:
    supabaseUrl && supabasePublishableKey
      ? 'The mobile client can connect using public Supabase credentials.'
      : 'Create a .env file from .env.example before calling Supabase APIs.',
};

export const supabase = createClient(supabaseUrl ?? 'https://placeholder.supabase.co', supabasePublishableKey ?? 'placeholder', {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: secureStoreAdapter } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
