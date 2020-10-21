export interface IConnectionStatus {
    isAlive: boolean;
    message?: ConnectionMessage;
}

export enum ConnectionMessage {
    TokenExpired = 'token_expired',
    DisconnectedRemotely = 'disconnected_remotely',
}
