const got = require('got')
const { join, dirname } = require('path')
const fs = require('fs-extra')
const { HashAlgo } = require('../Asset')
const { AssetGuardError } = require('../AssetGuardError')
const { IndexProcessor } = require('../IndexProcessor')
const { calculateHashByBuffer, getVersionJsonPath, getLibraryDir, getVersionJarPath, validateLocalFile } = require('../../common/util/FileUtils')
const { isLibraryCompatible, getMojangOS } = require('../../common/util/MojangUtils')
const { LoggerUtil } = require('../../util/LoggerUtil')
const { handleGotError } = require('../../common/rest/RestResponse')

class MojangIndexProcessor extends IndexProcessor {

    static LAUNCHER_JSON_ENDPOINT = 'https://launchermeta.mojang.com/mc/launcher.json'
    static VERSION_MANIFEST_ENDPOINT = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
    static ASSET_RESOURCE_ENDPOINT = 'https://resources.download.minecraft.net'
    static logger = LoggerUtil.getLogger('MojangIndexProcessor')

    version
    versionJson
    assetIndex
    client = got.extend({
        responseType: 'json'
    })
    assetPath

    constructor(commonDir, version) {
        super(commonDir)
        this.version = version
        this.assetPath = join(commonDir, 'assets')
    }

    /*
     * Download https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
     *   Unable to download:
     *     Proceed, check versions directory for target version
     *       If version.json not present, fatal error.
     *       If version.json present, load and use.
     *   Able to download:
     *     Download, use in memory only.
     *     Locate target version entry.
     *     Extract hash
     *     Validate local exists and matches hash
     *       Condition fails: download
     *         Download fails: fatal error
     *         Download succeeds: Save to disk, continue
     *       Passes: load from file
     *
     * Version JSON in memory
     *   Extract assetIndex
     *     Check that local exists and hash matches
     *       if false, download
     *         download fails: fatal error
     *       if true: load from disk and use
     *
     * complete init when 3 files are validated and loaded.
     */
    async init() {
        const versionManifest = await this.loadVersionManifest()
        this.versionJson = await this.loadVersionJson(this.version, versionManifest)
        this.assetIndex = await this.loadAssetIndex(this.versionJson)
    }

    // Can be called without init - needed for launch process.
    async getVersionJson() {
        const versionManifest = await this.loadVersionManifest()
        return await this.loadVersionJson(this.version, versionManifest)
    }

    async loadAssetIndex(versionJson) {
        const assetIndexPath = this.getAssetIndexPath(versionJson.assetIndex.id)
        const assetIndex = await this.loadContentWithRemoteFallback(versionJson.assetIndex.url, assetIndexPath, { algo: HashAlgo.SHA1, value: versionJson.assetIndex.sha1 })
        if (assetIndex == null) {
            throw new AssetGuardError(`Failed to download ${versionJson.assetIndex.id} asset index.`)
        }
        return assetIndex
    }

    async loadVersionJson(version, versionManifest) {
        const versionJsonPath = getVersionJsonPath(this.commonDir, version)
        if (versionManifest != null) {
            const versionInfo = versionManifest.versions.find(({ id }) => id === version)
            if (versionInfo == null) {
                throw new AssetGuardError(`Invalid version: ${version}.`)
            }
            const versionJson = await this.loadContentWithRemoteFallback(versionInfo.url, versionJsonPath, { algo: HashAlgo.SHA1, value: versionInfo.sha1 })
            if (versionJson == null) {
                throw new AssetGuardError(`Failed to download ${version} json index.`)
            }
            return versionJson
        } else {
            // Attempt to find local index.
            if (await fs.pathExists(versionJsonPath)) {
                return await fs.readJson(versionJsonPath)
            } else {
                throw new AssetGuardError(`Unable to load version manifest and ${version} json index does not exist locally.`)
            }
        }
    }

    async loadContentWithRemoteFallback(url, path, hash) {
        try {
            if (await fs.pathExists(path)) {
                const buf = await fs.readFile(path)
                if (hash) {
                    const bufHash = calculateHashByBuffer(buf, hash.algo)
                    if (bufHash === hash.value) {
                        return JSON.parse(buf.toString())
                    }
                } else {
                    return JSON.parse(buf.toString())
                }
            }
        } catch (error) {
            throw new AssetGuardError(`Failure while loading ${path}.`, error)
        }
        try {
            const res = await this.client.get(url)
            await fs.ensureDir(dirname(path))
            await fs.writeFile(path, JSON.stringify(res.body))
            return res.body
        } catch (error) {
            return handleGotError(url, error, MojangIndexProcessor.logger, () => null).data
        }
    }

    async loadVersionManifest() {
        try {
            const res = await this.client.get(MojangIndexProcessor.VERSION_MANIFEST_ENDPOINT)
            return res.body
        } catch (error) {
            return handleGotError('Load Mojang Version Manifest', error, MojangIndexProcessor.logger, () => null).data
        }
    }

    getAssetIndexPath(id) {
        return join(this.assetPath, 'indexes', `${id}.json`)
    }

    totalStages() {
        return 4
    }

    async validate(onStageComplete) {
        const assets = await this.validateAssets(this.assetIndex)
        await onStageComplete()
        const libraries = await this.validateLibraries(this.versionJson)
        await onStageComplete()
        const client = await this.validateClient(this.versionJson)
        await onStageComplete()
        const logConfig = await this.validateLogConfig(this.versionJson)
        await onStageComplete()
        return {
            assets,
            libraries,
            client,
            misc: [
                ...logConfig
            ]
        }
    }

    async postDownload() {
        // no-op
    }

    async validateAssets(assetIndex) {
        const objectDir = join(this.assetPath, 'objects')
        const notValid = []
        for (const assetEntry of Object.entries(assetIndex.objects)) {
            const hash = assetEntry[1].hash
            const path = join(objectDir, hash.substring(0, 2), hash)
            const url = `${MojangIndexProcessor.ASSET_RESOURCE_ENDPOINT}/${hash.substring(0, 2)}/${hash}`
            if (!await validateLocalFile(path, HashAlgo.SHA1, hash)) {
                notValid.push({
                    id: assetEntry[0],
                    hash,
                    algo: HashAlgo.SHA1,
                    size: assetEntry[1].size,
                    url,
                    path
                })
            }
        }
        return notValid
    }

    async validateLibraries(versionJson) {
        const libDir = getLibraryDir(this.commonDir)
        const notValid = []
        for (const libEntry of versionJson.libraries) {
            if (isLibraryCompatible(libEntry.rules, libEntry.natives)) {
                let artifact
                if (libEntry.natives == null) {
                    artifact = libEntry.downloads.artifact
                } else {
                    const classifier = libEntry.natives[getMojangOS()].replace('${arch}', process.arch.replace('x', ''))
                    artifact = libEntry.downloads.classifiers[classifier]
                }
                const path = join(libDir, artifact.path)
                const hash = artifact.sha1
                if (!await validateLocalFile(path, HashAlgo.SHA1, hash)) {
                    notValid.push({
                        id: libEntry.name,
                        hash,
                        algo: HashAlgo.SHA1,
                        size: artifact.size,
                        url: artifact.url,
                        path
                    })
                }
            }
        }
        return notValid
    }

    async validateClient(versionJson) {
        const version = versionJson.id
        const versionJarPath = getVersionJarPath(this.commonDir, version)
        const hash = versionJson.downloads.client.sha1
        if (!await validateLocalFile(versionJarPath, HashAlgo.SHA1, hash)) {
            return [{
                id: `${version} client`,
                hash,
                algo: HashAlgo.SHA1,
                size: versionJson.downloads.client.size,
                url: versionJson.downloads.client.url,
                path: versionJarPath
            }]
        }
        return []
    }

    async validateLogConfig(versionJson) {
        const logFile = versionJson.logging.client.file
        const path = join(this.assetPath, 'log_configs', logFile.id)
        const hash = logFile.sha1
        if (!await validateLocalFile(path, HashAlgo.SHA1, hash)) {
            return [{
                id: logFile.id,
                hash,
                algo: HashAlgo.SHA1,
                size: logFile.size,
                url: logFile.url,
                path
            }]
        }
        return []
    }

}

module.exports = { MojangIndexProcessor }
