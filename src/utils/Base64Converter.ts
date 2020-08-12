export function toBase64(text: string): string {
    return Buffer.from(text).toString('base64');
}

export function fromBase64(base64Text: string): string {
    return Buffer.from(base64Text, 'base64').toString('utf8');
}
