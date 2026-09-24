process.env.NODE_ENV = 'test'

const test = require('node:test')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const Module = require('module')

const userData = path.join(os.tmpdir(), 'cgn-launcher-cm-test')
fs.removeSync(userData)

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
    if (request === '@electron/remote') {
        return { app: { getPath: () => userData } }
    }
    return origLoad.apply(this, arguments)
}

const ConfigManager = require('../app/assets/js/configmanager')

test('loads defaults and persists changes', () => {
    ConfigManager.load()
    assert.strictEqual(ConfigManager.getLauncherDirectory(), userData)

    ConfigManager.setDataDirectory('/data/x')
    assert.strictEqual(ConfigManager.getDataDirectory(), '/data/x')
    assert.strictEqual(ConfigManager.getCommonDirectory(), path.join('/data/x', 'common'))
    assert.strictEqual(ConfigManager.getInstanceDirectory(), path.join('/data/x', 'instances'))

    ConfigManager.addCgnAccount('uuid-1', 'tok', 'User@Example.com')
    assert.strictEqual(ConfigManager.getAccount().uuid, 'uuid-1')
    assert.strictEqual(ConfigManager.getAccount().displayName, 'User@Example.com')
    ConfigManager.updateCgnAuthAccount('uuid-1', 'Display', 'tok2')
    assert.strictEqual(ConfigManager.getAccount().displayName, 'Display')

    ConfigManager.setSelectedServer('srv-1')
    assert.strictEqual(ConfigManager.getSelectedServer(), 'srv-1')
    ConfigManager.setClientToken('ct')
    assert.strictEqual(ConfigManager.getClientToken(), 'ct')

    ConfigManager.setModConfigurations([])
    ConfigManager.setModConfiguration('srv-1', { id: 'srv-1', mods: {} })
    assert.strictEqual(ConfigManager.getModConfiguration('srv-1').id, 'srv-1')
    assert.strictEqual(ConfigManager.getModConfiguration('nope'), null)

    ConfigManager.ensureJavaConfig('srv-1', { suggestedMajor: 17 }, null)
    assert.strictEqual(ConfigManager.getJavaExecutable('srv-1'), null)
    ConfigManager.setMinRAM('srv-1', '5G')
    ConfigManager.setMaxRAM('srv-1', '6G')
    ConfigManager.setJavaExecutable('srv-1', '/java')
    ConfigManager.setJVMOptions('srv-1', ['-X'])
    assert.strictEqual(ConfigManager.getMinRAM('srv-1'), '5G')
    assert.strictEqual(ConfigManager.getJVMOptions('srv-1')[0], '-X')

    ConfigManager.setGameWidth('1920')
    ConfigManager.setGameHeight('1080')
    ConfigManager.setFullscreen(true)
    ConfigManager.setAutoConnect(false)
    ConfigManager.setAllowPrerelease(true)
    assert.strictEqual(ConfigManager.getGameWidth(), 1920)
    assert.strictEqual(ConfigManager.getGameHeight(), 1080)
    assert.strictEqual(ConfigManager.getFullscreen(), true)
    assert.strictEqual(ConfigManager.getAutoConnect(), false)
    assert.strictEqual(ConfigManager.getAllowPrerelease(), true)

    ConfigManager.save()
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'))
    assert.strictEqual(saved.settings.game.resWidth, 1920)
    assert.strictEqual(saved.selectedServer, 'srv-1')
    assert.strictEqual(saved.settings.launcher.allowPrerelease, true)
})

test('game dimension validators', () => {
    assert.strictEqual(ConfigManager.validateGameWidth('100'), true)
    assert.strictEqual(ConfigManager.validateGameWidth('x'), false)
    assert.strictEqual(ConfigManager.validateGameHeight('200'), true)
    assert.strictEqual(ConfigManager.validateGameHeight('-5'), false)
})
