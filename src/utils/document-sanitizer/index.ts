import { DocumentSanitizer } from './DocumentSanitizer';
import { IDocumentSanitizer } from './IDocumentSanitizer';

export { IDocumentSanitizer };

export const createDocumentSanitizer = () => new DocumentSanitizer();
