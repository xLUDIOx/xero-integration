export interface IDocumentSanitizer {
    sanitize(input: string): Promise<void>;
}
