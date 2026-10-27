import { ChevronLeft, Copy, Check, Calendar, Link2, MessageCircle, Pencil, X, Save, Image as ImageIcon, Trash2, RotateCcw, Ban, FileText, AtSign, UserRound } from 'lucide-react';
import { motion } from "framer-motion";
import { screenVariants } from '../utils/screenMotion';
import { useScrollFade } from '../hooks/useScrollFade';
import { cx } from '../utils/cx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { User } from '../types';
import { Avatar, getAvatarDisplayUrl } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { API_BASE_URL, apiFetch } from '../config/api';
import { ImageMediaViewer } from './ImageMediaViewer';
import { encryptFileBytesClientSide } from '../utils/e2ee';

interface ContactInfoProps {
    user: User;
    onBack: () => void;
    onOpenChat?: (user: User) => void;
    isBlocked?: boolean;
    hideOnlineStatus?: boolean;
    onToggleBlock?: (user: User) => void | Promise<void>;
    onOpenMembers?: () => void;
    autoOpenMembers?: boolean;
    startInEditMode?: boolean;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function extractUploadedFileId(res: any): string {
    const file = res?.file || {};
    return String(file.fileId || file.id || file.file_id || file.path || '').trim();
}

function resolveVerified(val: any): boolean {
    if (val === null || val === undefined) return false;
    if (val === false || val === 0 || val === 'false' || val === '0') return false;
    return true;
}
function toPersianDigits(value: string | number): string {
    return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
}

function extractFileIdFromAvatar(rawAvatar: string): string {
    const avatar = String(rawAvatar || '').trim();
    if (!avatar) return '';
    const withoutOrigin = avatar.startsWith(API_BASE_URL) ? avatar.slice(API_BASE_URL.length) : avatar;
    const match = withoutOrigin.match(/\/(?:files|avatars)\/([^/?#]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
    if (!avatar.startsWith('http://') && !avatar.startsWith('https://') && !avatar.startsWith('/')) return avatar;
    return '';
}

export function ContactInfo({
    user,
    onBack,
    onOpenChat,
    isBlocked = false,
    hideOnlineStatus = false,
    onToggleBlock,
    onOpenMembers,
    autoOpenMembers = true,
    startInEditMode = false,
}: ContactInfoProps) {
    const { scrolled, handleScroll } = useScrollFade();
    const [copied, setCopied] = useState(false);
    const [canEditGroup, setCanEditGroup] = useState(false);
    const [editingGroup, setEditingGroup] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [groupAvatar, setGroupAvatar] = useState(''); 
    const [avatarTouched, setAvatarTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resolvedRegistrationDate, setResolvedRegistrationDate] = useState<string>(String(user.registrationDate ?? '').trim());
    const [registrationLoading, setRegistrationLoading] = useState(false);
    const [openedProfileImage, setOpenedProfileImage] = useState<{ url: string; fileId: string } | null>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setCopied(false);
    }, [user.chatId, user.username]);

    const bio = typeof user.bio === 'string' ? user.bio.trim() : '';

    const isInviteLink = (un: string) =>
        un.startsWith('senoroom://') || un.startsWith('novaroom://');

    const isGroup = useMemo(() => {
        const chatId = String((user as any)?.chatId ?? '');
        const un = String((user as any)?.username ?? '');
        return Boolean((user as any)?.isGroup) || chatId.startsWith('grp_') || (un ? isInviteLink(un) : false);
    }, [user]);

    const displayBio = bio === 'گروه' ? '' : bio;

    useEffect(() => {
        
        setEditingGroup(isGroup ? startInEditMode : false);
        setSaving(false);
        setError(null);
        setGroupName(String(user.name ?? ''));
        setGroupAvatar(String(user.avatar ?? ''));
        setAvatarTouched(false);
        setResolvedRegistrationDate(String(user.registrationDate ?? '').trim());
        setRegistrationLoading(false);
    }, [isGroup, startInEditMode, user.chatId, user.name, user.avatar]);

    useEffect(() => {
        if (isGroup) {
            setRegistrationLoading(false);
            return;
        }

        const existingDate = String(user.registrationDate ?? '').trim();
        if (existingDate) {
            setResolvedRegistrationDate(existingDate);
            setRegistrationLoading(false);
            return;
        }

        const username = String(user.username ?? '').trim().replace(/^@+/, '');
        const chatId = String(user.chatId ?? '').trim();
        if (!username && !chatId) {
            setRegistrationLoading(false);
            return;
        }

        let cancelled = false;
        setRegistrationLoading(true);

        const loadRegistrationDate = async () => {
            let resolved = '';

            try {
                if (username.length >= 2) {
                    const users = await apiFetch(`/users/search?query=${encodeURIComponent(username)}`);
                    if (Array.isArray(users)) {
                        const found = users.find((u: any) => {
                            const uUsername = String(u?.username ?? '').toLowerCase();
                            const uChatId = String(u?.chatId ?? '');
                            return (uUsername && uUsername === username.toLowerCase()) || (chatId && uChatId === chatId);
                        });
                        resolved = String(found?.registrationDate ?? '').trim();
                    }
                }

                if (!resolved && chatId) {
                    const chats = await apiFetch('/chats');
                    if (Array.isArray(chats)) {
                        const chatMatch = chats.find((c: any) => {
                            const other = c?.otherUser ?? {};
                            return String(other?.chatId ?? '') === chatId || String(other?.username ?? '').toLowerCase() === username.toLowerCase();
                        });
                        resolved = String(chatMatch?.otherUser?.registrationDate ?? '').trim();
                    }
                }
            } catch {
                resolved = '';
            } finally {
                if (!cancelled) {
                    setResolvedRegistrationDate(resolved);
                    setRegistrationLoading(false);
                }
            }
        };

        loadRegistrationDate();

        return () => {
            cancelled = true;
        };
    }, [isGroup, user.registrationDate, user.username, user.chatId]);

    useEffect(() => {
        let cancelled = false;
        if (!isGroup) {
            setCanEditGroup(false);
            return;
        }

        apiFetch('/profile/me')
            .then((me) => {
                if (cancelled) return;
                setCanEditGroup(resolveVerified(me?.verified ?? me?.user?.verified));
            })
            .catch(() => {
                if (cancelled) return;
                setCanEditGroup(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isGroup]);

    useEffect(() => {
        if (!isGroup || !onOpenMembers || !autoOpenMembers) return;
        onOpenMembers();
    }, [autoOpenMembers, isGroup, onOpenMembers, user.chatId]);

    const handleCopy = () => {
        const un = (user.username || '').trim();
        if (!un) return;
        const textToCopy = isInviteLink(un) ? un : `@${un}`;
        navigator.clipboard.writeText(textToCopy).catch(() => { });
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const canOpenChat = Boolean(onOpenChat) && !isGroup && Boolean(user.chatId) && user.chatId !== 'saved';

    const uploadGroupAvatar = async (file: File) => {
        if (!file) return;

        if (file.size > MAX_IMAGE_BYTES) {
            setError('حجم عکس نباید بیشتر از ۳ مگابایت باشد');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const token = localStorage.getItem('token') || '';
            const plainBytes = new Uint8Array(await file.arrayBuffer());
            const encryptedBytes = await encryptFileBytesClientSide(plainBytes, token, 'profile_avatar_shared');
            const encryptedFile = new window.File([new Uint8Array(encryptedBytes)], file.name, {
                type: 'application/octet-stream',
                lastModified: file.lastModified || Date.now(),
            });
            const form = new FormData();
            form.append('file', encryptedFile);
            const res = await apiFetch('/files/upload', { method: 'POST', body: form });

            if (res?.success !== true) throw new Error('Upload failed');
            const fileId = extractUploadedFileId(res);
            if (!fileId) throw new Error('Invalid upload response');

            setGroupAvatar(fileId);
            setAvatarTouched(true);
        } catch (e) {
            console.error(e);
            setError('آپلود عکس گروه با خطا مواجه شد');
        } finally {
            setSaving(false);
        }
    };

    const openAvatarViewer = async () => {
        const rawAvatar = String(user.avatar || '').trim();
        if (!rawAvatar) return;
        const fileId = extractFileIdFromAvatar(rawAvatar);
        if (!fileId) return;

        try {
            const cachedUrl = await getAvatarDisplayUrl(rawAvatar);
            if (!cachedUrl) return;
            setOpenedProfileImage({ url: cachedUrl, fileId });
            const params = new URLSearchParams(location.search);
            params.set('avatar', '1');
            navigate({ pathname: location.pathname, search: `?${params.toString()}` });
        } catch (e) {
            console.error(e);
            
        }
    };

    useEffect(() => {
        const hasAvatarRoute = new URLSearchParams(location.search).get('avatar') === '1';
        if (hasAvatarRoute || !openedProfileImage) return;
        setOpenedProfileImage(null);
    }, [location.search, openedProfileImage]);

    const saveGroup = async () => {
        if (!user.chatId) return;

        setSaving(true);
        setError(null);

        try {
            await apiFetch(`/groups/${encodeURIComponent(user.chatId)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: groupName,
                    avatar: groupAvatar,
                }),
            });

            
            window.dispatchEvent(new Event('novaroom:refresh_chats'));
            setEditingGroup(false);
        } catch (e) {
            console.error(e);
            setError('ویرایش گروه با خطا مواجه شد');
        } finally {
            setSaving(false);
        }
    };

    const originalAvatar = String(user.avatar || '');
    const previewName = groupName || String(user.name || '');
    const previewAvatar = avatarTouched ? groupAvatar : originalAvatar;

    const canRemoveAvatar = Boolean(previewAvatar);
    const isAvatarRemoved = avatarTouched && !groupAvatar && Boolean(originalAvatar);

    return (
        <motion.div
            className="contact-info"
            variants={screenVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
        >
            <div className={cx('header-fade', 'header-fade--screen', scrolled && 'header-fade--visible')} aria-hidden="true" />
            <div className="profile__header">
                <div className="profile__header-side">
                    <button className="profile__header-back back-icon-btn" onClick={onBack} aria-label="بازگشت" type="button">
                        <ChevronLeft size={22} />
                    </button>
                </div>
                <h1 className="profile__header-title">{isGroup ? 'اطلاعات گروه' : 'اطلاعات مخاطب'}</h1>
                {isGroup && canEditGroup && (
                    <div className="profile__header-actions">
                        {editingGroup ? (
                            <>
                                <button
                                    type="button"
                                    className="profile__cancel-btn"
                                    onClick={() => {
                                        setError(null);
                                        setGroupName(String(user.name ?? ''));
                                        setGroupAvatar(String(user.avatar ?? ''));
                                        setAvatarTouched(false);
                                        setEditingGroup(false);
                                    }}
                                    disabled={saving}
                                >
                                    <X size={15} />
                                    <span className="profile__btn-label">انصراف</span>
                                </button>
                                <button
                                    type="button"
                                    className="profile__save-btn"
                                    onClick={saveGroup}
                                    disabled={saving}
                                >
                                    <Save size={15} />
                                    <span className="profile__btn-label">{saving ? 'در حال ذخیره' : 'ذخیره'}</span>
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="profile__edit-btn"
                                onClick={() => setEditingGroup(true)}
                            >
                                <Pencil size={15} />
                                ویرایش
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="contact-info__content">
                <div className="profile__hero">
                    <span className="profile__hero-orb profile__hero-orb--one" aria-hidden="true" />
                    <span className="profile__hero-orb profile__hero-orb--two" aria-hidden="true" />

                    <button
                        type="button"
                        className="profile__avatar-wrap"
                        onClick={openAvatarViewer}
                        aria-label="مشاهده تصویر"
                        style={{ cursor: user.avatar ? 'zoom-in' : 'default' }}
                    >
                        <Avatar
                            name={user.name}
                            size="xl"
                            online={(isBlocked || hideOnlineStatus) ? undefined : user.online}
                            src={user.avatar}
                        />
                    </button>

                    <h2 className="profile__name">
                        {user.name}
                        {!isGroup && user.verified ? <VerifiedBadge size={17} /> : null}
                    </h2>

                    {isGroup ? (
                        <p className="profile__username-display">
                            {editingGroup ? 'در حال ویرایش اطلاعات گروه' : 'گروه'}
                        </p>
                    ) : (
                        <span className={(!(isBlocked || hideOnlineStatus) && user.online) ? 'contact-info__status contact-info__status--online' : 'contact-info__status'}>
                            {(isBlocked || hideOnlineStatus) ? 'آخرین بازدید مدت‌ها پیش' : user.online ? 'آنلاین' : 'آفلاین'}
                        </span>
                    )}

                    {isGroup && canEditGroup && editingGroup && (
                        <div className="profile__avatar-actions">
                            <button
                                type="button"
                                className="profile__avatar-btn profile__avatar-btn--upload"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={saving}
                            >
                                <ImageIcon size={14} />
                                انتخاب عکس
                            </button>
                            {isAvatarRemoved ? (
                                <button
                                    type="button"
                                    className="profile__avatar-btn"
                                    disabled={saving}
                                    onClick={() => {
                                        setError(null);
                                        setGroupAvatar(originalAvatar);
                                        setAvatarTouched(false);
                                    }}
                                >
                                    <RotateCcw size={14} />
                                    بازگردانی
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="profile__avatar-btn profile__avatar-btn--danger"
                                    disabled={saving || !canRemoveAvatar}
                                    onClick={() => {
                                        if (!canRemoveAvatar) return;
                                        setError(null);
                                        setGroupAvatar('');
                                        setAvatarTouched(true);
                                    }}
                                >
                                    <Trash2 size={14} />
                                    حذف تصویر
                                </button>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    await uploadGroupAvatar(f);
                                    e.currentTarget.value = '';
                                }}
                            />
                        </div>
                    )}
                </div>

                <div className="profile__fields" onScroll={handleScroll}>
                    {isGroup && canEditGroup && editingGroup && (
                        <div className="profile__card">
                            <div className="profile__section-title">
                                <span className="profile__section-icon"><Pencil size={15} /></span>
                                ویرایش گروه
                            </div>

                            <div className="profile__field-group">
                                <label className="profile__field-label">نام گروه</label>
                                <input
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    placeholder={String(user.name ?? '') || 'مثلاً تیم توسعه'}
                                    className="profile__field-input"
                                    disabled={saving}
                                />
                            </div>

                            <div className="profile__field-group">
                                <label className="profile__field-label">عکس گروه</label>
                                <div className="contact-info__avatar-editor">
                                    <Avatar name={previewName} size="md" src={previewAvatar} />
                                    <div className="contact-info__avatar-editor-text">
                                        <span className="contact-info__avatar-editor-name">{previewName || 'گروه'}</span>
                                        <span className="contact-info__avatar-editor-hint">
                                            {isAvatarRemoved
                                                ? 'عکس برای حذف انتخاب شد (بعد از ذخیره کامل می‌شود)'
                                                : 'برای تغییر، از دکمه بالا عکس جدید انتخاب کن'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {error && <p className="contact-info__error">{error}</p>}
                        </div>
                    )}

                    {canOpenChat && (
                        <>
                            <button
                                type="button"
                                onClick={() => onOpenChat?.(user)}
                                className="profile__edit-action"
                                aria-label="ارسال پیام"
                            >
                                <MessageCircle size={17} />
                                ارسال پیام
                            </button>
                            <button
                                type="button"
                                onClick={() => onToggleBlock?.(user)}
                                className="contact-info__block-btn"
                                aria-label={isBlocked ? 'آنبلاک کردن' : 'بلاک کردن'}
                            >
                                <Ban size={17} />
                                {isBlocked ? 'آنبلاک کردن' : 'بلاک کردن'}
                            </button>
                        </>
                    )}

                    {(!isGroup || displayBio) && (
                        <div className="profile__card">
                            <div className="profile__section-title">
                                <span className="profile__section-icon"><FileText size={15} /></span>
                                بیوگرافی
                            </div>
                            <p className={displayBio ? 'profile__bio-text' : 'profile__bio-text profile__bio-text--empty'}>
                                {displayBio || 'بدون بیوگرافی'}
                            </p>
                        </div>
                    )}

                    {user.username && (
                        <div className="profile__card">
                            <div className="profile__section-title">
                                <span className="profile__section-icon">
                                    {isGroup ? <Link2 size={15} /> : <AtSign size={15} />}
                                </span>
                                {isGroup ? 'لینک دعوت' : 'نام کاربری'}
                            </div>
                            <div className="profile__info-row">
                                <span className="profile__info-icon">
                                    {isGroup ? <Link2 size={16} /> : <AtSign size={16} />}
                                </span>
                                <div className="profile__info-body">
                                    <span className="profile__info-label">{isGroup ? 'لینک دعوت گروه' : 'نام کاربری'}</span>
                                    <span className="profile__info-value profile__info-value--mono contact-info__invite-value">
                                        {isGroup ? user.username : `@${user.username}`}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className={copied ? 'profile__copy-btn profile__copy-btn--copied' : 'profile__copy-btn'}
                                    aria-label="کپی"
                                    onClick={handleCopy}
                                    disabled={!user.username}
                                >
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {!isGroup && (
                        <div className="profile__card">
                            <div className="profile__section-title">
                                <span className="profile__section-icon"><Calendar size={15} /></span>
                                تاریخ عضویت
                            </div>
                            <div className="profile__info-row">
                                <span className="profile__info-icon"><UserRound size={16} /></span>
                                <div className="profile__info-body">
                                    <span className="profile__info-label">عضو شده در</span>
                                    <span className="profile__info-value">
                                        {registrationLoading ? (
                                            <span className="skeleton" style={{ display: 'inline-block', width: 110, height: 16, borderRadius: 8 }} />
                                        ) : (resolvedRegistrationDate ? toPersianDigits(resolvedRegistrationDate) : 'نامشخص')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {openedProfileImage && (
                <ImageMediaViewer
                    imageUrl={openedProfileImage.url}
                    token={localStorage.getItem('token') || ''}
                    downloadFile={{ fileId: openedProfileImage.fileId, fileName: `${user.name || 'profile'}.jpg` }}
                    onClose={() => {
                        const params = new URLSearchParams(location.search);
                        if (params.has('avatar')) return void navigate(-1);
                        setOpenedProfileImage(null);
                    }}
                />
            )}
        </motion.div>
    );
}
