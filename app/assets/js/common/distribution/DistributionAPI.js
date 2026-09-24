const { resolve } = require('path')
const fs = require('fs-extra')
const { fetchJson } = require('../../http')
const { LoggerUtil } = require('../../util/LoggerUtil')
const { RestResponseStatus, handleGotError } = require('../rest/RestResponse')
const { HeliosDistribution } = require('./DistributionFactory')

// TODO Option to check endpoint for hash of distro for local compare
// Useful if distro is large (MBs)
class DistributionAPI {

    static log = LoggerUtil.getLogger('DistributionAPI')

    DISTRO_FILE = 'distribution.json'
    DISTRO_FILE_DEV = 'distribution_dev.json'

    launcherDirectory
    commonDir
    instanceDir
    remoteUrl
    devMode
    distroPath
    distroDevPath
    distribution
    rawDistribution

    constructor(launcherDirectory, commonDir, instanceDir, remoteUrl, devMode) {
        this.launcherDirectory = launcherDirectory
        this.commonDir = commonDir
        this.instanceDir = instanceDir
        this.remoteUrl = remoteUrl
        this.devMode = devMode
        this.distroPath = resolve(launcherDirectory, this.DISTRO_FILE)
        this.distroDevPath = resolve(launcherDirectory, this.DISTRO_FILE_DEV)
    }

    setDirectories(commonDir, instanceDir) {
        this.commonDir = commonDir
        this.instanceDir = instanceDir
    }

    async getDistribution() {
        if (this.rawDistribution == null) {
            this.rawDistribution = await this.loadDistribution()
            this.distribution = new HeliosDistribution(this.rawDistribution, this.commonDir, this.instanceDir)
        }
        return this.distribution
    }

    async getDistributionLocalLoadOnly() {
        if (this.rawDistribution == null) {
            const x = await this.pullLocal()
            if (x == null) {
                throw new Error('FATAL: Unable to load distribution from local disk.')
            }
            this.rawDistribution = x
            this.distribution = new HeliosDistribution(this.rawDistribution, this.commonDir, this.instanceDir)
        }
        return this.distribution
    }

    async refreshDistributionOrFallback() {
        const distro = await this._loadDistributionNullable()
        if (distro == null) {
            DistributionAPI.log.warn('Failed to refresh distribution, falling back to current load (if exists).')
            return this.distribution
        } else {
            this.rawDistribution = distro
            this.distribution = new HeliosDistribution(distro, this.commonDir, this.instanceDir)
            return this.distribution
        }
    }

    isDevMode() {
        return this.devMode
    }

    async loadDistribution() {
        const distro = await this._loadDistributionNullable()
        if (distro == null) {
            // TODO Bubble this up nicer
            throw new Error('FATAL: Unable to load distribution from remote server or local disk.')
        }
        return distro
    }

    async _loadDistributionNullable() {
        let distro
        if (!this.devMode) {
            distro = (await this.pullRemote()).data
            if (distro == null) {
                distro = await this.pullLocal()
            } else {
                await this.writeDistributionToDisk(distro)
            }
        } else {
            distro = await this.pullLocal()
        }
        return distro
    }

    async pullRemote() {
        try {
            const res = await fetchJson(this.remoteUrl)
            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }
        } catch (error) {
            return handleGotError('Pull Remote', error, DistributionAPI.log, () => null)
        }
    }

    async writeDistributionToDisk(distribution) {
        await fs.writeJson(this.distroPath, distribution)
    }

    async pullLocal() {
        return await this.readDistributionFromFile(!this.devMode ? this.distroPath : this.distroDevPath)
    }

    async readDistributionFromFile(path) {
        if (await fs.pathExists(path)) {
            const raw = await fs.readFile(path, 'utf-8')
            try {
                return JSON.parse(raw)
            } catch (error) {
                DistributionAPI.log.error(`Malformed distribution file at ${path}`)
                return null
            }
        } else {
            DistributionAPI.log.error(`No distribution file found at ${path}!`)
            return null
        }
    }

}

module.exports = { DistributionAPI }
