process.env.NODE_ENV = 'test'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')

class FakeRequestError extends Error {}
class FakeReadError extends FakeRequestError {}

const state = { behaviors: [], calls: 0, sleeps: 0 }

const fakeGot = {
    RequestError: FakeRequestError,
    ReadError: FakeReadError,
    stream() {
        state.calls++
        const behavior = state.behaviors.shift()
        const stream = new Readable({ read() {} })
        setImmediate(() => {
            if (!behavior || behavior.type === 'success') {
                stream.push('hello')
                stream.push(null)
            } else {
                stream.destroy(behavior.error)
            }
        })
        return stream
    }
}

const gotPath = require.resolve('got')
require.cache[gotPath] = { id: gotPath, filename: gotPath, loaded: true, exports: fakeGot, children: [], paths: [] }

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

function retryable() { const e = new FakeRequestError('server did not respond'); e.name = 'RequestError'; return e }
function nonRetryable() { return new Error('boom') }
function readReset() { const e = new FakeReadError('read'); e.code = 'ECONNRESET'; return e }

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

test('retryable failure is retried once then succeeds', async () => {
    const result = await run([{ type: 'fail', error: retryable() }, { type: 'success' }])
    assert.strictEqual(result.outcome, 'ok')
    assert.strictEqual(result.calls, 2)
    assert.strictEqual(result.sleeps, 1)
})

test('non-retryable failure throws immediately', async () => {
    const result = await run([{ type: 'fail', error: nonRetryable() }])
    assert.strictEqual(result.outcome, 'error:boom')
    assert.strictEqual(result.calls, 1)
    assert.strictEqual(result.sleeps, 0)
})

test('ReadError with ECONNRESET is retryable', async () => {
    const result = await run([{ type: 'fail', error: readReset() }, { type: 'success' }])
    assert.strictEqual(result.outcome, 'ok')
    assert.strictEqual(result.calls, 2)
    assert.strictEqual(result.sleeps, 1)
})

test('retries are exhausted after MAX_RETRIES', async () => {
    const result = await run(Array.from({ length: 11 }, () => ({ type: 'fail', error: retryable() })))
    assert.strictEqual(result.outcome, 'error:server did not respond')
    assert.strictEqual(result.calls, 11)
    assert.strictEqual(result.sleeps, 10)
})
