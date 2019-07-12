import { InMemoryStore } from './InMemoryStore';
import { IStore } from './IStore';

export * from './IStore';

export const createStore = (): IStore => new InMemoryStore();
