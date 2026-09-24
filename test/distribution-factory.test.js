const test = require('node:test')
const assert = require('node:assert')
const path = require('path')

const { HeliosDistribution } = require('../app/assets/js/common')
const { Type, Platform, JdkDistribution } = require('../app/assets/js/distribution-types')

const raw = {
    servers: [
        { id: 'main', name: 'Main', address: 'mc.example.net:25566', mainServer: true, minecraftVersion: '1.20.6', modules: [] },
        { id: 'legacy', name: 'Legacy', address: 'mc.example.net', minecraftVersion: '1.8.9', modules: [] },
        {
            id: 'modded',
            name: 'Modded',
            address: 'mc.example.net',
            minecraftVersion: '1.16.5',
            modules: [
                { id: 'mods/example.jar', name: 'Example', type: Type.File, artifact: { path: 'mods/example.jar', size: 10, url: 'http://x/y', MD5: 'h' } },
                { id: 'com.example:lib:1.0', name: 'Lib', type: Type.Library, artifact: { size: 1, url: 'u', MD5: 'm' }, required: null }
            ]
        }
    ]
}

const distro = new HeliosDistribution(raw, '/common', '/instance')

test('HeliosDistribution resolves the main server', () => {
    assert.strictEqual(distro.getMainServer().rawServer.id, 'main')
    assert.strictEqual(distro.getServerById('missing'), null)
})

test('HeliosServer parses addresses', () => {
    assert.strictEqual(distro.getMainServer().hostname, 'mc.example.net')
    assert.strictEqual(distro.getMainServer().port, 25566)
    assert.strictEqual(distro.getServerById('legacy').port, 25565)
})

test('HeliosServer resolves effective java options', () => {
    const expectedDistribution = process.platform === Platform.DARWIN ? JdkDistribution.CORRETTO : JdkDistribution.TEMURIN
    assert.deepStrictEqual(distro.getMainServer().effectiveJavaOptions, {
        supported: '>=21.x',
        distribution: expectedDistribution,
        suggestedMajor: 21
    })
    assert.deepStrictEqual(distro.getServerById('legacy').effectiveJavaOptions, {
        supported: '8.x',
        distribution: expectedDistribution,
        suggestedMajor: 8
    })
})

test('HeliosModule resolves paths and identifiers', () => {
    const modules = distro.getServerById('modded').modules
    assert.strictEqual(modules[0].getPath(), path.join('/instance', 'modded', 'mods/example.jar'))
    assert.strictEqual(modules[1].getVersionlessMavenIdentifier(), 'com.example:lib')
    assert.strictEqual(modules[1].hasMavenComponents(), true)
    assert.deepStrictEqual(modules[1].getRequired(), { value: true, def: true })
})
