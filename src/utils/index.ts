export * from './document-sanitizer';
export * from './errors';
export * from './lock';
export * from './logger';
export * from './object';
export * from './request';
export * from './test';

export * from './Base64Converter';
export * from './NumberConversion';
export * from './DateFormatter';

export async function sleep(timeout: number) {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });
}
