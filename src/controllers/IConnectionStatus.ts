export interface IConnectionStatus {
    isAlive: boolean;
    label?: string;
    message?: ConnectionMessage;
}

export enum ConnectionMessage {
    TokenExpired = 'token_expired',
    DisconnectedRemotely = 'disconnected_remotely',
}
