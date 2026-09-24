// Work in progress
const { LoggerUtil } = require('./util/LoggerUtil')

const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('@xhayper/discord-rpc')

const Lang = require('./langloader')

let client
let activity
let texts = {}

// Discord status texts can be overridden per distribution/server in the
// distribution index (server-list) and fall back to the bundled language file.
function resolveText(servSettings, genSettings, key, fallbackKey, tokens) {
    const custom = servSettings?.[key] ?? genSettings?.[key]
    if (custom != null) {
        let text = custom
        if (tokens != null) {
            for (const [token, value] of Object.entries(tokens)) {
                text = text.replace(`{${token}}`, value)
            }
        }
        return text
    }
    return Lang.queryJS(fallbackKey, tokens)
}

exports.initRPC = function(genSettings, servSettings, initialDetails){
    genSettings = genSettings || {}
    servSettings = servSettings || {}

    const tokens = { shortId: servSettings.shortId }
    texts = {
        waiting: resolveText(servSettings, genSettings, 'waitingText', 'discord.waiting'),
        state: resolveText(servSettings, genSettings, 'stateText', 'discord.state', tokens),
        loading: resolveText(servSettings, genSettings, 'loadingText', 'landing.discord.loading'),
        joining: resolveText(servSettings, genSettings, 'joiningText', 'landing.discord.joining'),
        joined: resolveText(servSettings, genSettings, 'joinedText', 'landing.discord.joined')
    }

    client = new Client({
        clientId: genSettings.clientId,
        transport: { type: 'ipc' }
    })

    activity = {
        details: initialDetails ?? texts.waiting,
        state: texts.state,
        largeImageKey: servSettings.largeImageKey,
        largeImageText: servSettings.largeImageText,
        smallImageKey: genSettings.smallImageKey,
        smallImageText: genSettings.smallImageText,
        startTimestamp: new Date().getTime(),
        instance: false
    }

    client.on('ready', () => {
        logger.info('Discord RPC Connected')
        client.user?.setActivity(activity)
    })

    client.login().catch(error => {
        if(error.message.includes('ENOENT')) {
            logger.info('Unable to initialize Discord Rich Presence, no client detected.')
        } else {
            logger.info('Unable to initialize Discord Rich Presence: ' + error.message, error)
        }
    })
}

exports.setStage = function(stage){
    if(activity == null) return
    activity.details = texts[stage] ?? texts.waiting
    if(client != null) {
        client.user?.setActivity(activity)
    }
}

exports.shutdownRPC = function(){
    if(!client) return
    client.user?.clearActivity()
    client.destroy()
    client = null
    activity = null
    texts = {}
}
