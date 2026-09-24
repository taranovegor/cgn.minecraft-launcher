process.env.NODE_ENV = 'test'

const test = require('node:test')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const Module = require('module')

const userData = path.join(os.tmpdir(), 'cgn-launcher-pb-userdata')

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
    if (request === '@electron/remote') {
        return { app: { getPath: () => userData } }
    }
    return origLoad.apply(this, arguments)
}

const ConfigManager = require('../app/assets/js/configmanager')
Object.assign(ConfigManager, {
    getAutoConnect: () => true,
    getFullscreen: () => false,
    getGameWidth: () => 854,
    getGameHeight: () => 480,
    getMaxRAM: () => '2G',
    getMinRAM: () => '1G',
    getJVMOptions: () => ['-Dxx=1'],
    getDataDirectory: () => path.join(os.tmpdir(), 'cgn-launcher-pb-dd'),
    getTempNativeFolder: () => 'WCNatives',
    getModConfiguration: () => ({ mods: {} }),
    getJavaExecutable: () => '/usr/bin/java',
    getSelectedServer: () => 'srv',
    getInstanceDirectory: () => path.join(os.tmpdir(), 'cgn-launcher-pb-inst'),
    getCommonDirectory: () => path.join(os.tmpdir(), 'cgn-launcher-pb-common')
})

const ProcessBuilder = require('../app/assets/js/processbuilder')
const { Type } = require('../app/assets/js/distribution-types')

function makeContext(mcVersion, modId) {
    const ctx = Object.create(ProcessBuilder.prototype)
    ctx.server = { rawServer: { id: 'srv', minecraftVersion: mcVersion, autoconnect: true }, hostname: 'h', port: 25565, modules: [] }
    ctx.vanillaManifest = {
        id: mcVersion,
        type: 'release',
        assets: '5',
        libraries: [],
        arguments: {
            jvm: ['-Dfoo=${version_name}'],
            game: ['--username', '${auth_player_name}']
        }
    }
    ctx.modManifest = {
        id: modId || `${mcVersion}-forge-50.0.0`,
        mainClass: 'MainClass',
        arguments: { jvm: ['--module-path', '${library_directory}'], game: ['--launchTarget', 'forgeclient'] },
        minecraftArguments: '--username ${auth_player_name} --version ${version_name}'
    }
    ctx.authUser = { displayName: 'Player', uuid: 'uuid-123', accessToken: 'tok', type: 'mojang' }
    ctx.launcherVersion = '0.14.0'
    ctx.gameDir = path.join(os.tmpdir(), 'cgn-launcher-pb-game')
    ctx.commonDir = path.join(os.tmpdir(), 'cgn-launcher-pb-common')
    ctx.libPath = path.join(ctx.commonDir, 'libraries')
    ctx.fmlDir = path.join(ctx.gameDir, 'forgeModList.json')
    ctx.llDir = path.join(ctx.gameDir, 'liteloaderModList.json')
    ctx.forgeModListFile = path.join(ctx.gameDir, 'forgeMods.list')
    ctx.usingLiteLoader = false
    ctx.usingFabricLoader = false
    ctx.llPath = null
    return ctx
}

test('ProcessBuilder statics', () => {
    assert.strictEqual(ProcessBuilder.getClasspathSeparator(), process.platform === 'win32' ? ';' : ':')

    assert.strictEqual(ProcessBuilder.isModEnabled(null), true)
    assert.strictEqual(ProcessBuilder.isModEnabled(true), true)
    assert.strictEqual(ProcessBuilder.isModEnabled(false), false)
    assert.strictEqual(ProcessBuilder.isModEnabled({ value: false }), false)
    assert.strictEqual(ProcessBuilder.isModEnabled({ value: true }), true)
    assert.strictEqual(ProcessBuilder.isModEnabled({}), true)
    assert.strictEqual(ProcessBuilder.isModEnabled(null, { def: false }), false)
    assert.strictEqual(ProcessBuilder.isModEnabled(null, { def: true }), true)
})

test('_requiresAbsolute distinguishes old and new forge', () => {
    const oldCtx = makeContext('1.7.10', '1.7.10-forge-10.13.4.1614')
    const newCtx = makeContext('1.12.2', '1.12.2-forge-14.23.5.2847')
    assert.strictEqual(oldCtx._lteMinorVersion(9), true)
    assert.strictEqual(oldCtx._requiresAbsolute(), false)
    assert.strictEqual(newCtx._lteMinorVersion(9), false)
    assert.strictEqual(newCtx._requiresAbsolute(), true)
})

test('_resolveModuleLibraries walks submodules and skips non-classpath libs', () => {
    const ctx = makeContext('1.16.5')
    const leaf = { rawModule: { type: Type.Library, classpath: true }, subModules: [], getVersionlessMavenIdentifier: () => 'g:leaf', getPath: () => '/leaf' }
    const skipped = { rawModule: { type: Type.Library, classpath: false }, subModules: [], getVersionlessMavenIdentifier: () => 'g:skip', getPath: () => '/skip' }
    const root = { rawModule: { type: Type.File }, subModules: [leaf, skipped], getVersionlessMavenIdentifier: () => 'g:root' }
    assert.deepStrictEqual(ctx._resolveModuleLibraries(root), { 'g:leaf': '/leaf' })
})

test('_processAutoConnectArg uses quickPlay on 1.20+', () => {
    const modern = makeContext('1.20.6')
    const modernArgs = []
    modern._processAutoConnectArg(modernArgs)
    assert.deepStrictEqual(modernArgs, ['--quickPlayMultiplayer', 'h:25565'])

    const legacy = makeContext('1.12.2')
    const legacyArgs = []
    legacy._processAutoConnectArg(legacyArgs)
    assert.deepStrictEqual(legacyArgs, ['--server', 'h', '--port', 25565])
})

test('constructJVMArguments builds classpath and does not mutate the manifest', () => {
    const ctx = makeContext('1.12.2')
    const before = ctx.vanillaManifest.arguments.jvm.length
    const args = ctx.constructJVMArguments([], path.join(os.tmpdir(), 'cgn-launcher-pb-natives'))
    assert.ok(args.includes('-cp'))
    assert.ok(args.some(a => a.startsWith('-Djava.library.path=')))
    assert.ok(args.includes('MainClass'))

    ctx.constructJVMArguments([], path.join(os.tmpdir(), 'cgn-launcher-pb-natives'))
    assert.strictEqual(ctx.vanillaManifest.arguments.jvm.length, before)
})
