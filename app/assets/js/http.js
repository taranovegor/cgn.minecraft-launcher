// Minimal HTTP helpers built on the platform `fetch` (Node 22 / Electron).
// Replaces the previous `got` dependency. The error classes intentionally
// mirror the names and shapes used by the vendored code so the existing
// error handling keeps working.

class HTTPError extends Error {
    constructor(message, details) {
        super(message)
        this.name = 'HTTPError'
        this.response = {
            statusCode: details.statusCode,
            statusMessage: details.statusMessage,
            body: details.body,
            headers: details.headers
        }
        this.request = { requestUrl: details.url }
    }
}

class RequestError extends Error {
    constructor(message, code, url) {
        super(message)
        this.name = 'RequestError'
        this.code = code
        this.request = { requestUrl: url }
    }
}

class ParseError extends Error {
    constructor(message, url) {
        super(message)
        this.name = 'ParseError'
        this.request = { requestUrl: url }
    }
}

class TimeoutError extends Error {
    constructor(message, url, total) {
        super(message)
        this.name = 'TimeoutError'
        this.timings = { phases: { total } }
        this.request = { requestUrl: url }
    }
}

function safeJson(text) {
    if (text == null || text === '') {
        return null
    }
    try {
        return JSON.parse(text)
    } catch (error) {
        return text
    }
}

function parseJson(text, url) {
    if (text == null || text === '') {
        return null
    }
    try {
        return JSON.parse(text)
    } catch (error) {
        throw new ParseError('Unexpected response body (Parse Error).', url)
    }
}

async function request(url, options = {}) {
    const { timeout, ...init } = options
    let timer = null
    if (timeout != null) {
        const controller = new AbortController()
        init.signal = controller.signal
        timer = setTimeout(() => controller.abort(), timeout)
    }
    try {
        return await fetch(url, init)
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new TimeoutError('Request timed out.', url, timeout)
        }
        throw new RequestError(error.message, error.cause?.code, url)
    } finally {
        if (timer != null) {
            clearTimeout(timer)
        }
    }
}

async function fetchText(url, options) {
    const response = await request(url, options)
    const body = await response.text()
    if (!response.ok) {
        throw new HTTPError(`Response code ${response.status} (${response.statusText})`, {
            statusCode: response.status,
            statusMessage: response.statusText,
            body: safeJson(body),
            headers: Object.fromEntries(response.headers.entries()),
            url
        })
    }
    return { statusCode: response.status, body }
}

async function fetchJson(url, options) {
    const { statusCode, body } = await fetchText(url, options)
    return { statusCode, body: parseJson(body, url) }
}

async function fetchHead(url, options) {
    const response = await request(url, { ...options, method: 'HEAD' })
    if (!response.ok) {
        throw new HTTPError(`Response code ${response.status} (${response.statusText})`, {
            statusCode: response.status,
            statusMessage: response.statusText,
            body: null,
            headers: Object.fromEntries(response.headers.entries()),
            url
        })
    }
    return { statusCode: response.status, headers: Object.fromEntries(response.headers.entries()) }
}

module.exports = { HTTPError, RequestError, ParseError, TimeoutError, request, fetchText, fetchJson, fetchHead }
