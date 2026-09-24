const state = require('./state')

/**
 * Retrieve the launcher's Client Token.
 * There is no default client token.
 *
 * @returns {string} The launcher's Client Token.
 */
exports.getClientToken = function(){
    return state.config.clientToken
}

/**
 * Set the launcher's Client Token.
 *
 * @param {string} clientToken The launcher's new Client Token.
 */
exports.setClientToken = function(clientToken){
    state.config.clientToken = clientToken
}

/**
 * Retrieve the ID of the selected serverpack.
 *
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {string} The ID of the selected serverpack.
 */
exports.getSelectedServer = function(def = false){
    return !def ? state.config.selectedServer : state.DEFAULT_CONFIG.clientToken
}

/**
 * Set the ID of the selected serverpack.
 *
 * @param {string} serverID The ID of the new selected serverpack.
 */
exports.setSelectedServer = function(serverID){
    state.config.selectedServer = serverID
}

/**
 * Get an array of each account currently authenticated by the launcher.
 *
 * @returns {Array.<Object>} An array of each stored authenticated account.
 */
exports.getAuthAccounts = function(){
    return state.config.authenticationDatabase
}

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
    state.config.selectedAccount = uuid
    state.config.authenticationDatabase[uuid] = {
        type: 'mojang',
        accessToken,
        uuid: uuid.trim(),
        username: username.trim(),
        displayName: username.trim()
    }

    return state.config.authenticationDatabase[uuid]
}


/**
 * Update the access token of an authenticated mojang account.
 *
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} displayName The name of the authenticated account.
 * @param {string} accessToken The new Access Token.
 *
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateCgnAuthAccount = function(uuid, displayName, accessToken){
    state.config.authenticationDatabase[uuid].accessToken = accessToken
    state.config.authenticationDatabase[uuid].displayName = displayName
    state.config.authenticationDatabase[uuid].type = 'mojang' // For gradual conversion.

    return state.config.authenticationDatabase[uuid]
}

/**
 * Remove an authenticated account from the database. If the account
 * was also the selected account, a new one will be selected. If there
 * are no accounts, the selected account will be null.
 *
 * @param {string} uuid The uuid of the authenticated account.
 *
 * @returns {boolean} True if the account was removed, false if it never existed.
 */
exports.removeAuthAccount = function(uuid){
    if(state.config.authenticationDatabase[uuid] != null){
        delete state.config.authenticationDatabase[uuid]
        if(state.config.selectedAccount === uuid){
            const keys = Object.keys(state.config.authenticationDatabase)
            if(keys.length > 0){
                state.config.selectedAccount = keys[0]
            } else {
                state.config.selectedAccount = null
                state.config.clientToken = null
            }
        }
        return true
    }
    return false
}

/**
 * Get the currently selected authenticated account.
 *
 * @returns {Object} The selected authenticated account.
 */
exports.getAccount = function(){
    return state.config.authenticationDatabase[state.config.selectedAccount]
}

/**
 * Set the selected authenticated account.
 *
 * @param {string} uuid The UUID of the account which is to be set
 * as the selected account.
 *
 * @returns {Object} The selected authenticated account.
 */
exports.setSelectedAccount = function(uuid){
    const authAcc = state.config.authenticationDatabase[uuid]
    if(authAcc != null) {
        state.config.selectedAccount = uuid
    }
    return authAcc
}
