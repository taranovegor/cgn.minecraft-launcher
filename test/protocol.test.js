const test = require('node:test')
const assert = require('node:assert')

const { ServerBoundPacket, ClientBoundPacket, ProtocolUtils } = require('../app/assets/js/mojang')

test('packets round-trip varints and strings', () => {
    const buffer = ServerBoundPacket.build()
        .writeVarInt(0x00)
        .writeString('localhost')
        .writeUnsignedShort(25565)
        .writeVarInt(1)
        .toBuffer()

    const inbound = new ClientBoundPacket(buffer)
    inbound.readVarInt() // packet length
    assert.strictEqual(inbound.readVarInt(), 0x00)
    assert.strictEqual(inbound.readString(), 'localhost')
})

test('getVarIntSize matches encoded length', () => {
    for (const value of [0, 1, 127, 128, 255, 300, 2147483647]) {
        const encoded = ServerBoundPacket.build().writeVarInt(value).toBuffer()
        // First byte is the packet length varint, rest is the value varint.
        assert.strictEqual(ProtocolUtils.getVarIntSize(value), encoded.length - 1)
    }
})

test('readVarInt rejects oversized values', () => {
    const inbound = new ClientBoundPacket([0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    assert.throws(() => inbound.readVarInt(), /VarInt is too big/)
})
