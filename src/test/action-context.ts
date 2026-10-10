// Exercise real server actions with Next's request storage, without starting or
// reconfiguring the shared development server. Imports follow the installed Next.
import 'next/dist/server/node-environment';
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external';
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external';
import { createRequestStoreForAPI } from 'next/dist/server/async-storage/request-store';
import { NextRequest } from 'next/server';

export function inActionContext<T>(token: string, action: () => Promise<T>, afterTasks: (() => Promise<void>)[] = []): Promise<T> {
    const request = new NextRequest(`${process.env.NEXT_PUBLIC_APP_URL}/admin`, { headers: { authorization: `Bearer ${token}` } });
    const store = createRequestStoreForAPI(request, { pathname: '/admin' }, { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined);
    const work = { route: '/admin', isStaticGeneration: false, incrementalCache: {}, pendingRevalidatedTags: [],
        afterContext: { after: (task: () => Promise<void>) => { afterTasks.push(task); } },
    } as unknown as Parameters<typeof workAsyncStorage.run>[0];
    return workAsyncStorage.run(work, () => workUnitAsyncStorage.run(store, action));
}
