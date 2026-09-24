// Work in progress
const { LoggerUtil } = require('./util/LoggerUtil')

const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('@xhayper/discord-rpc')

const Lang = require('./langloader')

let client
let activity

exports.initRPC = function(genSettings, servSettings, initialDetails = Lang.queryJS('discord.waiting')){
    client = new Client({
        clientId: genSettings.clientId,
        transport: { type: 'ipc' }
    })

    activity = {
        details: initialDetails,
        state: Lang.queryJS('discord.state', {shortId: servSettings.shortId}),
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

exports.updateDetails = function(details){
    activity.details = details
    client.user?.setActivity(activity)
}

exports.shutdownRPC = function(){
    if(!client) return
    client.user?.clearActivity()
    client.destroy()
    client = null
    activity = null
}
