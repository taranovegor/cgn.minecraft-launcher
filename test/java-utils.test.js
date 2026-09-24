const test = require('node:test')
const assert = require('node:assert')
const path = require('path')

const java = require('../app/assets/js/java')

test('parseJavaRuntimeVersion handles legacy and semver formats', () => {
    assert.deepStrictEqual(java.parseJavaRuntimeVersion('1.8.0_152-b16'), { major: 8, minor: 0, patch: 152 })
    assert.deepStrictEqual(java.parseJavaRuntimeVersionLegacy('1.8.0_292'), { major: 8, minor: 0, patch: 292 })
    assert.deepStrictEqual(java.parseJavaRuntimeVersionSemver('17.0.2+8'), { major: 17, minor: 0, patch: 2 })
    assert.deepStrictEqual(java.parseJavaRuntimeVersion('21.0.1'), { major: 21, minor: 0, patch: 1 })
    assert.strictEqual(java.parseJavaRuntimeVersion('not-a-version'), null)
})

test('javaVersionToString formats a version object', () => {
    assert.strictEqual(java.javaVersionToString({ major: 17, minor: 0, patch: 2 }), '17.0.2')
})

test('javaExecFromRoot resolves the platform executable', () => {
    const root = '/opt/java'
    if (process.platform === 'win32') {
        assert.strictEqual(java.javaExecFromRoot(root), path.join(root, 'bin', 'javaw.exe'))
    } else if (process.platform === 'darwin') {
        assert.strictEqual(java.javaExecFromRoot(root), path.join(root, 'Contents', 'Home', 'bin', 'java'))
    } else {
        assert.strictEqual(java.javaExecFromRoot(root), path.join(root, 'bin', 'java'))
    }
})

test('ensureJavaDirIsRoot strips the executable path', () => {
    if (process.platform === 'darwin') {
        assert.strictEqual(java.ensureJavaDirIsRoot('/Library/Java/x/Contents/Home'), '/Library/Java/x')
    } else {
        assert.strictEqual(java.ensureJavaDirIsRoot('/usr/lib/jvm/jdk/bin/java'), '/usr/lib/jvm/jdk')
    }
})

test('getPossibleJavaEnvs and getLauncherRuntimeDir', () => {
    assert.deepStrictEqual(java.getPossibleJavaEnvs(), ['JAVA_HOME', 'JRE_HOME', 'JDK_HOME'])
    assert.strictEqual(java.getLauncherRuntimeDir('/data'), path.join('/data', 'runtime', process.arch))
})

test('rankApplicableJvms orders newest first and prefers JRE on ties', () => {
    const mk = (major, minor, patch, p) => ({ semver: { major, minor, patch }, path: p })
    const list = [mk(8, 0, 0, '/jre8'), mk(17, 0, 2, '/jdk17'), mk(17, 0, 1, '/jdk17old')]
    java.rankApplicableJvms(list)
    assert.deepStrictEqual(list.map(v => v.path), ['/jdk17', '/jdk17old', '/jre8'])
})

test('filterApplicableJavaPaths keeps 64-bit implementations in range', () => {
    const settings = {
        '/jdk17': { 'sun.arch.data.model': '64', 'java.version': '17.0.2', 'java.vendor': 'Eclipse', 'os.arch': 'amd64' },
        '/jdk8': { 'sun.arch.data.model': '64', 'java.version': '1.8.0_292', 'java.vendor': 'Oracle', 'os.arch': 'amd64' },
        '/jdk32': { 'sun.arch.data.model': '32', 'java.version': '8.0.1', 'java.vendor': 'Oracle', 'os.arch': 'x86' }
    }
    const result = java.filterApplicableJavaPaths(settings, '>=17.x')
    assert.deepStrictEqual(result.map(v => v.path), ['/jdk17'])
})
