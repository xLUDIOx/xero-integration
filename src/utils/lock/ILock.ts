export interface ILock {
    acquire(): Promise<void>;
    release(): Promise<void>;
}
