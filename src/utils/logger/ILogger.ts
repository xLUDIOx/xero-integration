import * as restify from 'restify';

export interface ILogFn {
    /**
     * Logs message
     * @param msg is the text message
     */
    (msg: string): void;
    /**
     * Logs  message plus indexes
     * @param indexes the indexes with which you can search in logs
     * @param template is template string. You can also use it as a normal message
     * @example ({ [SearchIndex.EventId]: 123, [SearchIndex.Timestamp] :2345 }, 'Successful creation for {${SearchIndex.EventId}} on {${SearchIndex.Timestamp}}')
     */
    (indexes: object, template?: string): void;
}

export interface ILogger {
    /**
     * Logs error
     * @param error is the exception
     * @param indexes the indexes with which you can search in logs
     * @returns Logged error
     */
    error(error: Error, indexes?: object): Error;
    info: ILogFn;
    debug: ILogFn;
    warn: ILogFn;

    child(indexes: Record<string, any>, request?: restify.Request): ILogger;
}
