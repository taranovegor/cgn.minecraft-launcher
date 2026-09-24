const test = require('node:test')
const assert = require('node:assert')

const { MojangErrorCode, decipherErrorCode, isInternalError } = require('../app/assets/js/mojang')

test('decipherErrorCode maps response bodies', () => {
    assert.strictEqual(decipherErrorCode({ error: 'Method Not Allowed' }), MojangErrorCode.ERROR_METHOD_NOT_ALLOWED)
    assert.strictEqual(decipherErrorCode({ error: 'Not Found' }), MojangErrorCode.ERROR_NOT_FOUND)
    assert.strictEqual(decipherErrorCode({ error: 'Unsupported Media Type' }), MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE)
    assert.strictEqual(
        decipherErrorCode({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token.' }),
        MojangErrorCode.ERROR_INVALID_TOKEN
    )
    assert.strictEqual(
        decipherErrorCode({ error: 'ForbiddenOperationException', cause: 'UserMigratedException' }),
        MojangErrorCode.ERROR_USER_MIGRATED
    )
    assert.strictEqual(
        decipherErrorCode({ error: 'IllegalArgumentException', errorMessage: 'Access token already has a profile assigned.' }),
        MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE
    )
    assert.strictEqual(decipherErrorCode({ error: 'GoneException' }), MojangErrorCode.ERROR_GONE)
    assert.strictEqual(decipherErrorCode({ error: 'Something Else' }), MojangErrorCode.UNKNOWN)
})

test('isInternalError flags code problems only', () => {
    assert.strictEqual(isInternalError(MojangErrorCode.ERROR_NOT_FOUND), true)
    assert.strictEqual(isInternalError(MojangErrorCode.ERROR_METHOD_NOT_ALLOWED), true)
    assert.strictEqual(isInternalError(MojangErrorCode.ERROR_INVALID_TOKEN), false)
    assert.strictEqual(isInternalError(MojangErrorCode.UNKNOWN), false)
})
