import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../config/api';
import type { ChessGameView, ChessInvite } from '../../types';
import {
    fetchChessGameCached,
    getCachedChessGame,
    isChessGameUnavailable,
    markChessGameUnavailable,
    setCachedChessGame,
    type CachedChessGame,
} from '../../utils/chessCache';
import { toPersianDigits } from '../../utils/format';
import { notify } from '../../utils/notificationBus';
import { PlumpyChessIcon } from '../BottomNavbar';

interface ChessInviteCardProps {
    invite: ChessInvite;
    isMine: boolean;
}

const formatTimeControlLabel = (tc: string): string => {
    if (tc === 'unlimited') return 'بدون زمان';
    return toPersianDigits(tc);
};

const resultLabel = (game: ChessGameView): string => {
    if (game.result === '1-0') return 'برد سفید';
    if (game.result === '0-1') return 'برد سیاه';
    if (game.result === '1/2-1/2') return 'مساوی';
    return '';
};

export function ChessInviteCard({ invite, isMine }: ChessInviteCardProps) {
    const navigate = useNavigate();
    const [game, setGame] = useState<CachedChessGame | null>(() => getCachedChessGame(invite.gameId));
    const [unavailable, setUnavailable] = useState<boolean>(() => isChessGameUnavailable(invite.gameId));
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const cached = getCachedChessGame(invite.gameId);
        const alreadyUnavailable = isChessGameUnavailable(invite.gameId);
        setGame(cached);
        setUnavailable(alreadyUnavailable);

        if (alreadyUnavailable) return;
        if (cached && cached.status !== 'waiting') return;

        let cancelled = false;
        fetchChessGameCached(invite.gameId, { force: Boolean(cached) })
            .then((data) => {
                if (!cancelled) {
                    setGame(data);
                    setUnavailable(false);
                }
            })
            .catch(() => {
                if (!cancelled) setUnavailable(true);
            });
        return () => {
            cancelled = true;
        };
    }, [invite.gameId]);

    const isSharedFinished = Boolean(invite.shared || game?.status === 'finished');

    const handleAction = async () => {
        if (busy || !game) return;
        if (isSharedFinished || isMine || game.me) {
            navigate(`/chess/game/${encodeURIComponent(invite.gameId)}`);
            return;
        }
        if (game.status !== 'waiting') {
            markChessGameUnavailable(invite.gameId);
            setUnavailable(true);
            return;
        }
        setBusy(true);
        try {
            const res = await apiFetch(`/chess/games/${encodeURIComponent(invite.gameId)}/accept`, { method: 'POST' });
            if (res?.game) {
                setCachedChessGame({ ...res.game, me: res.game.players?.black ? 'black' : 'white' });
            }
            navigate(`/chess/game/${encodeURIComponent(invite.gameId)}`);
        } catch (err: unknown) {
            const code = err instanceof Error ? err.message : '';
            const msg = code === 'already_in_game'
                ? 'شما در حال حاضر یک بازی فعال دارید'
                : 'این بازی دیگر در دسترس نیست';
            notify({ message: msg, type: 'error' });
            if (code !== 'already_in_game') {
                markChessGameUnavailable(invite.gameId);
                setUnavailable(true);
            }
        } finally {
            setBusy(false);
        }
    };

    const canEnter = Boolean(
        game &&
        (isSharedFinished || isMine || game.me || game.status === 'waiting') &&
        !unavailable,
    );
    const buttonLabel = isSharedFinished
        ? 'مشاهده بازی'
        : isMine || game?.me
        ? 'ورود به بازی'
        : 'قبول و ورود';

    const whiteName = (game?.players.white && game.playerInfo?.[game.players.white]?.name) || 'سفید';
    const blackName = (game?.players.black && game.playerInfo?.[game.players.black]?.name) || 'سیاه';

    return (
        <div className="chess-invite" onClick={(e) => e.stopPropagation()}>
            <div className="chess-invite__header">
                <span className="chess-invite__icon">
                    <PlumpyChessIcon size={22} />
                </span>
                <div className="chess-invite__meta">
                    <div className="chess-invite__title">
                        {isSharedFinished ? 'بازی شطرنج' : 'دعوت به بازی شطرنج'}
                    </div>
                    <div className="chess-invite__sub">
                        {isSharedFinished && game
                            ? `${whiteName} در برابر ${blackName} • ${resultLabel(game)}`
                            : `کلاسیک • ${formatTimeControlLabel(invite.timeControl)}`}
                    </div>
                </div>
            </div>
            {unavailable || (game && !canEnter) ? (
                <div className="chess-invite__unavailable">این بازی دیگر در دسترس نیست</div>
            ) : game ? (
                <button
                    type="button"
                    className="chess-invite__btn"
                    onClick={handleAction}
                    disabled={busy}
                >
                    {buttonLabel}
                </button>
            ) : (
                <div className="skeleton" style={{ height: 34, width: '100%', borderRadius: 9999 }} />
            )}
        </div>
    );
}
