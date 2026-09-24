import { Logger } from '../../util/LoggerUtil';
/**
 * Rest Response status.
 */
export declare enum RestResponseStatus {
    /**
     * Status indicating the request was successful.
     */
    SUCCESS = 0,
    /**
     * Status indicating there was a problem with the response.
     * All status codes outside the 200 range will have an error status.
     */
    ERROR = 1
}
/**
 * Base RestResponse for generic REST calls.
 */
export interface RestResponse<T> {
    /**
     * The response body.
     */
    data: T;
    /**
     * The response status.
     */
    responseStatus: RestResponseStatus;
    /**
     * If responseStatus is ERROR, the error body.
     */
    error?: Error;
}
/**
 * An object to translate an error code to a displayable message.
 */
export interface DisplayableError {
    /**
     * Error title.
     */
    title: string;
    /**
     * Error description.
     */
    desc: string;
}
export declare function isDisplayableError(it: unknown): boolean;
/**
 * Handle an error for a generic RestResponse.
 *
 * @param operation The operation name, for logging purposes.
 * @param error The error that occurred.
 * @param logger A logger instance.
 * @param dataProvider A function to provide a response body.
 * @returns A RestResponse configured with error information.
 */
export declare function handleGotError<T>(operation: string, error: Error, logger: Logger, dataProvider: () => T): RestResponse<T>;
