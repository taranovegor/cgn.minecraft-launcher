export interface HttpResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers: {
        get(name: string): string | null;
        entries(): Iterable<[string, string]>;
    };
    body: unknown;
    text(): Promise<string>;
}

export declare class HTTPError extends Error {
    response: {
        statusCode: number;
        statusMessage?: string;
        body?: unknown;
        headers: Record<string, string>;
    };
    request: {
        requestUrl: string;
    };
    constructor(message: string, details: {
        statusCode: number;
        statusMessage?: string;
        body?: unknown;
        headers?: Record<string, string>;
        url: string;
    });
}

export declare class RequestError extends Error {
    code?: string;
    request: {
        requestUrl: string;
    };
    constructor(message: string, code: string | undefined, url: string);
}

export declare class ParseError extends Error {
    request: {
        requestUrl: string;
    };
    constructor(message: string, url: string);
}

export declare class TimeoutError extends Error {
    timings: {
        phases: {
            total: number;
        };
    };
    request: {
        requestUrl: string;
    };
    constructor(message: string, url: string, total: number);
}

export declare function request(url: string, options?: unknown): Promise<HttpResponse>;
export declare function fetchText(url: string, options?: unknown): Promise<{ statusCode: number; body: string }>;
export declare function fetchJson<T = unknown>(url: string, options?: unknown): Promise<{ statusCode: number; body: T }>;
export declare function fetchHead(url: string, options?: unknown): Promise<{ statusCode: number; headers: Record<string, string> }>;
