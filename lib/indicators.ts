export function sma(values: number[], period: number) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
}


export function ema(values: number[], period: number) {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let emaPrev = values[values.length - period];
    for (let i = values.length - period + 1; i < values.length; i++) {
        emaPrev = values[i] * k + emaPrev * (1 - k);
    }
    return emaPrev;
}


export function rsi(values: number[], period = 14) {
    if (values.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = values.length - period; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}