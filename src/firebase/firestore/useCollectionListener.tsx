
import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  Query,
  DocumentData,
  FirestoreError,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';

interface CollectionListenerOptions {
  path: string;
  query?: Query<DocumentData> | null | undefined;
}

export function useCollectionListener<T>({ path, query: queryArg }: CollectionListenerOptions) {
  const [data, setData] = useState<T[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  const queryMemo = useMemo(() => {
    if (queryArg) {
      return queryArg;
    }
    return query(collection(db, path));
  }, [path, queryArg]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      queryMemo,
      (snapshot) => {
        const resolvedData = snapshot.docs.map((doc) => ({
          ...(doc.data() as T),
          id: doc.id,
        }));

        setData(resolvedData);
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path: path,
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [queryMemo, path]);

  return { data, isLoading, error };
}
