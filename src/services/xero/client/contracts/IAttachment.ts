import { Attachment } from 'xero-node';

export type IAttachment = Required<Pick<Attachment, 'attachmentID' | 'fileName'>>;
