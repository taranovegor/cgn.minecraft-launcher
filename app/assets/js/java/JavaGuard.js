const { exec } = require('child_process')
const fs = require('fs-extra')
const got = require('got')
const { Platform, Architecture, JdkDistribution } = require('../distribution-types')
const { join, dirname } = require('path')
const { promisify } = require('util')
const { LoggerUtil } = require('../util/LoggerUtil')
const Winreg = require('winreg')
const semver = require('semver')
const { HashAlgo } = require('../dl')
const { extractZip, extractTarGz } = require('../common/util/FileUtils')

const log = LoggerUtil.getLogger('JavaGuard')

const execAsync = promisify(exec)

/**
 * Get the target JDK's properties. Only HotSpot VMs are officially
 * supported, as properties may change between VMs. Usage of internal
 * properties should be avoided.
 *
 * @param execPath The path to the Java executable.
 * @returns The parsed HotSpot VM properties.
 */
async function getHotSpotSettings(execPath) {
    const javaExecutable = execPath.includes('javaw.exe') ? execPath.replace('javaw.exe', 'java.exe') : execPath
    if (!await fs.pathExists(execPath)) {
        log.warn(`Candidate JVM path does not exist, skipping. ${execPath}`)
        return null
    }
    let stderr
    try {
        stderr = (await execAsync(`"${javaExecutable}" -XshowSettings:properties -version`)).stderr
    } catch (error) {
        log.error(`Failed to resolve JVM settings for '${execPath}'`)
        log.error(error)
        return null
    }
    return parseHotSpotSettings(stderr)
}

/**
 * Parses the stderr output of `java -XshowSettings:properties -version`.
 * Properties use a 4 space indent, continuation lines use 8 spaces.
 *
 * @param {string} stderr The command stderr.
 * @returns The parsed HotSpot VM properties.
 */
function parseHotSpotSettings(stderr) {
    const listProps = [
        'java.library.path'
    ]
    const ret = {}
    const split = stderr.split('\n')
    let lastProp = null
    for (const prop of split) {
        if (prop.startsWith('        ')) {
            // Add to previous prop.
            if (!Array.isArray(ret[lastProp])) {
                ret[lastProp] = [ret[lastProp]]
            }
            ret[lastProp].push(prop.trim())
        } else if (prop.startsWith('    ')) {
            const tmp = prop.split('=')
            const key = tmp[0].trim()
            const val = tmp[1].trim()
            ret[key] = val
            lastProp = key
        }
    }
    for (const key of listProps) {
        if (ret[key] != null && !Array.isArray(ret[key])) {
            ret[key] = [ret[key]]
        }
    }
    return ret
}

async function resolveJvmSettings(paths) {
    const ret = {}
    for (const path of paths) {
        const settings = await getHotSpotSettings(javaExecFromRoot(path))
        if (settings != null) {
            ret[path] = settings
        } else {
            log.warn(`Skipping invalid JVM candidate: ${path}`)
        }
    }
    return ret
}

function filterApplicableJavaPaths(resolvedSettings, semverRange) {
    const arm = process.arch === Architecture.ARM64
    const jvmDetailsUnfiltered = Object.entries(resolvedSettings)
        .filter(([, settings]) => parseInt(settings['sun.arch.data.model']) === 64) // Only allow 64-bit.
        .filter(([, settings]) => arm ? settings['os.arch'] === 'aarch64' : true) // Only allow arm on arm architecture (disallow rosetta on m2 mac)
        .map(([path, settings]) => {
            const parsedVersion = parseJavaRuntimeVersion(settings['java.version'])
            if (parsedVersion == null) {
                log.error(`Failed to parse JDK version at location '${path}' (Vendor: ${settings['java.vendor']})`)
                return null
            }
            return {
                semver: parsedVersion,
                semverStr: javaVersionToString(parsedVersion),
                vendor: settings['java.vendor'],
                path
            }
        })
        .filter(x => x != null)
    // Now filter by options.
    const jvmDetails = jvmDetailsUnfiltered
        .filter(details => semver.satisfies(details.semverStr, semverRange))
    return jvmDetails
}

function rankApplicableJvms(details) {
    details.sort((a, b) => {
        if (a.semver.major === b.semver.major) {
            if (a.semver.minor === b.semver.minor) {
                if (a.semver.patch === b.semver.patch) {
                    // Same version, give priority to JRE.
                    if (a.path.toLowerCase().includes('jdk')) {
                        return b.path.toLowerCase().includes('jdk') ? 0 : 1
                    } else {
                        return -1
                    }
                } else {
                    return (a.semver.patch - b.semver.patch) * -1
                }
            } else {
                return (a.semver.minor - b.semver.minor) * -1
            }
        } else {
            return (a.semver.major - b.semver.major) * -1
        }
    })
}

// Used to discover the best installation.
async function discoverBestJvmInstallation(dataDir, semverRange) {
    // Get candidates, filter duplicates out.
    const paths = [...new Set(await getValidatableJavaPaths(dataDir))]
    // Get VM settings.
    const resolvedSettings = await resolveJvmSettings(paths)
    // Filter
    const jvmDetails = filterApplicableJavaPaths(resolvedSettings, semverRange)
    // Rank
    rankApplicableJvms(jvmDetails)
    return jvmDetails.length > 0 ? jvmDetails[0] : null
}

// Used to validate the selected jvm.
async function validateSelectedJvm(path, semverRange) {
    if (!await fs.pathExists(path)) {
        return null
    }
    // Get VM settings.
    const resolvedSettings = await resolveJvmSettings([path])
    // Filter
    const jvmDetails = filterApplicableJavaPaths(resolvedSettings, semverRange)
    // Rank
    rankApplicableJvms(jvmDetails)
    return jvmDetails.length > 0 ? jvmDetails[0] : null
}

/**
 * Fetch the last open JDK binary.
 *
 * HOTFIX: Uses Corretto 8 for macOS.
 * See: https://github.com/dscalzi/HeliosLauncher/issues/70
 * See: https://github.com/AdoptOpenJDK/openjdk-support/issues/101
 *
 * @param {number} major The major version of Java to fetch.
 *
 * @returns {Promise.<RemoteJdkDistribution | null>} Promise which resolved to an object containing the JDK download data.
 */
async function latestOpenJDK(major, dataDir, distribution) {
    if (distribution == null) {
        // If no distribution is specified, use Corretto on macOS and Temurin for all else.
        if (process.platform === Platform.DARWIN) {
            return latestCorretto(major, dataDir)
        } else {
            return latestAdoptium(major, dataDir)
        }
    } else {
        // Respect the preferred distribution.
        switch (distribution) {
            case JdkDistribution.TEMURIN:
                return latestAdoptium(major, dataDir)
            case JdkDistribution.CORRETTO:
                return latestCorretto(major, dataDir)
            default: {
                const eMsg = `Unknown distribution '${distribution}'`
                log.error(eMsg)
                throw new Error(eMsg)
            }
        }
    }
}

async function latestAdoptium(major, dataDir) {
    const sanitizedOS = process.platform === Platform.WIN32 ? 'windows' : (process.platform === Platform.DARWIN ? 'mac' : process.platform)
    const arch = process.arch === Architecture.ARM64 ? 'aarch64' : Architecture.X64
    const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?vendor=eclipse`
    try {
        const res = await got.get(url, { responseType: 'json' })
        if (res.body.length > 0) {
            const targetBinary = res.body.find(entry => {
                return entry.version.major === major
                    && entry.binary.os === sanitizedOS
                    && entry.binary.image_type === 'jdk'
                    && entry.binary.architecture === arch
            })
            if (targetBinary != null) {
                return {
                    url: targetBinary.binary.package.link,
                    size: targetBinary.binary.package.size,
                    id: targetBinary.binary.package.name,
                    hash: targetBinary.binary.package.checksum,
                    algo: HashAlgo.SHA256,
                    path: join(getLauncherRuntimeDir(dataDir), targetBinary.binary.package.name)
                }
            } else {
                log.error(`Failed to find a suitable Adoptium binary for JDK ${major} (${sanitizedOS} ${arch}).`)
                return null
            }
        } else {
            log.error(`Adoptium returned no results for JDK ${major}.`)
            return null
        }
    } catch (err) {
        log.error(`Error while retrieving latest Adoptium JDK ${major} binaries.`, err)
        return null
    }
}

async function latestCorretto(major, dataDir) {
    let sanitizedOS, ext
    const arch = process.arch === Architecture.ARM64 ? 'aarch64' : Architecture.X64
    switch (process.platform) {
        case Platform.WIN32:
            sanitizedOS = 'windows'
            ext = 'zip'
            break
        case Platform.DARWIN:
            sanitizedOS = 'macos'
            ext = 'tar.gz'
            break
        case Platform.LINUX:
            sanitizedOS = 'linux'
            ext = 'tar.gz'
            break
        default:
            sanitizedOS = process.platform
            ext = 'tar.gz'
            break
    }
    const url = `https://corretto.aws/downloads/latest/amazon-corretto-${major}-${arch}-${sanitizedOS}-jdk.${ext}`
    const md5url = `https://corretto.aws/downloads/latest_checksum/amazon-corretto-${major}-${arch}-${sanitizedOS}-jdk.${ext}`
    try {
        const res = await got.head(url)
        const checksum = await got.get(md5url)
        if (res.statusCode === 200) {
            const name = url.substring(url.lastIndexOf('/') + 1)
            return {
                url: url,
                size: parseInt(res.headers['content-length']),
                id: name,
                hash: checksum.body,
                algo: HashAlgo.MD5,
                path: join(getLauncherRuntimeDir(dataDir), name)
            }
        } else {
            log.error(`Error while retrieving latest Corretto JDK ${major} (${sanitizedOS} ${arch}): ${res.statusCode} ${res.statusMessage ?? ''}`)
            return null
        }
    } catch (err) {
        log.error(`Error while retrieving latest Corretto JDK ${major} (${sanitizedOS} ${arch}).`, err)
        return null
    }
}

async function extractJdk(archivePath) {
    let javaExecPath = null
    if (archivePath.endsWith('zip')) {
        await extractZip(archivePath, async (zip) => {
            const entries = await zip.entries()
            javaExecPath = javaExecFromRoot(join(dirname(archivePath), Object.keys(entries)[0]))
        })
    } else {
        await extractTarGz(archivePath, header => {
            // Get the first
            if (javaExecPath == null) {
                let h = header.name
                if (h.includes('/')) {
                    h = h.substring(0, h.indexOf('/'))
                }
                javaExecPath = javaExecFromRoot(join(dirname(archivePath), h))
            }
        })
    }
    return javaExecPath
}

/**
 * Returns the path of the OS-specific executable for the given Java
 * installation. Supported OS's are win32, darwin, linux.
 *
 * @param {string} rootDir The root directory of the Java installation.
 * @returns {string} The path to the Java executable.
 */
function javaExecFromRoot(rootDir) {
    switch (process.platform) {
        case Platform.WIN32:
            return join(rootDir, 'bin', 'javaw.exe')
        case Platform.DARWIN:
            return join(rootDir, 'Contents', 'Home', 'bin', 'java')
        case Platform.LINUX:
            return join(rootDir, 'bin', 'java')
        default:
            return rootDir
    }
}

/**
 * Given a Java path, ensure it points to the root.
 *
 * @param dir The untested path.
 * @returns The root java path.
 */
function ensureJavaDirIsRoot(dir) {
    switch (process.platform) {
        case Platform.DARWIN: {
            const index = dir.indexOf('/Contents/Home')
            return index > -1 ? dir.substring(0, index) : dir
        }
        case Platform.WIN32:
        case Platform.LINUX:
        default: {
            const index = dir.indexOf(join('/', 'bin', 'java'))
            return index > -1 ? dir.substring(0, index) : dir
        }
    }
}

/**
 * Parses a full Java Runtime version string and resolves
 * the version information. Dynamically detects the formatting
 * to use.
 *
 * @param {string} verString Full version string to parse.
 * @returns Object containing the version information.
 */
function parseJavaRuntimeVersion(verString) {
    if (verString.startsWith('1.')) {
        return parseJavaRuntimeVersionLegacy(verString)
    } else {
        return parseJavaRuntimeVersionSemver(verString)
    }
}

/**
 * Parses a full Java Runtime version string and resolves
 * the version information. Uses Java 8 formatting.
 *
 * @param {string} verString Full version string to parse.
 * @returns Object containing the version information.
 */
function parseJavaRuntimeVersionLegacy(verString) {
    // 1.{major}.0_{update}-b{build}
    // ex. 1.8.0_152-b16
    const regex = /1.(\d+).(\d+)_(\d+)(?:-b(\d+))?/
    const match = regex.exec(verString)
    if (match == null) {
        log.error(`Failed to parse legacy Java version: ${verString}`)
        return null
    }
    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
    }
}

/**
 * Parses a full Java Runtime version string and resolves
 * the version information. Uses Java 9+ formatting.
 *
 * @param {string} verString Full version string to parse.
 * @returns Object containing the version information.
 */
function parseJavaRuntimeVersionSemver(verString) {
    // {major}.{minor}.{patch}+{build}
    // ex. 10.0.2+13 or 10.0.2.13
    const regex = /(\d+)\.(\d+).(\d+)(?:[+.](\d+))?/
    const match = regex.exec(verString)
    if (match == null) {
        log.error(`Failed to parse semver Java version: ${verString}`)
        return null
    }
    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
    }
}

function javaVersionToString({ major, minor, patch }) {
    return `${major}.${minor}.${patch}`
}

class PathBasedJavaDiscoverer {

    paths

    constructor(paths) {
        this.paths = paths
    }

    async discover() {
        const res = new Set()
        for (const path of this.paths) {
            if (await fs.pathExists(javaExecFromRoot(path))) {
                res.add(path)
            }
        }
        return [...res]
    }

}

class DirectoryBasedJavaDiscoverer {

    directories

    constructor(directories) {
        this.directories = directories
    }

    async discover() {
        const res = new Set()
        for (const directory of this.directories) {
            if (await fs.pathExists(directory)) {
                const files = await fs.readdir(directory)
                for (const file of files) {
                    const fullPath = join(directory, file)
                    if (await fs.pathExists(javaExecFromRoot(fullPath))) {
                        res.add(fullPath)
                    }
                }
            }
        }
        return [...res]
    }

}

class EnvironmentBasedJavaDiscoverer {

    keys

    constructor(keys) {
        this.keys = keys
    }

    async discover() {
        const res = new Set()
        for (const key of this.keys) {
            const value = process.env[key]
            if (value != null) {
                const asRoot = ensureJavaDirIsRoot(value)
                if (await fs.pathExists(asRoot)) {
                    res.add(asRoot)
                }
            }
        }
        return [...res]
    }

}

class Win32RegistryJavaDiscoverer {

    async discover() {
        const regKeys = [
            '\\SOFTWARE\\JavaSoft\\Java Runtime Environment', // Java 8 and prior
            '\\SOFTWARE\\JavaSoft\\Java Development Kit', // Java 8 and prior
            '\\SOFTWARE\\JavaSoft\\JRE', // Java 9+
            '\\SOFTWARE\\JavaSoft\\JDK' // Java 9+
        ]
        const candidates = new Set()
        await Promise.all(regKeys.map(regKey => this.discoverKey(regKey, candidates)))
        return [...candidates]
    }

    discoverKey(regKey, candidates) {
        return new Promise((resolve) => {
            const key = new Winreg({
                hive: Winreg.HKLM,
                key: regKey,
                arch: 'x64'
            })
            key.keyExists((err, exists) => {
                if (!exists) {
                    resolve()
                    return
                }
                key.keys(async (err, javaVers) => {
                    if (err) {
                        console.error(err)
                        resolve()
                        return
                    }
                    await Promise.all(javaVers.map(javaVer => this.discoverVersion(javaVer, candidates)))
                    resolve()
                })
            })
        })
    }

    discoverVersion(javaVer, candidates) {
        return new Promise((resolve) => {
            const vKey = javaVer.key.substring(javaVer.key.lastIndexOf('\\') + 1).trim()
            let major = -1
            if (vKey.length > 0) {
                if (isNaN(vKey)) {
                    // Should be a semver key.
                    major = parseJavaRuntimeVersion(vKey)?.major ?? -1
                } else {
                    // This is an abbreviated version, ie 1.8 or 17.
                    const asNum = parseFloat(vKey)
                    if (asNum < 2) {
                        // 1.x
                        major = asNum % 1 * 10
                    } else {
                        major = asNum
                    }
                }
            }
            if (major <= -1) {
                resolve()
                return
            }
            javaVer.get('JavaHome', (err, res) => {
                const jHome = res.value
                // Exclude 32bit.
                if (!jHome.includes('(x86)')) {
                    candidates.add(jHome)
                }
                resolve()
            })
        })
    }

}

async function getValidatableJavaPaths(dataDir) {
    let discoverers
    switch (process.platform) {
        case Platform.WIN32:
            discoverers = await getWin32Discoverers(dataDir)
            break
        case Platform.DARWIN:
            discoverers = await getDarwinDiscoverers(dataDir)
            break
        case Platform.LINUX:
            discoverers = await getLinuxDiscoverers(dataDir)
            break
        default:
            discoverers = []
            log.warn(`Unable to discover Java paths on platform: ${process.platform}`)
    }
    let paths = []
    for (const discover of discoverers) {
        paths = [
            ...paths,
            ...await discover.discover()
        ]
    }
    return [...(new Set(paths))]
}

async function getWin32Discoverers(dataDir) {
    return [
        new EnvironmentBasedJavaDiscoverer(getPossibleJavaEnvs()),
        new DirectoryBasedJavaDiscoverer([
            ...(await getPathsOnAllDrivesWin32([
                'Program Files\\Java',
                'Program Files\\Eclipse Adoptium',
                'Program Files\\Eclipse Foundation',
                'Program Files\\AdoptOpenJDK',
                'Program Files\\Amazon Corretto'
            ])),
            getLauncherRuntimeDir(dataDir)
        ]),
        new Win32RegistryJavaDiscoverer()
    ]
}

async function getDarwinDiscoverers(dataDir) {
    return [
        new EnvironmentBasedJavaDiscoverer(getPossibleJavaEnvs()),
        new DirectoryBasedJavaDiscoverer([
            '/Library/Java/JavaVirtualMachines',
            getLauncherRuntimeDir(dataDir)
        ]),
        new PathBasedJavaDiscoverer([
            '/Library/Internet Plug-Ins/JavaAppletPlugin.plugin' // /Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java
        ])
    ]
}

async function getLinuxDiscoverers(dataDir) {
    return [
        new EnvironmentBasedJavaDiscoverer(getPossibleJavaEnvs()),
        new DirectoryBasedJavaDiscoverer([
            '/usr/lib/jvm',
            getLauncherRuntimeDir(dataDir)
        ])
    ]
}

async function win32DriveMounts() {
    let stdout
    try {
        stdout = (await execAsync('gdr -psp FileSystem | select -eXp root | ConvertTo-Json', { shell: 'powershell.exe' })).stdout
    } catch (error) {
        log.error('Failed to resolve drive mounts!')
        log.error(error)
        // Default to C:\\
        return ['C:\\']
    }
    return JSON.parse(stdout)
}

async function getPathsOnAllDrivesWin32(paths) {
    const driveMounts = await win32DriveMounts()
    const res = []
    for (const path of paths) {
        for (const mount of driveMounts) {
            res.push(join(mount, path))
        }
    }
    return res
}

function getPossibleJavaEnvs() {
    return [
        'JAVA_HOME',
        'JRE_HOME',
        'JDK_HOME'
    ]
}

function getLauncherRuntimeDir(dataDir) {
    return join(dataDir, 'runtime', process.arch)
}

module.exports = {
    getHotSpotSettings,
    resolveJvmSettings,
    filterApplicableJavaPaths,
    rankApplicableJvms,
    discoverBestJvmInstallation,
    validateSelectedJvm,
    latestOpenJDK,
    latestAdoptium,
    latestCorretto,
    extractJdk,
    javaExecFromRoot,
    ensureJavaDirIsRoot,
    parseJavaRuntimeVersion,
    parseJavaRuntimeVersionLegacy,
    parseJavaRuntimeVersionSemver,
    javaVersionToString,
    getValidatableJavaPaths,
    getWin32Discoverers,
    getDarwinDiscoverers,
    getLinuxDiscoverers,
    win32DriveMounts,
    getPathsOnAllDrivesWin32,
    getPossibleJavaEnvs,
    getLauncherRuntimeDir,
    PathBasedJavaDiscoverer,
    DirectoryBasedJavaDiscoverer,
    EnvironmentBasedJavaDiscoverer,
    Win32RegistryJavaDiscoverer
}
