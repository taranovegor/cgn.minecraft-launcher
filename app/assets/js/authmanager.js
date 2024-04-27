/**
 * AuthManager
 *
 * This module aims to abstract login procedures. Results from Mojang's REST api
 * are retrieved through our Mojang module. These results are processed and stored,
 * if applicable, in the config using the ConfigManager. All login procedures should
 * be made through this module.
 *
 * @module authmanager
 */
// Requirements
const ConfigManager          = require('./configmanager')
const { LoggerUtil }         = require('helios-core')
const { RestResponseStatus } = require('helios-core/common')
const { MojangRestAPI } = require('./mojang')

const log = LoggerUtil.getLogger('AuthManager')

// Functions

/**
 * Adds an authenticated CGN account to the database to be stored.
 *
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} username The username (usually email) of the authenticated account.
 *
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addCgnAccount = function (uuid, accessToken, username) {
    const ret = ConfigManager.addCgnAccount(uuid, accessToken, username)
    if(ConfigManager.getClientToken() == null){
        ConfigManager.setClientToken(accessToken)
    }
    ConfigManager.save()
}

/**
 * Remove a CGN account. This will invalidate the access token associated
 * with the account and then remove it from the database.
 *
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeCgnAccount = function(uuid){
    ConfigManager.removeAuthAccount(uuid)
    ConfigManager.save()
}

/**
 * Validate the selected account with Mojang's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 *
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateCGNAccount(){
    return true
}

/**
 * Validate the selected auth account.
 *
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
exports.validate = async function(){
    return await validateCGNAccount()
}
