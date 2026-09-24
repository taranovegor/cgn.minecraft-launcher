const test = require('node:test')
const assert = require('node:assert')

test('vendored modules load and expose APIs', () => {
    const common = require('../app/assets/js/common')
    const dl = require('../app/assets/js/dl')
    const java = require('../app/assets/js/java')
    const mojang = require('../app/assets/js/mojang')
    const types = require('../app/assets/js/distribution-types')

    assert.strictEqual(typeof common.DistributionAPI, 'function')
    assert.strictEqual(typeof common.MavenUtil.mavenComponentsToVersionlessIdentifier, 'function')
    assert.strictEqual(typeof dl.downloadFile, 'function')
    assert.strictEqual(dl.HashAlgo.SHA1, 'sha1')
    assert.strictEqual(typeof java.extractJdk, 'function')
    assert.strictEqual(typeof mojang.MojangRestAPI.authenticate, 'function')
    assert.strictEqual(types.Type.File, 'File')
})

test('RestResponse handles errors without throwing', () => {
    const { handleGotError, RestResponseStatus } = require('../app/assets/js/common/rest/RestResponse')
    const logger = { error() {}, debug() {} }
    const response = handleGotError('Test Operation', new Error('boom'), logger, () => 'payload')
    assert.strictEqual(response.responseStatus, RestResponseStatus.ERROR)
    assert.strictEqual(response.data, 'payload')
})
