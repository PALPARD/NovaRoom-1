import { useState } from 'react';
import { ChevronLeft, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { screenVariants } from '../utils/screenMotion';
import { cx } from '../utils/cx';
import { useScrollFade } from '../hooks/useScrollFade';
import { apiFetch } from '../config/api';
import { notify } from '../utils/notificationBus';
import type { User } from '../types';

interface PrivacySettingsProps {
    onBack: () => void;
    currentUser: User | null;
    onUpdateCurrentUser?: (updates: Partial<User>) => void;
}

export function PrivacySettings({ onBack, currentUser, onUpdateCurrentUser }: PrivacySettingsProps) {
    const { scrolled, handleScroll } = useScrollFade();
    const [hideOnline, setHideOnline] = useState<boolean>(Boolean(currentUser?.hideOnlineStatus));
    const [saving, setSaving] = useState(false);

    const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark-mode');
    const panelBorder = '1px solid var(--glass-border)';
    const panelBg = 'var(--glass-surface-soft)';

    const toggleHideOnline = async () => {
        if (saving) return;
        const nextState = !hideOnline;
        setSaving(true);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(10);
        }

        try {
            await apiFetch('/profile/me/privacy', {
                method: 'PATCH',
                body: JSON.stringify({ hideOnlineStatus: nextState }),
            });
            setHideOnline(nextState);
            onUpdateCurrentUser?.({ hideOnlineStatus: nextState });
            notify({
                type: 'success',
                message: nextState
                    ? 'وضعیت آنلاین بودن و آخرین بازدید شما مخفی شد.'
                    : 'وضعیت آنلاین بودن و آخرین بازدید شما قابل مشاهده شد.',
            });
        } catch (error) {
            notify({
                type: 'error',
                message: 'خطا در ذخیره تنظیمات حریم خصوصی.',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div className="profile" variants={screenVariants} initial="hidden" animate="visible" exit="exit">
            <div className={cx('header-fade', 'header-fade--screen', scrolled && 'header-fade--visible')} aria-hidden="true" />
            <div className="profile__header">
                <div className="profile__header-side">
                    <button onClick={onBack} className="profile__header-back back-icon-btn" aria-label="بازگشت به تنظیمات">
                        <ChevronLeft size={22} />
                    </button>
                </div>
                <h1 className="profile__header-title">حریم خصوصی</h1>
            </div>

            <div className="profile__content" onScroll={handleScroll} style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingInline: 14, paddingTop: 68, flex: '0 0 auto' }}>
                <div style={{ border: panelBorder, borderRadius: 9999, overflow: 'hidden', background: panelBg, backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: 'var(--shadow-xs), var(--glass-specular)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, direction: 'rtl', padding: '10px 22px', minHeight: 60 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <EyeOff size={18} />
                            بستن آنلاین بودن
                        </span>
                        <button
                            type="button"
                            onClick={toggleHideOnline}
                            disabled={saving}
                            aria-label="بستن آنلاین بودن"
                            style={{
                                width: 48,
                                height: 28,
                                borderRadius: 999,
                                border: isDarkMode
                                    ? (hideOnline ? '1px solid color-mix(in srgb, var(--accent-primary) 70%, var(--border-primary))' : '1px solid color-mix(in srgb, var(--text-primary) 35%, var(--border-primary))')
                                    : (hideOnline ? '1px solid color-mix(in srgb, var(--text-primary) 28%, var(--accent-primary))' : '1px solid color-mix(in srgb, var(--text-primary) 24%, var(--border-primary))'),
                                background: hideOnline ? 'var(--accent-primary)' : (isDarkMode ? 'var(--bg-tertiary)' : 'color-mix(in srgb, var(--text-primary) 24%, var(--bg-primary))'),
                                position: 'relative',
                                transition: 'all .2s ease',
                                cursor: saving ? 'wait' : 'pointer',
                                opacity: saving ? 0.7 : 1,
                            }}
                        >
                            <span
                                style={{
                                    position: 'absolute',
                                    top: 2,
                                    right: hideOnline ? 2 : 22,
                                    width: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    background: isDarkMode ? '#fff' : (hideOnline ? '#fff' : '#d3d3d3'),
                                    transition: 'all .2s ease',
                                }}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
