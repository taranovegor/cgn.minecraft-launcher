const test = require('node:test')
const assert = require('node:assert')

const Lang = require('../app/assets/js/langloader')

test('langloader parses toml and queries keys', () => {
    Lang.setupLanguage()
    assert.strictEqual(Lang.queryEJS('landing.launchButton'), 'Играть')
    assert.strictEqual(Lang.queryEJS('landing.serverStatusPlaceholder'), 'Оффлайн')
    assert.strictEqual(typeof Lang.queryJS('landing.discord.loading'), 'string')
    assert.ok(Lang.queryJS('landing.discord.loading').length > 0)
})

test('langloader applies custom overrides', () => {
    Lang.setupLanguage()
    assert.strictEqual(Lang.queryEJS('app.title'), 'CraftGame.net / Launcher')
})
