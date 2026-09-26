import { useEffect, useState } from 'react';
import { isMobileCompanionConfigured } from './ai-config';

export function useMobileCompanionConfigured(): boolean {
    const [configured, setConfigured] = useState(false);
    useEffect(() => {
        let active = true;
        void isMobileCompanionConfigured().then((value) => {
            if (active) setConfigured(value);
        }).catch(() => {
            if (active) setConfigured(false);
        });
        return () => { active = false; };
    }, []);
    return configured;
}
