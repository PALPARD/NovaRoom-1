import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Hourglass } from 'lucide-react';
import { apiFetch } from '../../config/api';
import { useChessSocket } from '../../hooks/useChessSocket';
import type { Chat, ChessColor, ChessEvent, ChessGameView, User } from '../../types';
import {
    fetchChessGameCached,
    getCachedChessGame,
    isChessGameUnavailable,
    markChessGameUnavailable,
    setCachedChessGame,
} from '../../utils/chessCache';
import { playChessSound, soundForMove } from '../../utils/chessSounds';
import { cx } from '../../utils/cx';
import { toPersianDigits } from '../../utils/format';
import { notify } from '../../utils/notificationBus';
import { screenVariants } from '../../utils/screenMotion';
import { Avatar } from '../Avatar';
import { ForwardModal } from '../ForwardModal';

interface ChessGameProps {
    currentUser: User;
    gameId: string;
    authToken: string | null;
    chats: Chat[];
    onExitGame: () => void;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

const ERROR_MESSAGES: Record<string, string> = {
    too_early: 'هنوز برای پیشنهاد مساوی زود است',
    already_offered: 'پیشنهاد مساوی قبلاً ارسال شده است',
    cannot_abort: 'امکان لغو بازی وجود ندارد',
};

const formatClock = (ms: number): string => {
    const clamped = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${toPersianDigits(String(minutes).padStart(2, '0'))}:${toPersianDigits(String(seconds).padStart(2, '0'))}`;
};

const formatTimeControl = (tc: string): string => {
    if (tc === 'unlimited') return 'بدون زمان';
    return toPersianDigits(tc);
};

const CAPTURE_ICONS: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const CAPTURE_ORDER = ['q', 'r', 'b', 'n', 'p'];

function capturedPieces(moves: ChessGameView['moves']): Record<ChessColor, { piece: string; count: number }[]> {
    const lost: Record<ChessColor, Record<string, number>> = { white: {}, black: {} };
    const board = new Chess();
    for (const entry of moves) {
        try {
            const played = board.move(entry.san);
            if (!played?.captured) continue;
            const owner: ChessColor = played.color === 'w' ? 'black' : 'white';
            lost[owner][played.captured] = (lost[owner][played.captured] || 0) + 1;
        } catch {
            break;
        }
    }
    const toList = (counts: Record<string, number>) =>
        CAPTURE_ORDER.filter((piece) => counts[piece]).map((piece) => ({ piece, count: counts[piece] }));
    return { white: toList(lost.white), black: toList(lost.black) };
}

function CapturedRow({ pieces, color }: { pieces: { piece: string; count: number }[]; color: ChessColor }) {
    if (pieces.length === 0) return null;
    return (
        <span className="chess__captured">
            {pieces.map(({ piece, count }) => (
                <span key={piece} className="chess__captured-item">
                    <span className="chess__captured-count">×{toPersianDigits(count)}</span>
                    <span className={cx('chess__captured-piece', `chess__captured-piece--${color}`)}>
                        {CAPTURE_ICONS[piece]}
                    </span>
                </span>
            ))}
        </span>
    );
}

export function ChessGame({ currentUser, gameId, authToken, chats, onExitGame }: ChessGameProps) {
    const initialCached = getCachedChessGame(gameId);
    const [game, setGame] = useState<ChessGameView | null>(() => initialCached);
    const [pendingFen, setPendingFen] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
    const [skew, setSkew] = useState(() =>
        initialCached?.serverNow ? initialCached.serverNow - Date.now() : 0,
    );
    const [now, setNow] = useState(() => Date.now());
    const [confirmResign, setConfirmResign] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [notFound, setNotFound] = useState<boolean>(() => isChessGameUnavailable(gameId));
    const soundPlyRef = useRef(typeof initialCached?.ply === 'number' ? initialCached.ply : -1);
    const startSoundPlayedRef = useRef(Boolean(initialCached && initialCached.status !== 'waiting'));
    const movesEndRef = useRef<HTMLDivElement | null>(null);

    const fetchDetails = useCallback((id: string, force = false) => {
        fetchChessGameCached(id, { force })
            .then((res) => {
                setGame(res);
                setNotFound(false);
                const clientNow = Date.now();
                setNow(clientNow);
                setSkew((res.serverNow || clientNow) - clientNow);
                if (res.status === 'active' && res.ply === 0 && !startSoundPlayedRef.current) {
                    startSoundPlayedRef.current = true;
                    playChessSound('game-start');
                }
                if (typeof res.ply === 'number' && soundPlyRef.current < 0) {
                    soundPlyRef.current = res.ply;
                }
            })
            .catch(() => {
                setNotFound(true);
            });
    }, []);

    useEffect(() => {
        const cached = getCachedChessGame(gameId);
        if (cached && cached.status === 'finished') {
            setGame(cached);
            setNotFound(false);
            return;
        }
        fetchDetails(gameId, Boolean(cached));
    }, [fetchDetails, gameId]);

    const myColor: ChessColor = useMemo(() => {
        if (!game) return 'white';
        return game.players.black === currentUser.chatId ? 'black' : 'white';
    }, [game, currentUser.chatId]);

    const isParticipant = useMemo(() => {
        if (!game) return false;
        return game.players.white === currentUser.chatId || game.players.black === currentUser.chatId;
    }, [game, currentUser.chatId]);

    const captured = useMemo(() => (game ? capturedPieces(game.moves) : null), [game?.moves]);

    const handleState = useCallback((nextGame: ChessGameView, event: ChessEvent | null) => {
        setGame((prev) => {
            const merged = {
                ...nextGame,
                playerInfo: nextGame.playerInfo ?? prev?.playerInfo,
            };
            setCachedChessGame(merged);
            return merged;
        });
        setPendingFen(null);
        setSelected(null);
        const clientNow = Date.now();
        setNow(clientNow);
        setSkew((nextGame.serverNow || clientNow) - clientNow);

        const color: ChessColor = nextGame.players.black === currentUser.chatId ? 'black' : 'white';

        if (event?.kind === 'opponent_joined') {
            if (!startSoundPlayedRef.current) {
                startSoundPlayedRef.current = true;
                playChessSound('game-start');
            }
            fetchDetails(gameId, true);
        } else if (event?.kind === 'move') {
            if (nextGame.ply > soundPlyRef.current) {
                soundPlyRef.current = nextGame.ply;
                playChessSound(soundForMove(event, event.by === color));
            }
            if (nextGame.status === 'finished') {
                window.setTimeout(() => playChessSound('game-end'), 200);
            }
        } else if (event?.kind === 'game_over') {
            playChessSound('game-end');
        }
    }, [currentUser.chatId, fetchDetails, gameId]);

    const handleError = useCallback((code: string) => {
        setPendingFen(null);
        if (code === 'illegal_move' || code === 'not_your_turn') {
            playChessSound('illegal');
            return;
        }
        if (code === 'forbidden') {
            onExitGame();
            return;
        }
        const msg = ERROR_MESSAGES[code];
        if (msg) notify({ message: msg, type: 'info' });
    }, [onExitGame]);

    const socketGameId = game && game.status !== 'finished' && isParticipant ? gameId : null;

    const { send } = useChessSocket({
        token: authToken,
        gameId: socketGameId,
        onState: handleState,
        onError: handleError,
    });

    useEffect(() => {
        if (game?.status !== 'active' || !game.clocks) return;
        const id = window.setInterval(() => {
            setNow(Date.now());
        }, 100);
        return () => window.clearInterval(id);
    }, [game?.status, game?.clocks]);

    useEffect(() => {
        movesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
    }, [game?.moves.length]);

    const commitMove = useCallback((from: string, to: string, promo?: 'q' | 'r' | 'b' | 'n') => {
        if (!game) return;
        try {
            const chess = new Chess(game.fen);
            const mv = chess.move({ from, to, promotion: promo });
            if (!mv) {
                playChessSound('illegal');
                return;
            }
            setPendingFen(chess.fen());
            setSelected(null);
            setPromotion(null);
            playChessSound(
                soundForMove(
                    {
                        capture: mv.isCapture(),
                        castle: mv.isKingsideCastle() || mv.isQueensideCastle(),
                        promotion: Boolean(promo),
                        check: chess.inCheck(),
                    },
                    true,
                ),
            );
            soundPlyRef.current = game.ply + 1;
            const ok = send({ type: 'move', uci: `${from}${to}${promo ?? ''}` });
            if (!ok) {
                setPendingFen(null);
                notify({ message: 'اتصال برقرار نیست', type: 'error' });
            }
        } catch {
            playChessSound('illegal');
        }
    }, [game, send]);

    const tryMove = useCallback((from: string, to: string): boolean => {
        if (!game || !isParticipant || game.status !== 'active' || game.turn !== myColor) return false;
        if (from === to) return false;
        try {
            const chess = new Chess(game.fen);
            const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
            if (legal.length === 0) {
                playChessSound('illegal');
                return false;
            }
            if (legal.some((m) => m.isPromotion())) {
                setPromotion({ from, to });
                return false;
            }
            commitMove(from, to);
            return true;
        } catch {
            return false;
        }
    }, [game, isParticipant, myColor, commitMove]);

    const displayedFen = pendingFen ?? game?.fen ?? START_FEN;

    const squareStyles = useMemo(() => {
        const styles: Record<string, React.CSSProperties> = {};
        if (!game) return styles;
        if (game.lastMove) {
            styles[game.lastMove.from] = { backgroundColor: 'rgba(245, 197, 66, 0.36)' };
            styles[game.lastMove.to] = { backgroundColor: 'rgba(245, 197, 66, 0.46)' };
        }
        try {
            const chess = new Chess(displayedFen);
            if (chess.inCheck()) {
                const turnCode = chess.turn();
                const board = chess.board();
                for (const row of board) {
                    for (const cell of row) {
                        if (cell && cell.type === 'k' && cell.color === turnCode) {
                            styles[cell.square] = { backgroundColor: 'rgba(229, 57, 53, 0.55)' };
                        }
                    }
                }
            }
            if (selected && isParticipant && game.status === 'active' && game.turn === myColor) {
                styles[selected] = { backgroundColor: 'rgba(66, 153, 225, 0.42)' };
                const legal = chess.moves({ square: selected as Square, verbose: true });
                for (const m of legal) {
                    const isCapture = m.isCapture() || m.isEnPassant();
                    styles[m.to] = {
                        ...styles[m.to],
                        backgroundImage: isCapture
                            ? 'radial-gradient(circle, transparent 56%, rgba(0, 0, 0, 0.28) 58%, rgba(0, 0, 0, 0.28) 72%, transparent 74%)'
                            : 'radial-gradient(circle, rgba(0, 0, 0, 0.26) 22%, transparent 24%)',
                    };
                }
            }
        } catch {
            return styles;
        }
        return styles;
    }, [game, displayedFen, selected, isParticipant, myColor]);

    const handleSquareClick = useCallback(({ square }: { square: string }) => {
        if (!game || !isParticipant || game.status !== 'active' || game.turn !== myColor) return;
        try {
            const chess = new Chess(game.fen);
            if (selected) {
                if (selected === square) {
                    setSelected(null);
                    return;
                }
                const legal = chess.moves({ square: selected as Square, verbose: true }).some((m) => m.to === square);
                if (legal) {
                    tryMove(selected, square);
                    return;
                }
            }
            const piece = chess.get(square as Square);
            const myCode = myColor === 'white' ? 'w' : 'b';
            if (piece && piece.color === myCode) {
                setSelected(square);
            } else {
                setSelected(null);
            }
        } catch {
            setSelected(null);
        }
    }, [game, isParticipant, myColor, selected, tryMove]);

    const directChats = useMemo(
        () =>
            chats.filter(
                (c) =>
                    c.chatType !== 'group' &&
                    !c.id.startsWith('grp_') &&
                    !c.id.startsWith('saved_messages_') &&
                    c.id !== 'official-channel' &&
                    c.otherUser &&
                    !c.otherUser.isGroup,
            ),
        [chats],
    );

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

    const sendInvite = async (chatId: string) => {
        const chat = chats.find((c) => c.id === chatId);
        const targetChatId = chat?.participantIds.find((id) => id !== currentUser.chatId) || chat?.otherUser?.chatId;
        if (!targetChatId) return;
        try {
            await apiFetch(`/chess/games/${encodeURIComponent(gameId)}/invite`, {
                method: 'POST',
                body: JSON.stringify({ targetChatId }),
            });
            notify({ message: 'دعوت ارسال شد.', type: 'success' });
            fetchDetails(gameId, true);
        } catch {
            notify({ message: 'ارسال دعوت انجام نشد.', type: 'error' });
        }
    };

    const sendShare = async (chatId: string) => {
        const chat = chats.find((c) => c.id === chatId);
        const isGroup = chat?.chatType === 'group' || chatId.startsWith('grp_') || Boolean(chat?.otherUser?.isGroup);
        const targetChatId = isGroup
            ? chatId
            : chat?.participantIds.find((id) => id !== currentUser.chatId) || chat?.otherUser?.chatId || chatId;
        if (!targetChatId) return;
        try {
            await apiFetch(`/chess/games/${encodeURIComponent(gameId)}/share`, {
                method: 'POST',
                body: JSON.stringify({ targetChatId }),
            });
            notify({ message: 'بازی به اشتراک گذاشته شد.', type: 'success' });
        } catch {
            notify({ message: 'اشتراک‌گذاری بازی انجام نشد.', type: 'error' });
        }
    };

    const handleCancelWaiting = async () => {
        try {
            await apiFetch(`/chess/games/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
        } catch {
            void 0;
        }
        markChessGameUnavailable(gameId);
        onExitGame();
    };

    if (notFound) {
        return (
            <motion.div className="profile chess" variants={screenVariants} initial="hidden" animate="visible" exit="exit">
                <div className="profile__header">
                    <div className="profile__header-side">
                        <button onClick={onExitGame} className="profile__header-back back-icon-btn" aria-label="بازگشت">
                            <ChevronLeft size={22} />
                        </button>
                    </div>
                    <h1 className="profile__header-title">شطرنج</h1>
                </div>
                <div className="chess__empty">
                    <p>بازی یافت نشد</p>
                    <button type="button" className="chess-primary-btn" onClick={onExitGame}>
                        بازگشت
                    </button>
                </div>
            </motion.div>
        );
    }

    if (!game) {
        return (
            <motion.div className="profile chess" variants={screenVariants} initial="hidden" animate="visible" exit="exit">
                <div className="profile__header">
                    <div className="profile__header-side">
                        <button onClick={onExitGame} className="profile__header-back back-icon-btn" aria-label="بازگشت">
                            <ChevronLeft size={22} />
                        </button>
                    </div>
                    <h1 className="profile__header-title">شطرنج</h1>
                </div>
                <div className="chess__body">
                    <div className="chess__stage">
                        <div className="chess__player">
                            <div className="chess__player-info">
                                <span className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                <span className="skeleton" style={{ width: 96, height: 14, borderRadius: 6 }} />
                            </div>
                            <span className="skeleton" style={{ width: 58, height: 28, borderRadius: 10 }} />
                        </div>
                        <div className="chess__board-wrap">
                            <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 20 }} />
                        </div>
                        <div className="chess__player">
                            <div className="chess__player-info">
                                <span className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                <span className="skeleton" style={{ width: 96, height: 14, borderRadius: 6 }} />
                            </div>
                            <span className="skeleton" style={{ width: 58, height: 28, borderRadius: 10 }} />
                        </div>
                        <div className="skeleton" style={{ width: '100%', height: 48, borderRadius: 18 }} />
                    </div>
                </div>
            </motion.div>
        );
    }

    const oppColor: ChessColor = myColor === 'white' ? 'black' : 'white';
    const oppId = game.players[oppColor];
    const oppInfo = (oppId && game.playerInfo?.[oppId]) || null;
    const bottomId = game.players[myColor];
    const bottomInfo = (bottomId && game.playerInfo?.[bottomId]) || (isParticipant ? {
        chatId: currentUser.chatId,
        name: currentUser.name,
        avatar: currentUser.avatar,
    } : null);

    const getClockMs = (color: ChessColor): number | null => {
        if (!game.clocks) return null;
        const base = game.clocks[color];
        if (game.status !== 'active' || game.ply < 2 || game.turn !== color) return base;
        const elapsed = now + skew - game.lastMoveAt;
        return Math.max(0, base - Math.max(0, elapsed));
    };

    const myClock = getClockMs(myColor);
    const oppClock = getClockMs(oppColor);

    const movePairs: { num: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < game.moves.length; i += 2) {
        movePairs.push({
            num: i / 2 + 1,
            white: game.moves[i]?.san,
            black: game.moves[i + 1]?.san,
        });
    }

    const canPlay = isParticipant && game.status === 'active' && game.turn === myColor;

    const resultTitle = (() => {
        if (game.status !== 'finished') return '';
        if (game.reason === 'aborted' || game.result === '*') return 'بازی لغو شد';
        if (game.result === '1-0') return 'سفید برنده شد';
        if (game.result === '0-1') return 'سیاه برنده شد';
        return 'مساوی';
    })();

    const resultSub = game.reason && game.reason !== 'aborted' ? REASON_LABELS[game.reason] || '' : '';

    const winnerColor: ChessColor | null =
        game.status === 'finished' ? (game.result === '1-0' ? 'white' : game.result === '0-1' ? 'black' : null) : null;

    return (
        <motion.div className="profile chess" variants={screenVariants} initial="hidden" animate="visible" exit="exit">
            <div className="profile__header">
                <div className="profile__header-side">
                    <button onClick={onExitGame} className="profile__header-back back-icon-btn" aria-label="بازگشت">
                        <ChevronLeft size={22} />
                    </button>
                </div>
                <h1 className="profile__header-title">
                    شطرنج • {formatTimeControl(game.timeControl)}
                </h1>
            </div>

            <div className="chess__body">
                <div className="chess__stage">
                    <div className="chess__player">
                        <div className="chess__player-info">
                            {oppInfo ? (
                                <Avatar
                                    name={oppInfo.name || 'حریف'}
                                    size="sm"
                                    src={oppInfo.avatar}
                                    online={oppId ? game.online[oppColor] : undefined}
                                />
                            ) : (
                                <span className="chess__player-placeholder"><Hourglass size={18} /></span>
                            )}
                            <div className="chess__player-text">
                                <div className="chess__player-line">
                                    <span className="chess__player-name">
                                        {oppInfo?.name || (game.status === 'waiting' ? 'منتظر حریف…' : 'حریف')}
                                    </span>
                                    <span className={cx('chess__color-dot', `chess__color-dot--${oppColor}`)} />
                                    {winnerColor === oppColor && <span className="chess__winner-badge">برنده</span>}
                                </div>
                                <CapturedRow pieces={captured?.[myColor] ?? []} color={myColor} />
                            </div>
                        </div>
                        {oppClock !== null && (
                            <div className={cx('chess__clock', game.status === 'active' && game.turn === oppColor && 'chess__clock--active')}>
                                {formatClock(oppClock)}
                            </div>
                        )}
                    </div>

                    <div className="chess__board-wrap">
                        <Chessboard
                            options={{
                                position: displayedFen,
                                boardOrientation: myColor,
                                allowDragging: canPlay,
                                dragActivationDistance: 6,
                                allowDrawingArrows: false,
                                animationDurationInMs: 160,
                                squareStyles,
                                boardStyle: {
                                    borderRadius: '14px',
                                    overflow: 'hidden',
                                },
                                lightSquareStyle: { backgroundColor: '#eeeed2' },
                                darkSquareStyle: { backgroundColor: '#769656' },
                                canDragPiece: ({ piece }) => {
                                    if (!canPlay) return false;
                                    const code = myColor === 'white' ? 'w' : 'b';
                                    return piece.pieceType.startsWith(code);
                                },
                                onPieceDrag: ({ square }) => {
                                    if (square) setSelected(square);
                                },
                                onPieceDrop: ({ sourceSquare, targetSquare }) => {
                                    if (!targetSquare || sourceSquare === targetSquare) return false;
                                    return tryMove(sourceSquare, targetSquare);
                                },
                                onSquareClick: handleSquareClick,
                            }}
                        />

                        {promotion && (
                            <div className="chess__promotion-backdrop" onClick={() => setPromotion(null)}>
                                <div className="chess__promotion" onClick={(e) => e.stopPropagation()}>
                                    {(['q', 'r', 'b', 'n'] as const).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            className="chess__promotion-btn"
                                            onClick={() => commitMove(promotion.from, promotion.to, p)}
                                        >
                                            {p === 'q' ? '♕' : p === 'r' ? '♖' : p === 'b' ? '♗' : '♘'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="chess__player">
                        <div className="chess__player-info">
                            <Avatar
                                name={bottomInfo?.name || currentUser.name}
                                size="sm"
                                src={bottomInfo?.avatar}
                                online={game.online[myColor]}
                            />
                            <div className="chess__player-text">
                                <div className="chess__player-line">
                                    <span className="chess__player-name">{bottomInfo?.name || currentUser.name}</span>
                                    <span className={cx('chess__color-dot', `chess__color-dot--${myColor}`)} />
                                    {winnerColor === myColor && <span className="chess__winner-badge">برنده</span>}
                                </div>
                                <CapturedRow pieces={captured?.[oppColor] ?? []} color={oppColor} />
                            </div>
                        </div>
                        {myClock !== null && (
                            <div className={cx('chess__clock', game.status === 'active' && game.turn === myColor && 'chess__clock--active')}>
                                {formatClock(myClock)}
                            </div>
                        )}
                    </div>

                    {movePairs.length > 0 && (
                        <div className="chess__moves">
                            <div className="chess__moves-track">
                                {movePairs.map((pair) => (
                                    <span key={pair.num} className="chess__move-pair">
                                        <span className="chess__move-num">{toPersianDigits(pair.num)}.</span>
                                        <span>{pair.white}</span>
                                        {pair.black && <span>{pair.black}</span>}
                                    </span>
                                ))}
                                <div ref={movesEndRef} />
                            </div>
                        </div>
                    )}

                    {game.status === 'waiting' && isParticipant && (
                        <div className="chess__panel">
                            <span className="chess__panel-icon"><Hourglass size={26} /></span>
                            <div className="chess__panel-title">منتظر حریف…</div>
                            <div className="chess__result-sub">بازی را برای دوستت بفرست تا شروع شود</div>
                            <div className="chess__actions">
                                <button
                                    type="button"
                                    className="chess-primary-btn"
                                    onClick={() => setInviteOpen(true)}
                                >
                                    ارسال به چت
                                </button>
                                <button
                                    type="button"
                                    className="chess-secondary-btn chess-secondary-btn--danger"
                                    onClick={handleCancelWaiting}
                                >
                                    لغو بازی
                                </button>
                            </div>
                        </div>
                    )}

                    {game.status === 'active' && isParticipant && (
                        <>
                            {game.drawOfferedBy === oppColor && (
                                <div className="chess__draw-banner">
                                    <span>پیشنهاد مساوی از طرف حریف</span>
                                    <div className="chess__draw-actions">
                                        <button
                                            type="button"
                                            className="chess-chip chess-chip--active"
                                            onClick={() => send({ type: 'draw_accept' })}
                                        >
                                            قبول
                                        </button>
                                        <button
                                            type="button"
                                            className="chess-chip"
                                            onClick={() => send({ type: 'draw_decline' })}
                                        >
                                            رد
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="chess__controls">
                                {game.ply < 2 ? (
                                    <button
                                        type="button"
                                        className="chess-secondary-btn"
                                        onClick={() => send({ type: 'abort' })}
                                    >
                                        لغو بازی
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="chess-secondary-btn"
                                        disabled={game.drawOfferedBy === myColor}
                                        onClick={() => send({ type: 'draw_offer' })}
                                    >
                                        {game.drawOfferedBy === myColor ? 'پیشنهاد مساوی ارسال شد' : 'پیشنهاد مساوی'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="chess-secondary-btn chess-secondary-btn--danger"
                                    onClick={() => setConfirmResign(true)}
                                >
                                    تسلیم
                                </button>
                            </div>
                        </>
                    )}

                    {game.status === 'finished' && (
                        <div className="chess__panel">
                            <div className="chess__result-title">{resultTitle}</div>
                            {resultSub && <div className="chess__result-sub">{resultSub}</div>}
                            <div className="chess__actions">
                                {isParticipant && game.reason !== 'aborted' && (
                                    <button
                                        type="button"
                                        className="chess-secondary-btn"
                                        onClick={() => setShareOpen(true)}
                                    >
                                        اشتراک‌گذاری بازی
                                    </button>
                                )}
                                <button type="button" className="chess-primary-btn" style={{ flex: 1 }} onClick={onExitGame}>
                                    بازگشت
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ForwardModal
                isOpen={inviteOpen}
                chats={directChats}
                currentUserId={currentUser.chatId}
                title="ارسال بازی به چت"
                hideSavedMessages
                onClose={() => setInviteOpen(false)}
                onSelectTargetChat={sendInvite}
            />

            <ForwardModal
                isOpen={shareOpen}
                chats={shareableChats}
                currentUserId={currentUser.chatId}
                title="اشتراک‌گذاری بازی در چت"
                hideSavedMessages
                onClose={() => setShareOpen(false)}
                onSelectTargetChat={sendShare}
            />

            <AnimatePresence>
                {confirmResign && (
                    <motion.div
                        className="chat-room-modal-overlay"
                        style={{ zIndex: 120 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        onClick={() => setConfirmResign(false)}
                    >
                        <motion.div
                            className="chat-room-confirm-modal"
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, y: 14, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.98 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <h3 className="chat-room-confirm-modal__title">تسلیم در بازی؟</h3>
                            <p className="chat-room-confirm-modal__text">آیا می‌خواهید تسلیم شوید؟</p>
                            <div className="chat-room-confirm-modal__actions">
                                <button
                                    className="chat-room-confirm-modal__btn"
                                    onClick={() => setConfirmResign(false)}
                                    type="button"
                                >
                                    لغو
                                </button>
                                <button
                                    className="chat-room-confirm-modal__btn chat-room-confirm-modal__btn--danger"
                                    onClick={() => {
                                        setConfirmResign(false);
                                        send({ type: 'resign' });
                                    }}
                                    type="button"
                                >
                                    تسلیم
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
