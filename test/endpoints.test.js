const test = require('node:test')
const assert = require('node:assert')

test('endpoints expose craftgame service urls', () => {
    const endpoints = require('../app/assets/js/endpoints')
    assert.strictEqual(endpoints.AUTH, 'https://ygg.mc.craftgame.net/auth')
    assert.strictEqual(endpoints.AUTHLIB_INJECTOR, 'https://ygg.mc.craftgame.net/authlib-injector')
    assert.strictEqual(endpoints.WEBSITE_AUTH, 'https://craftgame.net/launcher/auth')
    assert.strictEqual(endpoints.SERVER_LIST, 'https://craftgame.net/server-list')
    assert.strictEqual(endpoints.BACKGROUND, 'https://mc.craftgame.net/background.png')
})

test('ipcconstants define the launcher opcodes', () => {
    const ipc = require('../app/assets/js/ipcconstants')
    assert.strictEqual(ipc.CGN_OPCODE.ON_LOGIN, 'CGN_ON_LOGIN')
    assert.strictEqual(ipc.SHELL_OPCODE.TRASH_ITEM, 'TRASH_ITEM')
})
