import { createAIProvider, type AIProvider, type AIProviderConfig } from '@mindwtr/core';
import { loadMobileCompanionConfig } from './ai-config';

type CompanionOperation = 'clarify' | 'breakdown' | 'review' | 'metadata';

const DEFAULT_TIMEOUT_MS = 120_000;

function companionRequest<T extends object>(
    baseUrl: string,
    token: string,
    kind: CompanionOperation,
    input: object,
    signal?: AbortSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
    if (!/^https:\/\//i.test(baseUrl)) {
        return Promise.reject(new Error('Codex companion requires HTTPS. The bearer token was not sent.'));
    }
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/operations`;
    return new Promise<T>((resolve, reject) => {
        const controller = new AbortController();
        let timedOut = false;
        const onAbort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener('abort', onAbort, { once: true });
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);

        fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ kind, input }),
            signal: controller.signal,
        }).then(async (response) => {
            if (!response.ok) {
                throw new Error(`Codex companion request failed (${response.status}).`);
            }
            const body: unknown = await response.json();
            if (!body || typeof body !== 'object' || !('result' in body)
                || !body.result || typeof body.result !== 'object' || Array.isArray(body.result)) {
                throw new Error('Codex companion returned an invalid response.');
            }
            resolve(body.result as T);
        }).catch((error: unknown) => {
            if (timedOut) reject(new Error('Codex companion request timed out.'));
            else if (signal?.aborted) reject(new Error('Codex companion request was cancelled.'));
            else if (error instanceof Error && error.name === 'AbortError') reject(new Error('Codex companion request was cancelled.'));
            else reject(error instanceof Error ? error : new Error(String(error)));
        }).finally(() => {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
        });
    });
}

/** Mobile-only provider selection: a configured companion takes precedence over provider API keys. */
export async function createMobileAIProvider(
    config: AIProviderConfig,
): Promise<AIProvider> {
    const companion = await loadMobileCompanionConfig();
    if (!companion.enabled || !companion.baseUrl || !companion.token) return createAIProvider(config);
    if (!/^https:\/\//i.test(companion.baseUrl)) {
        throw new Error('Codex companion requires HTTPS. Configure an authenticated reverse proxy or private tunnel.');
    }
    const baseUrl = companion.baseUrl.replace(/\/+$/, '');
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return {
        clarifyTask: (input, options) => companionRequest(baseUrl, companion.token, 'clarify', input, options?.signal, timeoutMs),
        breakDownTask: (input, options) => companionRequest(baseUrl, companion.token, 'breakdown', input, options?.signal, timeoutMs),
        analyzeReview: (input, options) => companionRequest(baseUrl, companion.token, 'review', input, options?.signal, timeoutMs),
        predictMetadata: (input, options) => companionRequest(baseUrl, companion.token, 'metadata', input, options?.signal, timeoutMs),
    };
}

export async function testMobileCompanionConnection(): Promise<void> {
    const companion = await loadMobileCompanionConfig();
    if (!companion.enabled || !companion.baseUrl || !companion.token) {
        throw new Error('Save the URL and bearer token, then enable the Codex companion first.');
    }
    if (!/^https:\/\//i.test(companion.baseUrl)) throw new Error('Codex companion requires HTTPS.');
    await companionRequest<object>(companion.baseUrl.replace(/\/+$/, ''), companion.token, 'metadata', { title: 'Connection test' }, undefined, 20_000);
}
