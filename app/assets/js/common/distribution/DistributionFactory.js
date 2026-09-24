const { Type, Platform, JdkDistribution } = require('../../distribution-types')
const { MavenUtil } = require('../util/MavenUtil')
const { join } = require('path')
const { LoggerUtil } = require('../../util/LoggerUtil')
const { mcVersionAtLeast } = require('../util/MojangUtils')

const logger = LoggerUtil.getLogger('DistributionFactory')

class HeliosDistribution {

    rawDistribution
    mainServerIndex
    servers

    constructor(rawDistribution, commonDir, instanceDir) {
        this.rawDistribution = rawDistribution
        this.resolveMainServerIndex()
        this.servers = this.rawDistribution.servers.map(s => new HeliosServer(s, commonDir, instanceDir))
    }

    resolveMainServerIndex() {
        if (this.rawDistribution.servers.length > 0) {
            for (let i = 0; i < this.rawDistribution.servers.length; i++) {
                if (this.mainServerIndex == null) {
                    if (this.rawDistribution.servers[i].mainServer) {
                        this.mainServerIndex = i
                    }
                } else {
                    this.rawDistribution.servers[i].mainServer = false
                }
            }
            if (this.mainServerIndex == null) {
                this.mainServerIndex = 0
                this.rawDistribution.servers[this.mainServerIndex].mainServer = true
            }
        } else {
            logger.warn('Distribution has 0 configured servers. This doesnt seem right..')
            this.mainServerIndex = 0
        }
    }

    getMainServer() {
        return this.mainServerIndex < this.servers.length ? this.servers[this.mainServerIndex] : null
    }

    getServerById(id) {
        return this.servers.find(s => s.rawServer.id === id) || null
    }

}

class HeliosServer {

    rawServer
    modules
    hostname
    port
    effectiveJavaOptions

    constructor(rawServer, commonDir, instanceDir) {
        this.rawServer = rawServer
        const { hostname, port } = this.parseAddress()
        this.hostname = hostname
        this.port = port
        this.effectiveJavaOptions = this.parseEffectiveJavaOptions()
        this.modules = rawServer.modules.map(m => new HeliosModule(m, rawServer.id, commonDir, instanceDir))
    }

    parseAddress() {
        // Srv record lookup here if needed.
        if (this.rawServer.address.includes(':')) {
            const pieces = this.rawServer.address.split(':')
            const port = Number(pieces[1])
            if (!Number.isInteger(port)) {
                throw new Error(`Malformed server address for ${this.rawServer.id}. Port must be an integer!`)
            }
            return { hostname: pieces[0], port }
        } else {
            return { hostname: this.rawServer.address, port: 25565 }
        }
    }

    parseEffectiveJavaOptions() {
        const platformOptions = this.rawServer.javaOptions?.platformOptions ?? []
        let archOption = null
        let platformOption = null
        for (const option of platformOptions) {
            if (option.platform !== process.platform) {
                continue
            }
            if (option.architecture === process.arch) {
                archOption = option
            } else {
                platformOption = option
            }
        }
        const serverOption = {
            distribution: this.rawServer.javaOptions?.distribution,
            supported: this.rawServer.javaOptions?.supported,
            suggestedMajor: this.rawServer.javaOptions?.suggestedMajor
        }
        const merged = {}
        // Lowest to highest precedence. A present option overwrites all three
        // fields, missing values are filled by the defaults afterwards.
        for (const option of [serverOption, platformOption, archOption]) {
            if (option != null) {
                merged.distribution = option.distribution
                merged.supported = option.supported
                merged.suggestedMajor = option.suggestedMajor
            }
        }
        return this.defaultUndefinedJavaOptions(merged)
    }

    defaultUndefinedJavaOptions(props) {
        const [defaultRange, defaultSuggestion] = this.defaultJavaVersion()
        return {
            supported: props.supported ?? defaultRange,
            distribution: props.distribution ?? this.defaultJavaPlatform(),
            suggestedMajor: props.suggestedMajor ?? defaultSuggestion,
        }
    }

    defaultJavaVersion() {
        if (mcVersionAtLeast('1.20.5', this.rawServer.minecraftVersion)) {
            return ['>=21.x', 21]
        } else if (mcVersionAtLeast('1.17', this.rawServer.minecraftVersion)) {
            return ['>=17.x', 17]
        } else {
            return ['8.x', 8]
        }
    }

    defaultJavaPlatform() {
        return process.platform === Platform.DARWIN ? JdkDistribution.CORRETTO : JdkDistribution.TEMURIN
    }

}

class HeliosModule {

    rawModule
    serverId
    subModules
    mavenComponents
    required
    localPath

    constructor(rawModule, serverId, commonDir, instanceDir) {
        this.rawModule = rawModule
        this.serverId = serverId
        this.mavenComponents = this.resolveMavenComponents()
        this.required = this.resolveRequired()
        this.localPath = this.resolveLocalPath(commonDir, instanceDir)
        if (this.rawModule.subModules != null) {
            this.subModules = this.rawModule.subModules.map(m => new HeliosModule(m, serverId, commonDir, instanceDir))
        } else {
            this.subModules = []
        }
    }

    resolveMavenComponents() {
        // Files need not have a maven identifier if they provide a path.
        if (this.rawModule.type === Type.File && this.rawModule.artifact.path != null) {
            return null
        }
        // Version Manifests never provide a maven identifier.
        if (this.rawModule.type === Type.VersionManifest) {
            return null
        }
        const isMavenId = MavenUtil.isMavenIdentifier(this.rawModule.id)
        if (!isMavenId) {
            if (this.rawModule.type !== Type.File) {
                throw new Error(`Module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type} must have a valid maven identifier!`)
            } else {
                throw new Error(`Module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type} must either declare an artifact path or have a valid maven identifier!`)
            }
        }
        try {
            return MavenUtil.getMavenComponents(this.rawModule.id)
        } catch (err) {
            throw new Error(`Failed to resolve maven components for module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type}. Reason: ${err.message}`)
        }
    }

    resolveRequired() {
        if (this.rawModule.required == null) {
            return {
                value: true,
                def: true
            }
        } else {
            return {
                value: this.rawModule.required.value ?? true,
                def: this.rawModule.required.def ?? true
            }
        }
    }

    resolveLocalPath(commonDir, instanceDir) {
        // Version Manifests have a pre-determined path.
        if (this.rawModule.type === Type.VersionManifest) {
            return join(commonDir, 'versions', this.rawModule.id, `${this.rawModule.id}.json`)
        }
        const relativePath = this.rawModule.artifact.path ?? MavenUtil.mavenComponentsAsNormalizedPath(this.mavenComponents.group, this.mavenComponents.artifact, this.mavenComponents.version, this.mavenComponents.classifier, this.mavenComponents.extension)
        switch (this.rawModule.type) {
            case Type.Library:
            case Type.Forge:
            case Type.ForgeHosted:
            case Type.Fabric:
            case Type.LiteLoader:
                return join(commonDir, 'libraries', relativePath)
            case Type.ForgeMod:
            case Type.LiteMod:
                // TODO Move to /mods/forge eventually..
                return join(commonDir, 'modstore', relativePath)
            case Type.FabricMod:
                return join(commonDir, 'mods', 'fabric', relativePath)
            case Type.File:
            default:
                return join(instanceDir, this.serverId, relativePath)
        }
    }

    hasMavenComponents() {
        return this.mavenComponents != null
    }

    getMavenComponents() {
        return this.mavenComponents
    }

    getRequired() {
        return this.required
    }

    getPath() {
        return this.localPath
    }

    getMavenIdentifier() {
        return MavenUtil.mavenComponentsToIdentifier(this.mavenComponents.group, this.mavenComponents.artifact, this.mavenComponents.version, this.mavenComponents.classifier, this.mavenComponents.extension)
    }

    getExtensionlessMavenIdentifier() {
        return MavenUtil.mavenComponentsToExtensionlessIdentifier(this.mavenComponents.group, this.mavenComponents.artifact, this.mavenComponents.version, this.mavenComponents.classifier)
    }

    getVersionlessMavenIdentifier() {
        return MavenUtil.mavenComponentsToVersionlessIdentifier(this.mavenComponents.group, this.mavenComponents.artifact, this.mavenComponents.classifier)
    }

    hasSubModules() {
        return this.subModules.length > 0
    }

}

module.exports = { HeliosDistribution, HeliosServer, HeliosModule }
