const { createWriteStream } = require('fs')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { request, HTTPError, RequestError } = require('../http')
const fs = require('fs-extra')
const { dirname } = require('path')
const { LoggerUtil } = require('../util/LoggerUtil')
const { sleep } = require('../util/NodeUtil')

const log = LoggerUtil.getLogger('DownloadEngine')

function getExpectedDownloadSize(assets) {
    return assets.map(({ size }) => size).reduce((acc, v) => acc + v, 0)
}

async function runWithConcurrency(items, worker, concurrency) {
    let index = 0
    const run = async () => {
        while (index < items.length) {
            const current = index++
            await worker(items[current])
        }
    }
    const workers = []
    const size = Math.min(concurrency, items.length)
    for (let i = 0; i < size; i++) {
        workers.push(run())
    }
    await Promise.all(workers)
}

async function downloadQueue(assets, onProgress) {
    const receivedTotals = assets.map(({ id }) => id).reduce((acc, id) => ({ ...acc, [id]: 0 }), {})
    let received = 0
    const onEachProgress = (asset) => {
        return ({ transferred }) => {
            received += (transferred - receivedTotals[asset.id])
            receivedTotals[asset.id] = transferred
            onProgress(received)
        }
    }
    const wrap = (asset) => downloadFile(asset.url, asset.path, onEachProgress(asset))
    await runWithConcurrency(assets, wrap, 15)
    return receivedTotals
}

async function downloadFile(url, path, onProgress) {
    await fs.ensureDir(dirname(path))
    const MAX_RETRIES = 10

    for (let retryCount = 0; ; retryCount++) {
        if (retryCount > 0) {
            log.debug(`Retry attempt #${retryCount} for ${url}.`)
        }
        let fileWriterStream = null // The write stream.
        try {
            const response = await request(url)
            if (!response.ok) {
                throw new HTTPError(`Response code ${response.status} (${response.statusText})`, {
                    statusCode: response.status,
                    statusMessage: response.statusText,
                    body: null,
                    headers: {},
                    url
                })
            }
            const total = Number(response.headers.get('content-length')) || 0
            let transferred = 0
            const downloadStream = Readable.fromWeb(response.body)
            if (onProgress) {
                downloadStream.on('data', (chunk) => {
                    transferred += chunk.length
                    onProgress({ transferred, total, percent: total > 0 ? (transferred / total) * 100 : 0 })
                })
            }
            fileWriterStream = createWriteStream(path)
            await pipeline(downloadStream, fileWriterStream)
            return
        } catch (error) {
            if (fileWriterStream) {
                fileWriterStream.destroy()
            }
            if (retryCount >= MAX_RETRIES || !retryableError(error)) {
                if (retryCount >= MAX_RETRIES) {
                    log.error(`Maximum retries attempted for ${url}. Rethrowing exception.`)
                } else {
                    log.error(`Unknown or unretryable exception thrown during request to ${url}. Rethrowing exception.`)
                }
                throw error
            }
            if (onProgress) {
                // Reset progress on this asset since we're going to retry.
                onProgress({ transferred: 0, percent: 0, total: 0 })
            }
            // Wait one second before retrying.
            // This can become an exponential backoff, but I see no need for that right now.
            await sleep(1000)
        }
    }
}

function retryableError(error) {
    // HTTP error responses (4xx/5xx) are not retryable; connection level
    // failures and stream resets are.
    if (error instanceof HTTPError) {
        return false
    }
    return error instanceof RequestError || error.code === 'ECONNRESET'
}

module.exports = { getExpectedDownloadSize, downloadQueue, downloadFile }
