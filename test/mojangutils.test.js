const test = require('node:test')
const assert = require('node:assert')

const { getMojangOS, isLibraryCompatible, validateLibraryNatives, mcVersionAtLeast } = require('../app/assets/js/common')

test('getMojangOS maps the platform', () => {
    const expected = process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'windows' : 'linux'
    assert.strictEqual(getMojangOS(), expected)
})

test('mcVersionAtLeast handles major version jumps (26.x)', () => {
    assert.strictEqual(mcVersionAtLeast('1.13', '26.1.2'), true)
    assert.strictEqual(mcVersionAtLeast('1.17', '1.16.5'), false)
    assert.strictEqual(mcVersionAtLeast('1.17', '1.17'), true)
    assert.strictEqual(mcVersionAtLeast('1.20.5', '1.20.4'), false)
    assert.strictEqual(mcVersionAtLeast('1.20.5', '1.20.6'), true)
    assert.strictEqual(mcVersionAtLeast('8', '17.0.2'), true)
})

test('isLibraryCompatible respects rules and natives', () => {
    const natives = { [getMojangOS()]: 'natives' }
    assert.strictEqual(isLibraryCompatible(null, null), true)
    assert.strictEqual(isLibraryCompatible(null, natives), true)
    assert.strictEqual(validateLibraryNatives(natives), true)
    assert.strictEqual(isLibraryCompatible([{ action: 'allow', os: { name: getMojangOS() } }], null), true)
    assert.strictEqual(isLibraryCompatible([{ action: 'allow', os: { name: 'other-os' } }], null), false)
})
