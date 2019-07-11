import { Logger } from 'pino';
import * as restify from 'restify';

import { ILogger } from './ILogger';

enum StackdriverSeverity {
    Critical = 'CRITICAL',
    Error = 'ERROR',
    Warning = 'WARNING',
    Info = 'INFO',
    Debug = 'DEBUG',
}

export class PinoStackDriverLogger implements ILogger {
    constructor(private readonly serviceName: string,
                private readonly pino: Logger,
                private readonly currentRequest?: restify.Request,
    ) { }

    info(obj: string | object, msg?: string): void {
        const params = this.build(obj, msg);
        this.pino.info({
            ...params,
            severity: StackdriverSeverity.Info,
        });
    }

    debug(obj: string | object, msg?: string): void {
        const params = this.build(obj, msg);
        this.pino.debug({
            ...params,
            severity: StackdriverSeverity.Debug,
        });
    }

    warn(obj: string | object, msg?: string): void {
        const params = this.build(obj, msg);
        this.pino.warn({
            ...params,
            severity: StackdriverSeverity.Warning,
        });
    }

    trace(obj: string | object, msg?: string): void {
        const params = this.build(obj, msg);
        this.pino.trace({
            ...params,
            // There is no Trace in Stackdriver
            severity: StackdriverSeverity.Debug,
        });
    }

    error(error: Error, obj?: object): void {
        // "message" must contain stacktrace for StackDriver to work properly
        // StackDriver required properties are last to make sure they are outputted and not overridden by other properties
        // https://cloud.google.com/error-reporting/docs/formatting-error-messages
        const payload = this.build(typeof obj === 'undefined' ? {} : obj, error.stack);
        this.pino.error({
            text: error.message,
            error,
            ...payload,
            severity: StackdriverSeverity.Error,
        });
    }

    child(indexes: Record<string, any>, currentRequest?: restify.Request): ILogger {
        return new PinoStackDriverLogger(this.serviceName, this.pino.child(indexes), currentRequest || this.currentRequest);
    }

    private build(obj: string | object, msg?: string): object {
        let res: any = { serviceContext: { service: this.serviceName } };
        if (typeof (obj) === 'string') {
            res = { message: obj };
        } else {
            res = { ...obj };
            if (!!msg) {
                res.message = msg;
            }
        }

        // StackDriver required property
        res.serviceContext = { service: this.serviceName };

        if (this.currentRequest) {
            // StackDriver optional properties
            res.context = {
                httpRequest: {
                    method: this.currentRequest.method,
                    url: this.currentRequest.url,
                    userAgent: this.currentRequest.userAgent,
                    referrer: this.currentRequest.headers.referer,
                    remoteIp: this.currentRequest.connection.remoteAddress,
                },
            };
        }

        return res;
    }
}
