const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const ejs = require('ejs')

const APP = path.join(__dirname, '..', 'app')

test('ejs renders interpolation', () => {
    const out = ejs.render('Hello <%= name %>', { name: 'World' })
    assert.strictEqual(out, 'Hello World')
})

test('ejs renders app templates', () => {
    const file = path.join(APP, 'frame.ejs')
    const out = ejs.render(
        fs.readFileSync(file, 'utf8'),
        { lang: (key) => key, process: { platform: 'linux' } },
        { filename: file }
    )
    assert.ok(out.includes('frameBar'))
    assert.ok(out.includes('frameButton_close'))
})
