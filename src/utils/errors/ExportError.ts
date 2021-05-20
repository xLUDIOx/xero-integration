export class ExportError extends Error {
    constructor(readonly message: string, readonly innerError?: Error) {
        super(message);
    }
}
