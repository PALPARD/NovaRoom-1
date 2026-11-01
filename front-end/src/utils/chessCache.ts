import { apiFetch } from '../config/api';
import type { ChessGameView } from '../types';

export type CachedChessGame = ChessGameView & { me?: string | null };

interface ChessLobbySnapshot {
    currentGame: ChessGameView | null;
    history: ChessGameView[];
    hasMore: boolean;
    updatedAt: number;
}

const STORAGE_KEY = 'novaroom_chess_cache_v1';
const MAX_STORED_GAMES = 150;
const LOBBY_FRESH_MS = 10_000;

const gamesById = new Map<string, CachedChessGame>();
const unavailableIds = new Set<string>();
const inflightGameReqs = new Map<string, Promise<CachedChessGame>>();
let lobbySnapshot: ChessLobbySnapshot | null = null;
let hydrated = false;

const hydrateOnce = () => {
    if (hydrated || typeof window === 'undefined') return;
    hydrated = true;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
            games?: Record<string, CachedChessGame>;
            unavailable?: string[];
        };
        if (parsed?.games && typeof parsed.games === 'object') {
            for (const [id, game] of Object.entries(parsed.games)) {
                if (game && game.status === 'finished') {
                    gamesById.set(id, game);
                }
            }
        }
        if (Array.isArray(parsed?.unavailable)) {
            for (const id of parsed.unavailable) {
                if (typeof id === 'string') unavailableIds.add(id);
            }
        }
    } catch {
        return;
    }
};

const persistFinished = () => {
    if (typeof window === 'undefined') return;
    try {
        const finishedEntries: [string, CachedChessGame][] = [];
        for (const [id, game] of gamesById.entries()) {
            if (game.status === 'finished') finishedEntries.push([id, game]);
        }
        const trimmed = finishedEntries.slice(-MAX_STORED_GAMES);
        const games: Record<string, CachedChessGame> = {};
        for (const [id, g] of trimmed) games[id] = g;
        const unavailable = Array.from(unavailableIds).slice(-MAX_STORED_GAMES);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ games, unavailable }));
    } catch {
        return;
    }
};

export const getCachedChessGame = (gameId: string): CachedChessGame | null => {
    hydrateOnce();
    return gamesById.get(gameId) ?? null;
};

export const isChessGameUnavailable = (gameId: string): boolean => {
    hydrateOnce();
    return unavailableIds.has(gameId);
};

export const markChessGameUnavailable = (gameId: string) => {
    hydrateOnce();
    unavailableIds.add(gameId);
    const existing = gamesById.get(gameId);
    if (existing && existing.status !== 'finished') {
        gamesById.delete(gameId);
    }
    if (lobbySnapshot?.currentGame?.id === gameId) {
        lobbySnapshot = { ...lobbySnapshot, currentGame: null, updatedAt: 0 };
    }
    persistFinished();
};

export const setCachedChessGame = (game: CachedChessGame | null | undefined) => {
    if (!game?.id) return;
    hydrateOnce();
    const prev = gamesById.get(game.id);
    const merged: CachedChessGame = {
        ...prev,
        ...game,
        playerInfo: game.playerInfo ?? prev?.playerInfo,
        me: game.me !== undefined ? game.me : prev?.me,
    };
    gamesById.set(game.id, merged);
    unavailableIds.delete(game.id);

    if (lobbySnapshot) {
        if (merged.status === 'finished') {
            const nextCurrent = lobbySnapshot.currentGame?.id === merged.id ? null : lobbySnapshot.currentGame;
            const nextHistory =
                merged.reason === 'aborted'
                    ? lobbySnapshot.history.filter((g) => g.id !== merged.id)
                    : [merged, ...lobbySnapshot.history.filter((g) => g.id !== merged.id)];
            lobbySnapshot = {
                ...lobbySnapshot,
                currentGame: nextCurrent,
                history: nextHistory,
            };
        } else if (lobbySnapshot.currentGame?.id === merged.id || !lobbySnapshot.currentGame) {
            lobbySnapshot = {
                ...lobbySnapshot,
                currentGame: merged,
            };
        }
    }

    if (merged.status === 'finished') {
        persistFinished();
    }
};

export const seedChessGames = (games: ChessGameView[]) => {
    if (!Array.isArray(games) || games.length === 0) return;
    hydrateOnce();
    let hasFinished = false;
    for (const g of games) {
        if (!g?.id) continue;
        const prev = gamesById.get(g.id);
        gamesById.set(g.id, {
            ...prev,
            ...g,
            playerInfo: g.playerInfo ?? prev?.playerInfo,
            me: prev?.me,
        });
        if (g.status === 'finished') hasFinished = true;
    }
    if (hasFinished) persistFinished();
};

export const fetchChessGameCached = (
    gameId: string,
    opts?: { force?: boolean },
): Promise<CachedChessGame> => {
    hydrateOnce();
    const existing = gamesById.get(gameId);
    if (!opts?.force && existing && existing.status === 'finished') {
        return Promise.resolve(existing);
    }
    const inflight = inflightGameReqs.get(gameId);
    if (inflight) return inflight;

    const req = apiFetch(`/chess/games/${encodeURIComponent(gameId)}`)
        .then((data: CachedChessGame) => {
            setCachedChessGame(data);
            return gamesById.get(gameId) ?? data;
        })
        .catch((err) => {
            markChessGameUnavailable(gameId);
            throw err;
        })
        .finally(() => {
            inflightGameReqs.delete(gameId);
        });

    inflightGameReqs.set(gameId, req);
    return req;
};

export const getChessLobbySnapshot = (): ChessLobbySnapshot | null => lobbySnapshot;

export const isChessLobbyFresh = (): boolean =>
    Boolean(lobbySnapshot && Date.now() - lobbySnapshot.updatedAt < LOBBY_FRESH_MS && lobbySnapshot.currentGame?.status !== 'waiting');

export const setChessLobbySnapshot = (next: {
    currentGame: ChessGameView | null;
    history: ChessGameView[];
    hasMore: boolean;
}) => {
    if (next.currentGame) setCachedChessGame(next.currentGame);
    seedChessGames(next.history);
    lobbySnapshot = {
        currentGame: next.currentGame,
        history: next.history,
        hasMore: next.hasMore,
        updatedAt: Date.now(),
    };
};

export const clearChessCache = () => {
    gamesById.clear();
    unavailableIds.clear();
    inflightGameReqs.clear();
    lobbySnapshot = null;
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            return;
        }
    }
};
