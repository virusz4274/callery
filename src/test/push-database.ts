import { ObjectId, type Db, type Document } from 'mongodb';
import type { PushSubscriptionEntry, User } from '@/lib/db/types';

function copy<T>(value: T): T {
    if (value instanceof ObjectId) return new ObjectId(value.toString()) as T;
    if (value instanceof Date) return new Date(value) as T;
    if (Array.isArray(value)) return value.map(copy) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
    return value;
}

function field(value: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Document)[key] : undefined, value);
}

function equal(left: unknown, right: unknown): boolean {
    return left instanceof ObjectId && right instanceof ObjectId ? left.equals(right) : left === right;
}

function matches(row: unknown, filter: Document): boolean {
    return Object.entries(filter).every(([key, value]) => {
        const actual = field(row, key);
        if (value && typeof value === 'object' && '$ne' in value) return !equal(actual, value.$ne);
        return equal(actual, value);
    });
}

/** The small Mongo expression subset used by atomic subscription updates. */
function evaluate(value: unknown, row: Document, variables: Document = {}): unknown {
    if (typeof value === 'string' && value.startsWith('$$')) return field(variables, value.slice(2));
    if (typeof value === 'string' && value.startsWith('$')) return field(row, value.slice(1));
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    const expression = value as Document;
    if ('$literal' in expression) return copy(expression.$literal);
    if ('$ifNull' in expression) {
        const [first, fallback] = expression.$ifNull as unknown[];
        return evaluate(first, row, variables) ?? evaluate(fallback, row, variables);
    }
    if ('$concatArrays' in expression) return (expression.$concatArrays as unknown[]).flatMap(item => evaluate(item, row, variables) as unknown[]);
    if ('$ne' in expression) {
        const [left, right] = expression.$ne as unknown[];
        return !equal(evaluate(left, row, variables), evaluate(right, row, variables));
    }
    if ('$filter' in expression) {
        const filter = expression.$filter as { input: unknown; as: string; cond: unknown };
        return (evaluate(filter.input, row, variables) as unknown[]).filter(item => evaluate(filter.cond, row, { ...variables, [filter.as]: item }));
    }
    if (Array.isArray(value)) return value.map(item => evaluate(item, row, variables));
    throw new Error('Unsupported subscription test expression');
}

export function subscriptionFixture(name: string, generation = 'original'): PushSubscriptionEntry {
    return { type: 'web', endpoint: `https://push.example.test/${name}`, keys: { p256dh: `${generation}-public`, auth: `${generation}-auth` }, createdAt: new Date() };
}

export class PushDatabase {
    user: User | null;
    reads = 0;
    writes: { filter: Document; update: Document | Document[] }[] = [];
    failUpdates = false;
    beforeUpdate?: () => void;

    constructor(subscriptions: PushSubscriptionEntry[] = []) {
        this.user = { _id: new ObjectId(), authSubject: 'owner', pushSubscriptions: copy(subscriptions) } as User;
    }

    asDb(): Db {
        const fixture = this;
        return { collection(name: string) {
            if (name !== 'users') throw new Error('Unexpected push fixture collection');
            return {
                async findOne(filter: Document) {
                    fixture.reads++;
                    return fixture.user && matches(fixture.user, filter) ? copy(fixture.user) : null;
                },
                async updateOne(filter: Document, update: Document | Document[]) {
                    fixture.beforeUpdate?.();
                    if (fixture.failUpdates) throw new Error('Synthetic subscription database failure');
                    fixture.writes.push({ filter: copy(filter), update: copy(update) });
                    const user = fixture.user;
                    if (!user || !matches(user, filter)) return { matchedCount: 0, modifiedCount: 0 };
                    const row = user as unknown as Document;
                    if (Array.isArray(update)) {
                        for (const stage of update) {
                            const values = Object.fromEntries(Object.entries(stage.$set as Document).map(([key, value]) => [key, evaluate(value, row)]));
                            Object.assign(row, values);
                        }
                    } else {
                        for (const [key, condition] of Object.entries(update.$pull as Document || {})) {
                            row[key] = ((row[key] || []) as unknown[]).filter(item => !matches(item, condition as Document));
                        }
                        Object.assign(row, update.$set);
                    }
                    return { matchedCount: 1, modifiedCount: 1 };
                },
            };
        } } as unknown as Db;
    }
}
