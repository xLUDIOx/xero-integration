export interface IConnectionStatus {
    isAlive: boolean;
    title?: string;
    message?: ConnectionMessage;
}

export enum ConnectionMessage {
    TokenExpired = 'token_expired',
    DisconnectedRemotely = 'disconnected_remotely',
}
