import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIProviderConfig } from '@mindwtr/core';

const configMock = vi.hoisted(() => ({ enabled: true, baseUrl: 'https://companion.example/', token: 'secret-token' }));
vi.mock('./ai-config', () => ({ loadMobileCompanionConfig: vi.fn(async () => ({ ...configMock })) }));
const coreProviderMock = vi.hoisted(() => ({
    clarifyTask: vi.fn(), breakDownTask: vi.fn(), analyzeReview: vi.fn(), predictMetadata: vi.fn(),
}));
const createCoreProviderMock = vi.hoisted(() => vi.fn(() => coreProviderMock));
vi.mock('@mindwtr/core', () => ({ createAIProvider: createCoreProviderMock }));

import { createMobileAIProvider } from './mobile-ai-provider';

const config: AIProviderConfig = { provider: 'openai', apiKey: '', model: 'unused', timeoutMs: 2000 };

describe('mobile Codex companion adapter', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('maps all mobile provider operations to the authenticated companion contract', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ result: { question: 'What next?' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = await createMobileAIProvider(config);
        await provider.clarifyTask({ title: 'A' });
        await provider.breakDownTask({ title: 'B' });
        await provider.analyzeReview({ items: [] });
        await provider.predictMetadata({ title: 'D' });

        expect(fetchMock).toHaveBeenCalledTimes(4);
        const payloads = fetchMock.mock.calls.map(([url, init]) => {
            expect(url).toBe('https://companion.example/v1/operations');
            expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' });
            return JSON.parse(String(init?.body));
        });
        expect(payloads).toEqual([
            { kind: 'clarify', input: { title: 'A' } },
            { kind: 'breakdown', input: { title: 'B' } },
            { kind: 'review', input: { items: [] } },
            { kind: 'metadata', input: { title: 'D' } },
        ]);
    });

    it('reports host status and invalid result errors without returning success-shaped fallbacks', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('failed', { status: 401 })));
        const provider = await createMobileAIProvider(config);
        await expect(provider.clarifyTask({ title: 'A' })).rejects.toThrow('Codex companion request failed (401)');

        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result: [] }), { status: 200 })));
        await expect(provider.clarifyTask({ title: 'A' })).rejects.toThrow('Codex companion returned an invalid response.');
    });

    it('uses the configured AI provider unless the companion is explicitly enabled and credentialed', async () => {
        createCoreProviderMock.mockClear();
        configMock.enabled = false;
        const provider = await createMobileAIProvider(config);
        expect(createCoreProviderMock).toHaveBeenCalledOnce();
        expect(provider).toBe(coreProviderMock);
        configMock.enabled = true;
    });
});
