import type { IndexDescription } from 'mongodb';

export interface InitializationIndexGroup {
    collection: string;
    indexes: IndexDescription[];
}

export function initializationIndexName(index: IndexDescription): string {
    return index.name ?? Object.entries(index.key).map(([field, direction]) => `${field}_${direction}`).join('_');
}
