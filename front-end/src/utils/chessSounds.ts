export type ChessSound = 'move-self' | 'move-opponent' | 'capture' | 'castle' | 'move-check' | 'promote' | 'game-start' | 'game-end' | 'illegal';

const cache = new Map<ChessSound, HTMLAudioElement>();

const synthFallback = (name: ChessSound) => {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    try {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const makeTone = (freq: number, dur: number, type: OscillatorType = 'triangle', startOffset = 0, gainVal = 0.16) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now + startOffset);
            osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.65), now + startOffset + dur);
            gain.gain.setValueAtTime(gainVal, now + startOffset);
            gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + startOffset);
            osc.stop(now + startOffset + dur);
        };
        if (name === 'move-self') makeTone(240, 0.065, 'triangle', 0, 0.18);
        else if (name === 'move-opponent') makeTone(200, 0.065, 'triangle', 0, 0.18);
        else if (name === 'capture') {
            makeTone(160, 0.08, 'sawtooth', 0, 0.2);
            makeTone(110, 0.07, 'triangle', 0.015, 0.16);
        } else if (name === 'castle') {
            makeTone(240, 0.055, 'triangle', 0, 0.16);
            makeTone(210, 0.055, 'triangle', 0.07, 0.16);
        } else if (name === 'move-check') {
            makeTone(520, 0.11, 'sine', 0, 0.2);
            makeTone(680, 0.12, 'sine', 0.05, 0.16);
        } else if (name === 'promote') {
            makeTone(380, 0.08, 'triangle', 0, 0.16);
            makeTone(540, 0.12, 'triangle', 0.07, 0.18);
        } else if (name === 'game-start') {
            makeTone(330, 0.09, 'sine', 0, 0.15);
            makeTone(440, 0.14, 'sine', 0.09, 0.17);
        } else if (name === 'game-end') {
            makeTone(420, 0.1, 'sine', 0, 0.16);
            makeTone(320, 0.18, 'sine', 0.1, 0.16);
        } else if (name === 'illegal') {
            makeTone(140, 0.11, 'sawtooth', 0, 0.15);
        }
        window.setTimeout(() => {
            void ctx.close().catch(() => undefined);
        }, 500);
    } catch {
        return;
    }
};

export const playChessSound = (name: ChessSound) => {
    try {
        let audio = cache.get(name);
        if (!audio) {
            audio = new Audio(`/sounds/chess/${name}.mp3`);
            audio.preload = 'auto';
            cache.set(name, audio);
        }
        const instance = audio.cloneNode(true) as HTMLAudioElement;
        const p = instance.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => synthFallback(name));
        }
    } catch {
        synthFallback(name);
    }
};

export const soundForMove = (flags: { capture?: boolean; castle?: boolean; promotion?: boolean; check?: boolean }, mine: boolean): ChessSound => {
    if (flags.check) return 'move-check';
    if (flags.promotion) return 'promote';
    if (flags.castle) return 'castle';
    if (flags.capture) return 'capture';
    return mine ? 'move-self' : 'move-opponent';
};
