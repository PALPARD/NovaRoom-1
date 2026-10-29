const TEHRAN_TZ = 'Asia/Tehran';

const tehranYmdFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const persianJalaliDayMonthFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: TEHRAN_TZ,
    month: 'long',
    day: 'numeric',
});
const persianJalaliFullSlashFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});
const persianJalaliYearFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
});
const persianWeekdayFmt = new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN_TZ,
    weekday: 'long',
});
const persianTimeFmt = new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

export function toPersianDigits(value: string | number): string {
    return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
}

export function resolveVerified(val: unknown): boolean {
    if (val === null || val === undefined) return false;
    if (val === false || val === 0 || val === 'false' || val === '0') return false;
    return true;
}

export function normalizeTs(ts: unknown): number {
    if (ts == null) return Date.now();
    if (typeof ts === 'string') {
        const n = Date.parse(ts);
        return Number.isFinite(n) ? n : Date.now();
    }
    if (typeof ts === 'number') {
        return ts < 1_000_000_000_000 ? ts * 1000 : ts;
    }
    if (ts instanceof Date) return ts.getTime();
    return Date.now();
}

const iranYMD = (ts: unknown): string => tehranYmdFmt.format(new Date(normalizeTs(ts)));

const iranDayNumber = (ts: unknown): number => Math.floor(Date.parse(`${iranYMD(ts)}T00:00:00Z`) / 86400000);

export function sameDay(a: unknown, b: unknown): boolean {
    return iranYMD(a) === iranYMD(b);
}

export function messageDayKey(ts: unknown): number {
    return iranDayNumber(ts);
}

export function formatDayLabel(ts: unknown): string {
    const today = iranDayNumber(Date.now());
    const thatDay = iranDayNumber(ts);
    const diffDays = today - thatDay;
    if (diffDays === 0) return 'امروز';
    if (diffDays === 1) return 'دیروز';
    if (diffDays <= 6) {
        return persianWeekdayFmt.format(new Date(normalizeTs(ts)));
    }
    const currentJalaliYear = persianJalaliYearFmt.format(new Date());
    const targetJalaliYear = persianJalaliYearFmt.format(new Date(normalizeTs(ts)));
    if (currentJalaliYear === targetJalaliYear) {
        return persianJalaliDayMonthFmt.format(new Date(normalizeTs(ts)));
    }
    return persianJalaliFullSlashFmt.format(new Date(normalizeTs(ts)));
}

export function formatMessageTime(ts: unknown): string {
    return persianTimeFmt.format(new Date(normalizeTs(ts)));
}
