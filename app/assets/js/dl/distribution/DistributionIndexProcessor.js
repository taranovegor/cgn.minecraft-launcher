const { LoggerUtil } = require('../../util/LoggerUtil')
const { IndexProcessor } = require('../IndexProcessor')
const { AssetGuardError } = require('../AssetGuardError')
const { validateLocalFile, getVersionJsonPath } = require('../../common/util/FileUtils')
const { HashAlgo } = require('../Asset')
const { Type } = require('../../distribution-types')
const { mcVersionAtLeast } = require('../../common/util/MojangUtils')
const fs = require('fs-extra')
const StreamZip = require('node-stream-zip')
const { dirname } = require('path')

class DistributionIndexProcessor extends IndexProcessor {

    static logger = LoggerUtil.getLogger('DistributionIndexProcessor')

    distribution
    serverId

    constructor(commonDir, distribution, serverId) {
        super(commonDir)
        this.distribution = distribution
        this.serverId = serverId
    }

    async init() {
        // no-op
    }

    totalStages() {
        return 1
    }

    async validate(onStageComplete) {
        const server = this.distribution.getServerById(this.serverId)
        if (server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`)
        }
        const notValid = []
        await this.validateModules(server.modules, notValid)
        await onStageComplete()
        return {
            distribution: notValid
        }
    }

    async postDownload() {
        await this.loadModLoaderVersionJson()
    }

    async validateModules(modules, accumulator) {
        for (const module of modules) {
            const hash = module.rawModule.artifact.MD5
            if (!await validateLocalFile(module.getPath(), HashAlgo.MD5, hash)) {
                accumulator.push({
                    id: module.rawModule.id,
                    hash: hash,
                    algo: HashAlgo.MD5,
                    size: module.rawModule.artifact.size,
                    url: module.rawModule.artifact.url,
                    path: module.getPath()
                })
            }
            if (module.hasSubModules()) {
                await this.validateModules(module.subModules, accumulator)
            }
        }
    }

    async loadModLoaderVersionJson() {
        const server = this.distribution.getServerById(this.serverId)
        if (server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`)
        }
        const modLoaderModule = server.modules.find(({ rawModule: { type } }) => type === Type.ForgeHosted || type === Type.Forge || type === Type.Fabric)
        if (modLoaderModule == null) {
            throw new AssetGuardError('No mod loader found!')
        }
        if (modLoaderModule.rawModule.type === Type.Fabric
            || DistributionIndexProcessor.isForgeGradle3(server.rawServer.minecraftVersion, modLoaderModule.getMavenComponents().version)) {
            return await this.loadVersionManifest(modLoaderModule)
        } else {
            const zip = new StreamZip.async({ file: modLoaderModule.getPath() })
            try {
                const data = JSON.parse((await zip.entryData('version.json')).toString('utf8'))
                const writePath = getVersionJsonPath(this.commonDir, data.id)
                await fs.ensureDir(dirname(writePath))
                await fs.writeJson(writePath, data)
                return data
            } finally {
                await zip.close()
            }
        }
    }

    async loadVersionManifest(modLoaderModule) {
        const versionManifstModule = modLoaderModule.subModules.find(({ rawModule: { type } }) => type === Type.VersionManifest)
        if (versionManifstModule == null) {
            throw new AssetGuardError('No mod loader version manifest module found!')
        }
        return await fs.readJson(versionManifstModule.getPath(), 'utf-8')
    }

    // TODO Move this to a util maybe
    static isForgeGradle3(mcVersion, forgeVersion) {
        if (mcVersionAtLeast('1.13', mcVersion)) {
            return true
        }
        try {
            const forgeVer = forgeVersion.split('-')[1]
            const maxFG2 = [14, 23, 5, 2847]
            const verSplit = forgeVer.split('.').map(v => Number(v))
            for (let i = 0; i < maxFG2.length; i++) {
                if (verSplit[i] > maxFG2[i]) {
                    return true
                } else if (verSplit[i] < maxFG2[i]) {
                    return false
                }
            }
            return false
        } catch (err) {
            throw new Error('Forge version is complex (changed).. launcher requires a patch.')
        }
    }

}

module.exports = { DistributionIndexProcessor }
