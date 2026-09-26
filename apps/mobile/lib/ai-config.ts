import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AIProviderConfig, AIProviderId, AppData } from '@mindwtr/core';
import { buildAIConfig as buildCoreAIConfig, buildCopilotConfig as buildCoreCopilotConfig, getAIKeyStorageKey, isSandboxMode, loadAIKeyFromStorage, saveAIKeyToStorage } from '@mindwtr/core';
import { logInfo } from './app-log';

import {
    deleteSessionSecret,
    evacuateLegacySecretToSession,
    getSessionSecret,
    isSecureStoreAvailable,
    setSessionSecret,
} from './secure-secret-store';

const MOBILE_COMPANION_URL_KEY = 'mindwtr-codex-companion-url';
const MOBILE_COMPANION_TOKEN_KEY = 'mindwtr-codex-companion-token';
const MOBILE_COMPANION_ENABLED_KEY = 'mindwtr-codex-companion-enabled';

export type MobileCompanionConfig = { baseUrl: string; token: string; enabled: boolean };

export async function loadMobileCompanionConfig(): Promise<MobileCompanionConfig> {
    const baseUrl = (await AsyncStorage.getItem(MOBILE_COMPANION_URL_KEY))?.trim().replace(/\/+$/, '') ?? '';
    let token = '';
    if (await isSecureStoreAvailable()) {
        token = (await SecureStore.getItemAsync(MOBILE_COMPANION_TOKEN_KEY)) ?? '';
    } else {
        token = getSessionSecret(MOBILE_COMPANION_TOKEN_KEY) ?? '';
    }
    const enabled = (await AsyncStorage.getItem(MOBILE_COMPANION_ENABLED_KEY)) === 'true';
    return { baseUrl, token, enabled };
}

export async function saveMobileCompanionConfig(config: MobileCompanionConfig): Promise<void> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    const token = config.token.trim();
    if (baseUrl) await AsyncStorage.setItem(MOBILE_COMPANION_URL_KEY, baseUrl);
    else await AsyncStorage.removeItem(MOBILE_COMPANION_URL_KEY);
    await AsyncStorage.setItem(MOBILE_COMPANION_ENABLED_KEY, config.enabled ? 'true' : 'false');
    if (await isSecureStoreAvailable()) {
        if (token) await SecureStore.setItemAsync(MOBILE_COMPANION_TOKEN_KEY, token, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        else await SecureStore.deleteItemAsync(MOBILE_COMPANION_TOKEN_KEY);
        deleteSessionSecret(MOBILE_COMPANION_TOKEN_KEY);
    } else if (token) {
        setSessionSecret(MOBILE_COMPANION_TOKEN_KEY, token);
    } else {
        deleteSessionSecret(MOBILE_COMPANION_TOKEN_KEY);
    }
}

export async function isMobileCompanionConfigured(): Promise<boolean> {
    const config = await loadMobileCompanionConfig();
    return Boolean(config.enabled && config.baseUrl && config.token);
}

const getSecureKey = (provider: AIProviderId) => {
    return getAIKeyStorageKey(provider).replace(/[^A-Za-z0-9._-]/g, '_');
};

export async function loadAIKey(provider: AIProviderId): Promise<string> {
    if (isSandboxMode()) return '';
    const key = getSecureKey(provider);
    if (await isSecureStoreAvailable()) {
        const value = await SecureStore.getItemAsync(key);
        if (value) {
            await saveAIKeyToStorage(AsyncStorage, provider, '');
            return value;
        }

        const legacyValue = await loadAIKeyFromStorage(AsyncStorage, provider);
        if (legacyValue) {
            await SecureStore.setItemAsync(key, legacyValue, {
                keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            });
            await saveAIKeyToStorage(AsyncStorage, provider, '');
        }
        return legacyValue;
    }

    const sessionValue = getSessionSecret(key);
    if (sessionValue !== null) return sessionValue;

    const legacyValue = await loadAIKeyFromStorage(AsyncStorage, provider);
    if (legacyValue) {
        await evacuateLegacySecretToSession(
            key,
            legacyValue,
            () => saveAIKeyToStorage(AsyncStorage, provider, ''),
        );
    }
    return legacyValue;
}

export async function saveAIKey(provider: AIProviderId, value: string): Promise<void> {
    if (isSandboxMode()) return;
    const key = getSecureKey(provider);
    if (await isSecureStoreAvailable()) {
        if (!value) {
            await SecureStore.deleteItemAsync(key);
        } else {
            await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        }
        await saveAIKeyToStorage(AsyncStorage, provider, '');
        deleteSessionSecret(key);
        return;
    }

    await saveAIKeyToStorage(AsyncStorage, provider, '');
    if (value) {
        setSessionSecret(key, value);
    } else {
        deleteSessionSecret(key);
    }
}

export function isAIKeyRequired(settings: AppData['settings'] | undefined): boolean {
    if (isSandboxMode()) return false;
    const config = buildCoreAIConfig(settings ?? {}, '');
    return !(config.provider === 'openai' && Boolean(config.endpoint));
}

const withRequestDiagnostics = (config: AIProviderConfig): AIProviderConfig => ({
    ...config,
    onRequestStop: (reason) => {
        void logInfo('AI request stopped without retry', {
            scope: 'ai',
            extra: {
                releaseCheck: 'v1.3.0/ai-request-stop-once',
                outcome: reason,
                provider: config.provider,
                timeoutMs: config.timeoutMs,
            },
        }).catch(() => undefined);
    },
});

export function buildAIConfig(settings: AppData['settings'], apiKey: string): AIProviderConfig {
    if (isSandboxMode()) throw new Error('Unavailable in sandbox');
    return withRequestDiagnostics(buildCoreAIConfig(settings, apiKey));
}

export function buildCopilotConfig(settings: AppData['settings'], apiKey: string): AIProviderConfig {
    if (isSandboxMode()) throw new Error('Unavailable in sandbox');
    return withRequestDiagnostics(buildCoreCopilotConfig(settings, apiKey));
}
