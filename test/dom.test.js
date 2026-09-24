const test = require('node:test')
const assert = require('node:assert')

function loadDom() {
    global.window = {}
    global.document = { querySelector: () => null }
    global.getComputedStyle = (el) => ({ display: el.__computed })
    const domPath = require.resolve('../app/assets/js/scripts/dom.js')
    delete require.cache[domPath]
    require(domPath)
    return global.window.dom
}

function makeElement(computed) {
    return {
        __computed: computed,
        style: {},
        animate() {
            return { finished: Promise.resolve(), cancel() {} }
        }
    }
}

test('dom.show reveals an element hidden by a stylesheet as block', () => {
    const dom = loadDom()
    const el = makeElement('none')
    dom.show(el)
    assert.strictEqual(el.style.display, 'block')
})

test('dom.show keeps the stylesheet display when it is not none', () => {
    const dom = loadDom()
    const el = makeElement('flex')
    dom.show(el)
    assert.strictEqual(el.style.display, '')
})

test('dom.hide sets display none and runs the complete callback', () => {
    const dom = loadDom()
    const el = makeElement('block')
    let completed = false
    dom.hide(el, 0, () => { completed = true })
    assert.strictEqual(el.style.display, 'none')
    assert.strictEqual(completed, true)
})

test('dom.fadeIn restores display and opacity after animating', async () => {
    const dom = loadDom()
    const el = makeElement('none')
    let completed = false
    await dom.fadeIn(el, 100, () => { completed = true })
    assert.strictEqual(el.style.display, 'block')
    assert.strictEqual(el.style.opacity, '')
    assert.strictEqual(completed, true)
})
