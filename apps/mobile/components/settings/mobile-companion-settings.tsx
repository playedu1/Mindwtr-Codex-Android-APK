import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import type { ThemeColors } from '@/hooks/use-theme-colors';
import { loadMobileCompanionConfig, saveMobileCompanionConfig } from '@/lib/ai-config';
import { testMobileCompanionConnection } from '@/lib/mobile-ai-provider';
import { useLanguage } from '@/contexts/language-context';
import { styles } from './settings.styles';

export function MobileCompanionSettings({ tc }: { tc: ThemeColors }) {
    const { language } = useLanguage();
    const pt = language === 'pt';
    const [baseUrl, setBaseUrl] = useState('');
    const [token, setToken] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        let active = true;
        void loadMobileCompanionConfig().then((config) => {
            if (!active) return;
            setBaseUrl(config.baseUrl);
            setToken(config.token);
            setEnabled(config.enabled);
        }).catch(() => undefined);
        return () => { active = false; };
    }, []);

    const save = async (nextEnabled = enabled) => {
        const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
        if (nextEnabled && (!cleanUrl || !token.trim())) {
            Alert.alert(pt ? 'Dados de conexão necessários' : 'Connection details needed', pt
                ? 'Informe a URL do servidor e o token de acesso, depois salve para ativar.'
                : 'Enter the companion base URL and bearer token, then save before enabling it.');
            return;
        }
        if (cleanUrl && !/^https:\/\//i.test(cleanUrl)) {
            Alert.alert(pt ? 'HTTPS obrigatório' : 'HTTPS required', pt
                ? 'Use uma URL HTTPS por um proxy autenticado ou túnel privado. O token nunca é enviado por HTTP.'
                : 'Use an HTTPS URL through an authenticated reverse proxy or private tunnel. The companion token is never sent over HTTP.');
            return;
        }
        setSaving(true);
        try {
            await saveMobileCompanionConfig({ baseUrl: cleanUrl, token, enabled: nextEnabled });
            setEnabled(nextEnabled);
        } catch {
            Alert.alert(pt ? 'Falha ao salvar a conexão' : 'Could not save connection', pt
                ? 'Verifique o armazenamento seguro do celular e tente novamente.'
                : 'Check device secure storage and try again.');
        } finally {
            setSaving(false);
        }
    };

    const testConnection = async () => {
        setTesting(true);
        try {
            await testMobileCompanionConnection();
            Alert.alert(pt ? 'Conexão bem-sucedida' : 'Connection succeeded', pt
                ? 'O servidor respondeu à solicitação de teste.'
                : 'The host returned a valid companion response.');
        } catch (error) {
            Alert.alert(pt ? 'Falha na conexão' : 'Connection failed', error instanceof Error ? error.message : String(error));
        } finally {
            setTesting(false);
        }
    };

    return (
        <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 14 }]}>
            <View style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: tc.border }]}>
                <View style={styles.settingInfo}>
                    <Text style={[styles.settingLabel, { color: tc.text }]}>{pt ? 'Codex pessoal (Android)' : 'Codex companion (Android)'}</Text>
                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>{pt
                        ? 'Conecte-se ao seu servidor Codex por HTTPS. Entre com sua conta ChatGPT no servidor e mantenha o assistente de IA acima ativado.'
                        : 'Connect to your personal Codex companion over HTTPS. Sign in to Codex on the host; this phone does not use ChatGPT OAuth. Keep the AI assistant switch above enabled to use these features.'}</Text>
                </View>
                <Switch value={enabled} disabled={saving} onValueChange={(value) => { void save(value); }} />
            </View>
            <View style={{ padding: 16, gap: 8 }}>
                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>{pt ? 'URL do servidor' : 'Companion base URL'}</Text>
                <TextInput
                    accessibilityLabel={pt ? 'URL do servidor Codex' : 'Codex companion base URL'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="https://your-host.example"
                    placeholderTextColor={tc.secondaryText}
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    style={{ color: tc.text, borderColor: tc.border, borderWidth: 1, borderRadius: 8, padding: 12 }}
                />
                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>{pt ? 'Token de acesso' : 'Bearer token'}</Text>
                <TextInput
                    accessibilityLabel={pt ? 'Token de acesso do servidor Codex' : 'Codex companion bearer token'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    placeholder={pt ? 'Cole o token' : 'Paste token'}
                    placeholderTextColor={tc.secondaryText}
                    value={token}
                    onChangeText={setToken}
                    style={{ color: tc.text, borderColor: tc.border, borderWidth: 1, borderRadius: 8, padding: 12 }}
                />
                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>{pt
                    ? 'Use a URL HTTPS do servidor por um proxy autenticado ou túnel privado. O token fica no armazenamento seguro do celular. Cada ação envia os dados necessários da tarefa ao servidor. O teste faz uma solicitação real ao Codex.'
                    : 'Use the host’s HTTPS URL through an authenticated reverse proxy or private tunnel. The token is kept in device secure storage. Task and review data go to the host for each requested action. Testing sends a small metadata request to the companion and may use its model.'}</Text>
                <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => { void save(); }}
                    style={{ alignSelf: 'flex-start', borderRadius: 8, backgroundColor: tc.tint, paddingHorizontal: 16, paddingVertical: 10, opacity: saving ? 0.6 : 1 }}
                >
                    <Text style={{ color: tc.onTint, fontWeight: '600' }}>{saving ? (pt ? 'Salvando…' : 'Saving…') : (pt ? 'Salvar conexão' : 'Save connection')}</Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    disabled={testing}
                    onPress={() => { void testConnection(); }}
                    style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 10, opacity: testing ? 0.6 : 1 }}
                >
                    <Text style={{ color: tc.tint, fontWeight: '600' }}>{testing ? (pt ? 'Testando…' : 'Testing…') : (pt ? 'Testar conexão' : 'Test connection')}</Text>
                </Pressable>
            </View>
        </View>
    );
}
