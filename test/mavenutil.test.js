const test = require('node:test')
const assert = require('node:assert')

const { MavenUtil } = require('../app/assets/js/common')

test('MavenUtil builds identifiers', () => {
    assert.strictEqual(
        MavenUtil.mavenComponentsToIdentifier('com.a', 'b', '1.0', 'nat', 'jar'),
        'com.a:b:1.0:nat@jar'
    )
    assert.strictEqual(
        MavenUtil.mavenComponentsToIdentifier('com.a', 'b', '1.0'),
        'com.a:b:1.0'
    )
    assert.strictEqual(
        MavenUtil.mavenComponentsToExtensionlessIdentifier('com.a', 'b', '1.0', 'nat'),
        'com.a:b:1.0:nat'
    )
    assert.strictEqual(
        MavenUtil.mavenComponentsToVersionlessIdentifier('com.a', 'b', 'nat'),
        'com.a:b:nat'
    )
})

test('MavenUtil parses identifiers', () => {
    assert.deepStrictEqual(MavenUtil.getMavenComponents('com.a:b:1.0:nat@jar'), {
        group: 'com.a',
        artifact: 'b',
        version: '1.0',
        classifier: 'nat',
        extension: 'jar'
    })
    assert.strictEqual(MavenUtil.isMavenIdentifier('com.a:b:1.0'), true)
    assert.strictEqual(MavenUtil.isMavenIdentifier('not-an-identifier'), false)
    assert.throws(() => MavenUtil.getMavenComponents('not-an-identifier'))
})

test('MavenUtil builds paths', () => {
    assert.strictEqual(
        MavenUtil.mavenComponentsAsPath('com.a', 'b', '1.0', 'nat', 'jar'),
        'com/a/b/1.0/b-1.0-nat.jar'
    )
    assert.strictEqual(
        MavenUtil.mavenComponentsAsPath('com.a', 'b', '1.0'),
        'com/a/b/1.0/b-1.0.jar'
    )
    assert.strictEqual(
        MavenUtil.mavenIdentifierAsPath('com.a:b:1.0@jar'),
        'com/a/b/1.0/b-1.0.jar'
    )
})
