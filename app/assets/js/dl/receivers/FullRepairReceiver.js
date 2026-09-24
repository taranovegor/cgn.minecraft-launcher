const { DistributionAPI } = require('../../common/distribution/DistributionAPI')
const { DistributionIndexProcessor } = require('../distribution/DistributionIndexProcessor')
const { getExpectedDownloadSize, downloadQueue } = require('../DownloadEngine')
const { MojangIndexProcessor } = require('../mojang/MojangIndexProcessor')
const { LoggerUtil } = require('../../util/LoggerUtil')
const { validateLocalFile } = require('../../common/util/FileUtils')
const { RequestError, HTTPError, TimeoutError, ParseError } = require('../../http')

const log = LoggerUtil.getLogger('FullRepairReceiver')

class FullRepairReceiver {

    processors = []
    assets = []

    async execute(message) {
        // Route to the correct function
        switch (message.action) {
            case 'validate':
                await this.validate(message)
                break
            case 'download':
                await this.download(message)
                break
        }
    }

    // Construct friendly error messages
    async parseError(error) {
        if (error == null) {
            return undefined
        }
        if (error?.request?.requestUrl) {
            log.debug(`Error during request to ${error.request.requestUrl}`)
        }
        if (error instanceof HTTPError) {
            log.debug('Response Details:')
            log.debug('Body:', error.response.body)
            log.debug('Headers:', error.response.headers)
            return `Error during request (HTTP Response ${error.response.statusCode})`
        } else if (error instanceof TimeoutError) {
            return `Request timed out (${error.timings.phases.total}ms).`
        } else if (error instanceof ParseError) {
            return 'Request received unexepected body (Parse Error).'
        } else if (error instanceof RequestError) {
            return `Request received no response (${error.code}).`
        } else if (error?.code === 'ECONNRESET') {
            return `Read Error (${error.code}): ${error.message}.`
        } else {
            return undefined
        }
    }

    async validate(message) {
        const api = new DistributionAPI(
            message.launcherDirectory,
            message.commonDirectory,
            message.instanceDirectory,
            null, // The main process must refresh, this is a local pull only.
            message.devMode
        )

        const distribution = await api.getDistributionLocalLoadOnly()
        const server = distribution.getServerById(message.serverId)

        const mojangIndexProcessor = new MojangIndexProcessor(message.commonDirectory, server.rawServer.minecraftVersion)
        const distributionIndexProcessor = new DistributionIndexProcessor(message.commonDirectory, distribution, message.serverId)
        this.processors = [
            mojangIndexProcessor,
            distributionIndexProcessor
        ]

        // Init all
        let numStages = 0
        for (const processor of this.processors) {
            await processor.init()
            numStages += processor.totalStages()
        }

        const assets = []

        // Validate
        let completedStages = 0
        for (const processor of this.processors) {
            Object.values(await processor.validate(async () => {
                completedStages++
                process.send({ response: 'validateProgress', percent: Math.trunc((completedStages / numStages) * 100) })
            }))
                .flat()
                .forEach(asset => assets.push(asset))
        }
        this.assets = assets
        process.send({ response: 'validateComplete', invalidCount: this.assets.length })
    }

    async download(_message) {
        const expectedTotalSize = getExpectedDownloadSize(this.assets)
        log.debug('Expected download size ' + expectedTotalSize)
        this.assets.forEach(({ id }) => log.debug(`Asset Requires Download: ${id}`))

        // Reduce load on IPC channel by sending only whole numbers.
        let currentPercent = 0
        const receivedEach = await downloadQueue(this.assets, received => {
            const nextPercent = Math.trunc((received / expectedTotalSize) * 100)
            if (currentPercent !== nextPercent) {
                currentPercent = nextPercent
                process.send({ response: 'downloadProgress', percent: currentPercent })
            }
        })

        for (const asset of this.assets) {
            if (asset.size !== receivedEach[asset.id]) {
                log.warn(`Asset ${asset.id} declared a size of ${asset.size} bytes, but ${receivedEach[asset.id]} were received!`)
                if (!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
                    log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
                }
            }
        }

        for (const processor of this.processors) {
            await processor.postDownload()
        }
        process.send({ response: 'downloadComplete' })
    }

}

module.exports = { FullRepairReceiver }
