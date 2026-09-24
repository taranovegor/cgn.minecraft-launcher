const { LoggerUtil } = require('../../util/LoggerUtil')
const got = require('got')
const { decipherErrorCode, isInternalError, MojangErrorCode } = require('./MojangResponse')
const { handleGotError, RestResponseStatus } = require('../../common/rest/RestResponse')

const MojangStatusColor = {
    RED: 'red',
    YELLOW: 'yellow',
    GREEN: 'green',
    GREY: 'grey'
}

class MojangRestAPI {

    static logger = LoggerUtil.getLogger('Mojang')

    static TIMEOUT = 2500
    static AUTH_ENDPOINT = 'https://ygg.mc.craftgame.net/auth'
    static STATUS_ENDPOINT = 'https://raw.githubusercontent.com/AventiumSoftworks/helios-status-page/master/history/summary.json'

    static authClient = got.extend({
        prefixUrl: MojangRestAPI.AUTH_ENDPOINT,
        responseType: 'json',
        retry: 0
    })

    static statusClient = got.extend({
        url: MojangRestAPI.STATUS_ENDPOINT,
        responseType: 'json',
        retry: 0
    })

    static MINECRAFT_AGENT = {
        name: 'Minecraft',
        version: 1
    }

    static statuses = MojangRestAPI.getDefaultStatuses()

    static getDefaultStatuses() {
        return [
            {
                service: 'mojang-multiplayer-session-service',
                status: MojangStatusColor.GREY,
                name: 'Multiplayer Session Service',
                essential: true
            },
            {
                service: 'minecraft-skins',
                status: MojangStatusColor.GREY,
                name: 'Minecraft Skins',
                essential: false
            },
            {
                service: 'mojang-s-public-api',
                status: MojangStatusColor.GREY,
                name: 'Public API',
                essential: false
            },
            {
                service: 'mojang-accounts-website',
                status: MojangStatusColor.GREY,
                name: 'Mojang Accounts Website',
                essential: false
            },
            {
                service: 'microsoft-o-auth-server',
                status: MojangStatusColor.GREY,
                name: 'Microsoft OAuth Server',
                essential: true
            },
            {
                service: 'xbox-live-auth-server',
                status: MojangStatusColor.GREY,
                name: 'Xbox Live Auth Server',
                essential: true
            },
            {
                service: 'xbox-live-gatekeeper', // Server used to give XTokens
                status: MojangStatusColor.GREY,
                name: 'Xbox Live Gatekeeper',
                essential: true
            },
            {
                service: 'microsoft-minecraft-api',
                status: MojangStatusColor.GREY,
                name: 'Minecraft API for Microsoft Accounts',
                essential: true
            },
            {
                service: 'microsoft-minecraft-profile',
                status: MojangStatusColor.GREY,
                name: 'Minecraft Profile for Microsoft Accounts',
                essential: false
            }
        ]
    }

    /**
     * Converts a Mojang status color to a hex value. Valid statuses
     * are 'green', 'yellow', 'red', and 'grey'. Grey is a custom status
     * to our project which represents an unknown status.
     */
    static statusToHex(status) {
        switch (status.toLowerCase()) {
            case MojangStatusColor.GREEN:
                return '#a5c325'
            case MojangStatusColor.YELLOW:
                return '#eac918'
            case MojangStatusColor.RED:
                return '#c32625'
            case MojangStatusColor.GREY:
            default:
                return '#848484'
        }
    }

    /**
     * MojangRestAPI implementation of handleGotError. This function will additionally
     * analyze the response from Mojang and populate the mojang-specific error information.
     *
     * @param operation The operation name, for logging purposes.
     * @param error The error that occurred.
     * @param dataProvider A function to provide a response body.
     * @returns A MojangResponse configured with error information.
     */
    static handleGotError(operation, error, dataProvider) {
        const response = handleGotError(operation, error, MojangRestAPI.logger, dataProvider)
        if (error instanceof got.HTTPError) {
            response.mojangErrorCode = decipherErrorCode(error.response.body)
        } else if (error.name === 'RequestError' && error.code === 'ENOTFOUND') {
            response.mojangErrorCode = MojangErrorCode.ERROR_UNREACHABLE
        } else {
            response.mojangErrorCode = MojangErrorCode.UNKNOWN
        }
        response.isInternalError = isInternalError(response.mojangErrorCode)
        return response
    }

    /**
     * Utility function to report an unexpected success code. An unexpected
     * code may indicate an API change.
     *
     * @param operation The operation name.
     * @param expected The expected response code.
     * @param actual The actual response code.
     */
    static expectSpecificSuccess(operation, expected, actual) {
        if (actual !== expected) {
            MojangRestAPI.logger.warn(`${operation} expected ${expected} response, received ${actual}.`)
        }
    }

    /**
     * Retrieves the status of Mojang's services.
     * The response is condensed into a single object. Each service is
     * a key, where the value is an object containing a status and name
     * property.
     *
     * Currently uses an in house daily ping. A daily ping is not super useful,
     * so this may be refactored at a later date. The feature was originally
     * built on Mojang's status API which has since been removed.
     *
     * @see https://wiki.vg/Mojang_API#API_Status_.28Removed.29
     */
    static async status() {
        try {
            const res = await MojangRestAPI.statusClient.get({})
            MojangRestAPI.expectSpecificSuccess('Mojang Status', 200, res.statusCode)
            for (const status of res.body) {
                for (const mojStatus of MojangRestAPI.statuses) {
                    if (mojStatus.service === status.slug) {
                        mojStatus.status = status.status === 'up' ? MojangStatusColor.GREEN : MojangStatusColor.RED
                        break
                    }
                }
            }
            return {
                data: MojangRestAPI.statuses,
                responseStatus: RestResponseStatus.SUCCESS
            }
        } catch (error) {
            return MojangRestAPI.handleGotError('Mojang Status', error, () => {
                for (const status of MojangRestAPI.statuses) {
                    status.status = MojangStatusColor.GREY
                }
                return MojangRestAPI.statuses
            })
        }
    }

    /**
     * Authenticate a user with their Mojang credentials.
     *
     * @param {string} username The user's username, this is often an email.
     * @param {string} password The user's password.
     * @param {string} clientToken The launcher's Client Token.
     * @param {boolean} requestUser Optional. Adds user object to the reponse.
     * @param {Object} agent Optional. Provided by default. Adds user info to the response.
     *
     * @see http://wiki.vg/Authentication#Authenticate
     */
    static async authenticate(username, password, clientToken, requestUser = true, agent = MojangRestAPI.MINECRAFT_AGENT) {
        try {
            const json = {
                agent,
                username,
                password,
                requestUser
            }
            if (clientToken != null) {
                json.clientToken = clientToken
            }
            const res = await MojangRestAPI.authClient.post('authenticate', { json, responseType: 'json' })
            MojangRestAPI.expectSpecificSuccess('Mojang Authenticate', 200, res.statusCode)
            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }
        } catch (err) {
            return MojangRestAPI.handleGotError('Mojang Authenticate', err, () => null)
        }
    }

    /**
     * Validate an access token. This should always be done before launching.
     * The client token should match the one used to create the access token.
     *
     * @param {string} accessToken The access token to validate.
     * @param {string} clientToken The launcher's client token.
     *
     * @see http://wiki.vg/Authentication#Validate
     */
    static async validate(accessToken, clientToken) {
        try {
            const json = {
                accessToken,
                clientToken
            }
            const res = await MojangRestAPI.authClient.post('validate', { json })
            MojangRestAPI.expectSpecificSuccess('Mojang Validate', 204, res.statusCode)
            return {
                data: res.statusCode === 204,
                responseStatus: RestResponseStatus.SUCCESS
            }
        } catch (err) {
            if (err instanceof got.HTTPError && err.response.statusCode === 403) {
                return {
                    data: false,
                    responseStatus: RestResponseStatus.SUCCESS
                }
            }
            return MojangRestAPI.handleGotError('Mojang Validate', err, () => false)
        }
    }

    /**
     * Invalidates an access token. The clientToken must match the
     * token used to create the provided accessToken.
     *
     * @param {string} accessToken The access token to invalidate.
     * @param {string} clientToken The launcher's client token.
     *
     * @see http://wiki.vg/Authentication#Invalidate
     */
    static async invalidate(accessToken, clientToken) {
        try {
            const json = {
                accessToken,
                clientToken
            }
            const res = await MojangRestAPI.authClient.post('invalidate', { json })
            MojangRestAPI.expectSpecificSuccess('Mojang Invalidate', 204, res.statusCode)
            return {
                data: undefined,
                responseStatus: RestResponseStatus.SUCCESS
            }
        } catch (err) {
            return MojangRestAPI.handleGotError('Mojang Invalidate', err, () => undefined)
        }
    }

    /**
     * Refresh a user's authentication. This should be used to keep a user logged
     * in without asking them for their credentials again. A new access token will
     * be generated using a recent invalid access token. See Wiki for more info.
     *
     * @param {string} accessToken The old access token.
     * @param {string} clientToken The launcher's client token.
     * @param {boolean} requestUser Optional. Adds user object to the reponse.
     *
     * @see http://wiki.vg/Authentication#Refresh
     */
    static async refresh(accessToken, clientToken, requestUser = true) {
        try {
            const json = {
                accessToken,
                clientToken,
                requestUser
            }
            const res = await MojangRestAPI.authClient.post('refresh', { json, responseType: 'json' })
            MojangRestAPI.expectSpecificSuccess('Mojang Refresh', 200, res.statusCode)
            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }
        } catch (err) {
            return MojangRestAPI.handleGotError('Mojang Refresh', err, () => null)
        }
    }

}

module.exports = { MojangRestAPI, MojangStatusColor }
