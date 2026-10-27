import { ChevronLeft, HardDrive, Laptop, Palette } from 'lucide-react';
import { motion } from 'framer-motion';
import { Devices } from './Devices';
import { ThemeSettings } from './ThemeSettings';
import { LoginLogs } from './LoginLogs';
import { DataStorageSettings } from './DataStorageSettings';
import { screenVariants } from '../utils/screenMotion';
import { cx } from '../utils/cx';
import { useScrollFade } from '../hooks/useScrollFade';

interface SettingsProps {
    section: 'menu' | 'devices' | 'theme' | 'logs' | 'dataStorage';
    onOpenSection: (section: 'devices' | 'theme' | 'logs' | 'dataStorage') => void;
    onBackToMenu: () => void;
    loginEvents: any[];
    hasUnseenLoginLogs?: boolean;
}

export function Settings({ section, onOpenSection, onBackToMenu, loginEvents, hasUnseenLoginLogs }: SettingsProps) {
    const { scrolled, handleScroll } = useScrollFade();
    if (section === 'devices') {
        return <Devices onBack={onBackToMenu} onOpenLogs={() => onOpenSection('logs')} hasUnseenLoginLogs={hasUnseenLoginLogs} />;
    }
    if (section === 'logs') {
        return <LoginLogs onBack={() => onOpenSection('devices')} events={loginEvents} />;
    }

    if (section === 'theme') {
        return (
            <motion.div className="profile" variants={screenVariants} initial="hidden" animate="visible" exit="exit">
                <div className={cx('header-fade', 'header-fade--screen', scrolled && 'header-fade--visible')} aria-hidden="true" />
                <div className="profile__header">
                    <div className="profile__header-side">
                        <button onClick={onBackToMenu} className="profile__header-back back-icon-btn" aria-label="بازگشت به تنظیمات">
                            <ChevronLeft size={22} />
                        </button>
                    </div>
                    <h1 className="profile__header-title">تم</h1>
                </div>
                <ThemeSettings />
            </motion.div>
        );
    }
    if (section === 'dataStorage') {
        return <DataStorageSettings onBack={onBackToMenu} />;
    }

    return (
        <motion.div className="profile" variants={screenVariants} initial="hidden" animate="visible" exit="exit">
            <div className={cx('header-fade', 'header-fade--screen', scrolled && 'header-fade--visible')} aria-hidden="true" />
            <div className="profile__header">
                <h1 className="profile__header-title">تنظیمات</h1>
            </div>

            <div className="profile__content" onScroll={handleScroll} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 12, paddingInline: 14, paddingTop: 68, flex: '0 0 auto' }}>
                <button
                    type="button"
                    className="popover__item"
                    onClick={() => onOpenSection('theme')}
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-surface-soft)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: 'var(--shadow-xs), var(--glass-specular)', borderRadius: 9999, height: 60, justifyContent: 'space-between', direction: 'rtl', padding: '6px 22px', position: 'relative' }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textAlign: 'right' }}>
                        <Palette size={18} /> تم
                    </span>
                    <ChevronLeft size={18} style={{ marginInlineStart: 8 }} />
                </button>

                <button
                    type="button"
                    className="popover__item"
                    onClick={() => onOpenSection('dataStorage')}
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-surface-soft)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: 'var(--shadow-xs), var(--glass-specular)', borderRadius: 9999, height: 60, justifyContent: 'space-between', direction: 'rtl', padding: '6px 22px' }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textAlign: 'right' }}>
                        <HardDrive size={18} />داده‌ها و ذخیره‌ سازی
                    </span>
                    <ChevronLeft size={18} style={{ marginInlineStart: 8 }} />
                </button>
                <button
                    type="button"
                    className="popover__item"
                    onClick={() => onOpenSection('devices')}
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-surface-soft)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: 'var(--shadow-xs), var(--glass-specular)', borderRadius: 9999, height: 60, justifyContent: 'space-between', direction: 'rtl', padding: '6px 22px', position: 'relative' }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textAlign: 'right' }}>
                        <Laptop size={18} /> دستگاه‌ها
                    </span>
                    {hasUnseenLoginLogs && <span style={{ position: 'absolute', top: 12, left: 12, width: 8, height: 8, borderRadius: 99, background: 'var(--accent-primary)' }} />}
                    <ChevronLeft size={18} style={{ marginInlineStart: 8 }} />
                </button>

            </div>
        </motion.div>
    );
}
