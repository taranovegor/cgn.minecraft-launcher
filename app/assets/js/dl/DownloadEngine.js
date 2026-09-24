const { createWriteStream } = require('fs')
const got = require('got')
const { pipeline } = require('stream/promises')
const fastq = require('fastq')
const fs = require('fs-extra')
const { dirname } = require('path')
const { LoggerUtil } = require('../util/LoggerUtil')
const { sleep } = require('../util/NodeUtil')

const log = LoggerUtil.getLogger('DownloadEngine')

function getExpectedDownloadSize(assets) {
    return assets.map(({ size }) => size).reduce((acc, v) => acc + v, 0)
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
    const q = fastq.promise(wrap, 15)
    const promises = assets.map(asset => q.push(asset))
    await Promise.all(promises)
    return receivedTotals
}

async function downloadFile(url, path, onProgress) {
    await fs.ensureDir(dirname(path))
    const MAX_RETRIES = 10
    let fileWriterStream = null // The write stream.
    let retryCount = 0 // The number of retries attempted.
    let error = null // The caught error.
    let retry = false // Should we retry.
    let rethrow = false // Should we throw an error.

    // Got's streaming retry API is nonexistant and their "example" is egregious.
    // To use their "api" you need to commit yourself to recursive callback hell.
    // No thank you, I prefer this simpler, non error-prone logic.
    do {
        retry = false
        rethrow = false
        if (retryCount > 0) {
            log.debug(`Retry attempt #${retryCount} for ${url}.`)
        }
        try {
            const downloadStream = got.stream(url)
            fileWriterStream = createWriteStream(path)
            if (onProgress) {
                downloadStream.on('downloadProgress', (progress) => onProgress(progress))
            }
            await pipeline(downloadStream, fileWriterStream)
        } catch (err) {
            error = err
            retryCount++
            rethrow = true
            // For now, only retry timeouts.
            retry = retryCount <= MAX_RETRIES && retryableError(error)
            if (fileWriterStream) {
                fileWriterStream.destroy()
            }
            if (onProgress && retry) {
                // Reset progress on this asset. since we're going to retry.
                onProgress({ transferred: 0, percent: 0, total: 0 })
            }
            if (retry) {
                // Wait one second before retrying.
                // This can become an exponential backoff, but I see no need for that right now.
                await sleep(1000)
            }
        }
    } while (retry)
    if (rethrow && error) {
        if (retryCount > MAX_RETRIES) {
            log.error(`Maximum retries attempted for ${url}. Rethrowing exception.`)
        } else {
            log.error(`Unknown or unretryable exception thrown during request to ${url}. Rethrowing exception.`)
        }
        throw error
    }
}

function retryableError(error) {
    if (error instanceof got.RequestError) {
        // error.name === 'RequestError' means server did not respond.
        return error.name === 'RequestError' || (error instanceof got.ReadError && error.code === 'ECONNRESET')
    } else {
        return false
    }
}

module.exports = { getExpectedDownloadSize, downloadQueue, downloadFile }
