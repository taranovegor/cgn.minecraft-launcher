export interface Logger {
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    info(...args: unknown[]): void;
    http(...args: unknown[]): void;
    verbose(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    silly(...args: unknown[]): void;
}
export declare class LoggerUtil {
    static getLogger(label: string): Logger;
}
