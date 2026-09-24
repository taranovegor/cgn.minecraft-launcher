process.env.NODE_ENV = 'test'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')

const state = { behaviors: [], calls: 0, sleeps: 0 }

function makeResponse({ ok, status, body }) {
    const headers = new Map([['content-length', '5']])
    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        headers: {
            get: (name) => headers.get(name) ?? null,
            entries: () => headers.entries()
        },
        body,
        text: async () => ''
    }
}

global.fetch = async () => {
    state.calls++
    const behavior = state.behaviors.shift() || { type: 'success' }
    if (behavior.type === 'network') {
        const error = new TypeError('fetch failed')
        error.cause = { code: 'ECONNREFUSED' }
        throw error
    }
    if (behavior.type === 'http') {
        return makeResponse({ ok: false, status: behavior.status, body: Readable.toWeb(Readable.from([''])) })
    }
    if (behavior.type === 'stream-error') {
        const stream = new Readable({ read() {} })
        setImmediate(() => {
            stream.push('part')
            stream.destroy(behavior.error)
        })
        return makeResponse({ ok: true, status: 200, body: Readable.toWeb(stream) })
    }
    return makeResponse({ ok: true, status: 200, body: Readable.toWeb(Readable.from(['hello'])) })
}

const nodeUtilPath = require.resolve('../app/assets/js/util/NodeUtil')
require.cache[nodeUtilPath] = {
    id: nodeUtilPath,
    filename: nodeUtilPath,
    loaded: true,
    exports: { sleep: async () => { state.sleeps++ } },
    children: [],
    paths: []
}

const { downloadFile, getExpectedDownloadSize } = require('../app/assets/js/dl')

const tempDir = path.join(os.tmpdir(), 'cgn-launcher-dl-test')

async function run(behaviors) {
    state.behaviors = behaviors.slice()
    state.calls = 0
    state.sleeps = 0
    const file = path.join(tempDir, `f-${Math.random().toString(16).slice(2)}.bin`)
    let outcome
    try {
        await downloadFile('http://example.test/file', file, () => {})
        outcome = 'ok'
    } catch (err) {
        outcome = `error:${err.message}`
    }
    let content = null
    try { content = fs.readFileSync(file, 'utf8') } catch { content = null }
    return { outcome, calls: state.calls, sleeps: state.sleeps, content }
}

test('getExpectedDownloadSize sums asset sizes', () => {
    assert.strictEqual(getExpectedDownloadSize([{ size: 1 }, { size: 2 }, { size: 3 }]), 6)
    assert.strictEqual(getExpectedDownloadSize([]), 0)
})

test('successful download does not retry', async () => {
    const result = await run([{ type: 'success' }])
    assert.strictEqual(result.outcome, 'ok')
    assert.strictEqual(result.calls, 1)
    assert.strictEqual(result.sleeps, 0)
    assert.strictEqual(result.content, 'hello')
})

test('network failure is retried once then succeeds', async () => {
    const result = await run([{ type: 'network' }, { type: 'success' }])
    assert.strictEqual(result.outcome, 'ok')
    assert.strictEqual(result.calls, 2)
    assert.strictEqual(result.sleeps, 1)
})

test('HTTP error response is not retried', async () => {
    const result = await run([{ type: 'http', status: 500 }])
    assert.strictEqual(result.outcome, 'error:Response code 500 (Error)')
    assert.strictEqual(result.calls, 1)
    assert.strictEqual(result.sleeps, 0)
})

test('stream reset (ECONNRESET) is retryable', async () => {
    const error = new Error('socket hang up')
    error.code = 'ECONNRESET'
    const result = await run([{ type: 'stream-error', error }, { type: 'success' }])
    assert.strictEqual(result.outcome, 'ok')
    assert.strictEqual(result.calls, 2)
    assert.strictEqual(result.sleeps, 1)
})

test('retries are exhausted after MAX_RETRIES', async () => {
    const result = await run(Array.from({ length: 11 }, () => ({ type: 'network' })))
    assert.strictEqual(result.outcome, 'error:fetch failed')
    assert.strictEqual(result.calls, 11)
    assert.strictEqual(result.sleeps, 10)
})
