process.env.NODE_ENV = 'test'

const test = require('node:test')
const assert = require('node:assert')
const util = require('util')
const fs = require('fs-extra')
const Module = require('module')

const cpState = { stderr: '', error: null }

const fakeExec = (cmd, ...rest) => {
    const cb = rest[rest.length - 1]
    setImmediate(() => cb(cpState.error, '', cpState.stderr))
}
fakeExec[util.promisify.custom] = () => new Promise((resolve, reject) => {
    setImmediate(() => cpState.error ? reject(cpState.error) : resolve({ stdout: '', stderr: cpState.stderr }))
})

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
    if (request === 'child_process' || request === 'node:child_process') {
        return { exec: fakeExec }
    }
    return origLoad.apply(this, arguments)
}

const java = require('../app/assets/js/java')

test('getHotSpotSettings parses multi-line properties', async () => {
    const original = fs.pathExists
    fs.pathExists = async () => true
    cpState.stderr = [
        '    java.library.path = /usr/lib/jvm/java-17/lib',
        '        /usr/java/packages/lib',
        '    java.version = 17.0.2',
        '    java.vendor = Eclipse Adoptium'
    ].join('\n')
    const settings = await java.getHotSpotSettings('/usr/bin/javaw.exe')
    fs.pathExists = original
    assert.deepStrictEqual(settings['java.library.path'], ['/usr/lib/jvm/java-17/lib', '/usr/java/packages/lib'])
    assert.strictEqual(settings['java.version'], '17.0.2')
    assert.strictEqual(settings['java.vendor'], 'Eclipse Adoptium')
})

test('getHotSpotSettings returns null when the executable is missing', async () => {
    const original = fs.pathExists
    fs.pathExists = async () => false
    const settings = await java.getHotSpotSettings('/does/not/exist')
    fs.pathExists = original
    assert.strictEqual(settings, null)
})
