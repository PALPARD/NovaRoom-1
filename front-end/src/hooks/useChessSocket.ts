import { useCallback, useEffect, useRef, useState } from 'react';
import { API_WS_URL } from '../config/api';
import type { ChessColor, ChessEmote, ChessEvent, ChessGameView } from '../types';

interface Options {
    token: string | null;
    gameId: string | null;
    onState: (game: ChessGameView, event: ChessEvent | null) => void;
    onError: (code: string) => void;
    onEmote?: (by: ChessColor, emote: ChessEmote) => void;
}

export function useChessSocket({ token, gameId, onState, onError, onEmote }: Options) {
    const [connected, setConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const onStateRef = useRef(onState);
    const onErrorRef = useRef(onError);
    const onEmoteRef = useRef(onEmote);

    useEffect(() => {
        onStateRef.current = onState;
        onErrorRef.current = onError;
        onEmoteRef.current = onEmote;
    }, [onState, onError, onEmote]);

    useEffect(() => {
        if (!token || !gameId) return;
        let closed = false;
        let attempts = 0;
        let retryTimer: number | null = null;
        let heartbeat: number | null = null;

        const connect = () => {
            const ws = new WebSocket(`${API_WS_URL}/ws/chess?token=${encodeURIComponent(token)}&gameId=${encodeURIComponent(gameId)}`);
            socketRef.current = ws;
            ws.onopen = () => {
                attempts = 0;
                setConnected(true);
            };
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'game_state') onStateRef.current(data.game, data.event ?? null);
                    else if (data.type === 'emote' && data.by && data.emote) {
                        onEmoteRef.current?.(data.by as ChessColor, data.emote as ChessEmote);
                    }
                    else if (data.type === 'error') onErrorRef.current(String(data.code || 'error'));
                } catch {
                    return;
                }
            };
            ws.onclose = (event) => {
                setConnected(false);
                if (closed) return;
                if (event.code === 1008) {
                    onErrorRef.current('forbidden');
                    return;
                }
                if (attempts >= 8) return;
                attempts += 1;
                retryTimer = window.setTimeout(connect, 1500);
            };
        };

        connect();
        heartbeat = window.setInterval(() => {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ type: 'ping' }));
            }
        }, 25000);

        return () => {
            closed = true;
            if (retryTimer) window.clearTimeout(retryTimer);
            if (heartbeat) window.clearInterval(heartbeat);
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [token, gameId]);

    const send = useCallback((payload: Record<string, unknown>) => {
        const ws = socketRef.current;
        if (ws?.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(payload));
        return true;
    }, []);

    return { connected, send };
}
