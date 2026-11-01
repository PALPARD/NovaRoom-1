import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';
import { apiFetch } from '../../config/api';
import type { Chat, ChessColor, ChessGameView, User } from '../../types';
import {
    getChessLobbySnapshot,
    isChessLobbyFresh,
    seedChessGames,
    setCachedChessGame,
    setChessLobbySnapshot,
} from '../../utils/chessCache';
import { cx } from '../../utils/cx';
import { toPersianDigits } from '../../utils/format';
import { notify } from '../../utils/notificationBus';
import { screenVariants } from '../../utils/screenMotion';
import { Avatar } from '../Avatar';
import { PlumpyChessIcon } from '../BottomNavbar';
import { ForwardModal } from '../ForwardModal';

interface ChessHomeProps {
    currentUser: User;
    chats: Chat[];
    onOpenGame: (gameId: string) => void;
}

const HISTORY_PAGE_SIZE = 30;

const TIME_CONTROL_GROUPS = [
    { label: 'بدون زمان', items: [{ value: 'unlimited', label: 'بدون زمان' }] },
    { label: 'بولت', items: [{ value: '1+0', label: '۱+۰' }] },
    {
        label: 'بلیتز',
        items: [
            { value: '3+0', label: '۳+۰' },
            { value: '3+2', label: '۳+۲' },
            { value: '5+0', label: '۵+۰' },
        ],
    },
    {
        label: 'رپید',
        items: [
            { value: '10+0', label: '۱۰+۰' },
            { value: '15+10', label: '۱۵+۱۰' },
        ],
    },
    { label: 'کلاسیک', items: [{ value: '30+0', label: '۳۰+۰' }] },
];

const COLOR_OPTIONS: { value: 'white' | 'black' | 'random'; label: string }[] = [
    { value: 'white', label: 'سفید' },
    { value: 'random', label: 'تصادفی' },
    { value: 'black', label: 'سیاه' },
];

const REASON_LABELS: Record<string, string> = {
    checkmate: 'کیش و مات',
    resign: 'تسلیم',
    timeout: 'اتمام زمان',
    stalemate: 'پات',
    insufficient: 'مهره ناکافی',
    repetition: 'تکرار حرکت',
    fifty: 'قانون ۵۰ حرکت',
    agreement: 'توافق',
    abandoned: 'ترک بازی',
};

const formatTimeControl = (tc: string) => (tc === 'unlimited' ? 'بدون زمان' : toPersianDigits(tc));

export function ChessHome({ currentUser, chats, onOpenGame }: ChessHomeProps) {
    const initialSnapshot = getChessLobbySnapshot();
    const [currentGame, setCurrentGame] = useState<ChessGameView | null>(() => initialSnapshot?.currentGame ?? null);
    const [history, setHistory] = useState<ChessGameView[]>(() => initialSnapshot?.history ?? []);
    const [hasMore, setHasMore] = useState<boolean>(() => initialSnapshot?.hasMore ?? false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loading, setLoading] = useState<boolean>(() => !initialSnapshot);
    const [timeControl, setTimeControl] = useState<string>('3+2');
    const [color, setColor] = useState<'white' | 'black' | 'random'>('random');
    const [creating, setCreating] = useState(false);
    const [shareGameId, setShareGameId] = useState<string | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const loadingMoreRef = useRef(false);

    const loadData = async (force = false) => {
        if (!force && isChessLobbyFresh()) {
            setLoading(false);
            return;
        }
        try {
            const snap = getChessLobbySnapshot();
            if (snap && !force && snap.currentGame?.status === 'waiting') {
                const curRes = await apiFetch('/chess/games/current').catch(() => null);
                const nextCurrent: ChessGameView | null = curRes?.game || null;
                setCurrentGame(nextCurrent);
                setChessLobbySnapshot({
                    currentGame: nextCurrent,
                    history: snap.history,
                    hasMore: snap.hasMore,
                });
                return;
            }
            const [curRes, histRes] = await Promise.all([
                apiFetch('/chess/games/current').catch(() => null),
                apiFetch(`/chess/games/history?skip=0&limit=${HISTORY_PAGE_SIZE}`).catch(() => null),
            ]);
            const nextCurrent: ChessGameView | null = curRes?.game || null;
            const nextHistory: ChessGameView[] = Array.isArray(histRes?.games) ? histRes.games : [];
            const nextHasMore = Boolean(histRes?.hasMore);
            setCurrentGame(nextCurrent);
            setHistory(nextHistory);
            setHasMore(nextHasMore);
            setChessLobbySnapshot({
                currentGame: nextCurrent,
                history: nextHistory,
                hasMore: nextHasMore,
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const loadMoreHistory = useCallback(async () => {
        if (loadingMoreRef.current || !hasMore) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
            const res = await apiFetch(
                `/chess/games/history?skip=${history.length}&limit=${HISTORY_PAGE_SIZE}`,
            );
            const nextGames: ChessGameView[] = Array.isArray(res?.games) ? res.games : [];
            seedChessGames(nextGames);
            const nextHasMore = Boolean(res?.hasMore);
            setHistory((prev) => {
                const seen = new Set(prev.map((g) => g.id));
                const merged = [...prev, ...nextGames.filter((g) => !seen.has(g.id))];
                const snap = getChessLobbySnapshot();
                setChessLobbySnapshot({
                    currentGame: snap?.currentGame ?? null,
                    history: merged,
                    hasMore: nextHasMore,
                });
                return merged;
            });
            setHasMore(nextHasMore);
        } catch {
            setHasMore(false);
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [hasMore, history.length]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    void loadMoreHistory();
                }
            },
            { rootMargin: '180px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, loadMoreHistory]);

    const shareableChats = useMemo(
        () =>
            chats.filter(
                (c) =>
                    !c.id.startsWith('saved_messages_') &&
                    c.id !== 'official-channel' &&
                    c.otherUser,
            ),
        [chats],
    );

    const handleCreate = async () => {
        if (creating) return;
        setCreating(true);
        try {
            const res = await apiFetch('/chess/games', {
                method: 'POST',
                body: JSON.stringify({ timeControl, color }),
            });
            if (res?.game?.id) {
                setCachedChessGame(res.game);
                onOpenGame(res.game.id);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '';
            if (msg === 'already_in_game') {
                notify({ message: 'شما در حال حاضر یک بازی فعال دارید', type: 'info' });
                await loadData(true);
            } else {
                notify({ message: 'ساخت بازی انجام نشد.', type: 'error' });
            }
        } finally {
            setCreating(false);
        }
    };

    const handleShareToChat = async (chatId: string) => {
        if (!shareGameId) return;
        const chat = chats.find((c) => c.id === chatId);
        const isGroup = chat?.chatType === 'group' || chatId.startsWith('grp_') || Boolean(chat?.otherUser?.isGroup);
        const targetChatId = isGroup
            ? chatId
            : chat?.participantIds.find((id) => id !== currentUser.chatId) || chat?.otherUser?.chatId || chatId;
        if (!targetChatId) return;
        try {
            await apiFetch(`/chess/games/${encodeURIComponent(shareGameId)}/share`, {
                method: 'POST',
                body: JSON.stringify({ targetChatId }),
            });
            notify({ message: 'بازی به اشتراک گذاشته شد.', type: 'success' });
        } catch {
            notify({ message: 'اشتراک‌گذاری بازی انجام نشد.', type: 'error' });
        }
    };

    const outcomeForUser = (g: ChessGameView) => {
        const myColor: ChessColor = g.players.black === currentUser.chatId ? 'black' : 'white';
        const winResult = myColor === 'white' ? '1-0' : '0-1';
        if (g.result === winResult) return { label: 'برد', cls: 'chess-history__badge--win' };
        if (g.result === '1/2-1/2') return { label: 'مساوی', cls: 'chess-history__badge--draw' };
        return { label: 'باخت', cls: 'chess-history__badge--loss' };
    };

    return (
        <motion.div className="profile chess-lobby" variants={screenVariants} initial="hidden" animate="visible" exit="exit">
            <div className="profile__header">
                <h1 className="profile__header-title">شطرنج</h1>
            </div>

            <div className="profile__content">
                <div className="chess-lobby__inner">
                    {loading ? (
                        <>
                            <div className="chess-card">
                                <div className="skeleton" style={{ height: 18, width: 110, borderRadius: 8 }} />
                                <div className="chess-chips">
                                    <div className="skeleton" style={{ height: 34, width: 76, borderRadius: 9999 }} />
                                    <div className="skeleton" style={{ height: 34, width: 76, borderRadius: 9999 }} />
                                    <div className="skeleton" style={{ height: 34, width: 76, borderRadius: 9999 }} />
                                    <div className="skeleton" style={{ height: 34, width: 76, borderRadius: 9999 }} />
                                </div>
                                <div className="skeleton" style={{ height: 18, width: 90, borderRadius: 8 }} />
                                <div className="chess-chips">
                                    <div className="skeleton" style={{ height: 34, width: 72, borderRadius: 9999 }} />
                                    <div className="skeleton" style={{ height: 34, width: 72, borderRadius: 9999 }} />
                                    <div className="skeleton" style={{ height: 34, width: 72, borderRadius: 9999 }} />
                                </div>
                                <div className="skeleton" style={{ height: 46, width: '100%', borderRadius: 9999 }} />
                            </div>
                            <div className="chess-card">
                                <div className="skeleton" style={{ height: 18, width: 100, borderRadius: 8 }} />
                                <div className="skeleton" style={{ height: 54, width: '100%', borderRadius: 14 }} />
                                <div className="skeleton" style={{ height: 54, width: '100%', borderRadius: 14 }} />
                            </div>
                        </>
                    ) : currentGame ? (
                        <div className="chess-card">
                            <div className="chess-card__header">
                                <span className="chess-card__icon">
                                    <PlumpyChessIcon size={24} />
                                </span>
                                <div>
                                    <div className="chess-card__title">ادامه بازی</div>
                                    <div className="chess-card__sub">
                                        کلاسیک • {formatTimeControl(currentGame.timeControl)} •{' '}
                                        {currentGame.status === 'waiting' ? 'منتظر حریف…' : 'در حال بازی'}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="chess-primary-btn"
                                onClick={() => onOpenGame(currentGame.id)}
                            >
                                ادامه بازی
                            </button>
                        </div>
                    ) : (
                        <div className="chess-card">
                            <div className="chess-section">
                                <div className="chess-section__label">زمان بازی</div>
                                <div className="chess-tc-groups">
                                    {TIME_CONTROL_GROUPS.map((group) => (
                                        <div key={group.label} className="chess-tc-group">
                                            <span className="chess-tc-group__title">{group.label}</span>
                                            <div className="chess-chips">
                                                {group.items.map((item) => (
                                                    <button
                                                        key={item.value}
                                                        type="button"
                                                        className={cx('chess-chip', timeControl === item.value && 'chess-chip--active')}
                                                        onClick={() => setTimeControl(item.value)}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="chess-section">
                                <div className="chess-section__label">رنگ مهره</div>
                                <div className="chess-chips">
                                    {COLOR_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={cx('chess-chip', color === opt.value && 'chess-chip--active')}
                                            onClick={() => setColor(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                className="chess-primary-btn"
                                onClick={handleCreate}
                                disabled={creating}
                            >
                                ساخت بازی
                            </button>
                        </div>
                    )}

                    {!loading && (
                        <div className="chess-card">
                            <div className="chess-section__label">سابقه بازی‌ها</div>
                            {history.length === 0 ? (
                                <div className="chess-history__empty">هنوز بازی‌ای ثبت نشده است</div>
                            ) : (
                                <div className="chess-history__list">
                                    {history.map((g) => {
                                        const oppColor: ChessColor = g.players.black === currentUser.chatId ? 'white' : 'black';
                                        const oppId = g.players[oppColor];
                                        const oppInfo = (oppId && g.playerInfo?.[oppId]) || null;
                                        const outcome = outcomeForUser(g);
                                        const reason = g.reason ? REASON_LABELS[g.reason] || '' : '';
                                        return (
                                            <div
                                                key={g.id}
                                                className="chess-history__item"
                                                onClick={() => onOpenGame(g.id)}
                                            >
                                                <div className="chess-history__main">
                                                    <Avatar
                                                        name={oppInfo?.name || 'حریف'}
                                                        size="sm"
                                                        src={oppInfo?.avatar}
                                                    />
                                                    <div className="chess-history__meta">
                                                        <div className="chess-history__name">
                                                            {oppInfo?.name || 'حریف'}
                                                        </div>
                                                        <div className="chess-history__sub">
                                                            {formatTimeControl(g.timeControl)}
                                                            {reason ? ` • ${reason}` : ''}
                                                            {` • ${toPersianDigits(Math.ceil(g.ply / 2))} حرکت`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="chess-history__actions">
                                                    <span className={cx('chess-history__badge', outcome.cls)}>
                                                        {outcome.label}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="chess-history__share-btn"
                                                        aria-label="اشتراک‌گذاری بازی"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setShareGameId(g.id);
                                                        }}
                                                    >
                                                        <Share2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {loadingMore && (
                                        <>
                                            <div className="skeleton" style={{ height: 54, width: '100%', borderRadius: 16 }} />
                                            <div className="skeleton" style={{ height: 54, width: '100%', borderRadius: 16 }} />
                                        </>
                                    )}
                                    {hasMore && <div ref={sentinelRef} style={{ height: 4 }} />}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <ForwardModal
                isOpen={Boolean(shareGameId)}
                chats={shareableChats}
                currentUserId={currentUser.chatId}
                title="اشتراک‌گذاری بازی در چت"
                hideSavedMessages
                onClose={() => setShareGameId(null)}
                onSelectTargetChat={handleShareToChat}
            />
        </motion.div>
    );
}
