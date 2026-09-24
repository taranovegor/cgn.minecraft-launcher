const { HTTPError, TimeoutError, ParseError } = require('got')

/**
 * Rest Response status.
 */
const RestResponseStatus = {
    /**
     * Status indicating the request was successful.
     */
    SUCCESS: 0,
    /**
     * Status indicating there was a problem with the response.
     * All status codes outside the 200 range will have an error status.
     */
    ERROR: 1
}

function isDisplayableError(it) {
    return typeof it == 'object'
        && it != null
        && Object.prototype.hasOwnProperty.call(it, 'title')
        && Object.prototype.hasOwnProperty.call(it, 'desc')
}

/**
 * Handle a got error for a generic RestResponse.
 *
 * @param operation The operation name, for logging purposes.
 * @param error The error that occurred.
 * @param logger A logger instance.
 * @param dataProvider A function to provide a response body.
 * @returns A RestResponse configured with error information.
 */
function handleGotError(operation, error, logger, dataProvider) {
    const response = {
        data: dataProvider(),
        responseStatus: RestResponseStatus.ERROR,
        error
    }
    if (error instanceof HTTPError) {
        logger.error(`Error during ${operation} request (HTTP Response ${error.response.statusCode})`, error)
        logger.debug('Response Details:')
        logger.debug(`URL: ${error.request.requestUrl}`)
        logger.debug('Body:', error.response.body)
        logger.debug('Headers:', error.response.headers)
    } else if (error.name === 'RequestError') {
        logger.error(`${operation} request received no response (${error.code}).`, error)
    } else if (error instanceof TimeoutError) {
        logger.error(`${operation} request timed out (${error.timings.phases.total}ms).`)
    } else if (error instanceof ParseError) {
        logger.error(`${operation} request received unexepected body (Parse Error).`)
    } else {
        // CacheError, ReadError, MaxRedirectsError, UnsupportedProtocolError, CancelError
        logger.error(`Error during ${operation} request.`, error)
    }
    return response
}

module.exports = {
    RestResponseStatus,
    isDisplayableError,
    handleGotError
}
