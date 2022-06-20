export * from './document-sanitizer';
export * from './errors';
export * from './lock';
export * from './logger';
export * from './object';
export * from './request';

export * from './Base64Converter';
export * from './NumberConversion';
export * from './DateFormatter';
export * from './Result';

export async function sleep(timeout: number) {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });
}
