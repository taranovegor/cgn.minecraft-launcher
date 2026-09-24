process.env.NODE_ENV = 'test'

const test = require('node:test')
const assert = require('node:assert')

const KEYS = {
    jre8: '\\SOFTWARE\\JavaSoft\\Java Runtime Environment',
    jdk8: '\\SOFTWARE\\JavaSoft\\Java Development Kit',
    jre9: '\\SOFTWARE\\JavaSoft\\JRE',
    jdk9: '\\SOFTWARE\\JavaSoft\\JDK'
}

let spec = {}

class FakeWinreg {
    static HKLM = 'HKLM'
    constructor(opts) { this.key = opts.key }
    keyExists(cb) {
        setImmediate(() => cb(null, !!(spec[this.key] && spec[this.key].exists)))
    }
    keys(cb) {
        setImmediate(() => {
            const s = spec[this.key] || {}
            if (s.keysError) { cb(s.keysError); return }
            cb(null, (s.subKeys || []).map(sub => ({
                key: `${this.key}\\${sub.vKey}`,
                get: (name, gcb) => setImmediate(() => gcb(null, { value: sub.home }))
            })))
        })
    }
}

const winregPath = require.resolve('winreg')
require.cache[winregPath] = { id: winregPath, filename: winregPath, loaded: true, exports: FakeWinreg, children: [], paths: [] }

const java = require('../app/assets/js/java')

const sub = (vKey, home) => ({ vKey, home })

test('discovers 64-bit registry java installs and skips x86', async () => {
    spec = {
        [KEYS.jre9]: { exists: true, subKeys: [sub('17', 'C:\\Java\\jre-17')] },
        [KEYS.jdk9]: { exists: true, subKeys: [sub('21.0.1', 'C:\\Java\\jdk-21')] },
        [KEYS.jre8]: { exists: true, subKeys: [sub('1.8', 'C:\\Program Files (x86)\\Java\\jre1.8'), sub('1.8', 'C:\\Java\\jre1.8')] },
        [KEYS.jdk8]: { exists: false }
    }
    const result = (await new java.Win32RegistryJavaDiscoverer().discover()).sort()
    assert.deepStrictEqual(result, ['C:\\Java\\jdk-21', 'C:\\Java\\jre-17', 'C:\\Java\\jre1.8'].sort())
})

test('skips unparseable version keys', async () => {
    spec = { [KEYS.jdk9]: { exists: true, subKeys: [sub('beta', 'C:\\Java\\beta'), sub('17.0.2', 'C:\\Java\\jdk-17')] } }
    assert.deepStrictEqual(await new java.Win32RegistryJavaDiscoverer().discover(), ['C:\\Java\\jdk-17'])
})

test('no registry keys yields an empty list', async () => {
    spec = {}
    assert.deepStrictEqual(await new java.Win32RegistryJavaDiscoverer().discover(), [])
})
