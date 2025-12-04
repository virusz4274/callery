'use client';

import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

/**
 * React hook to subscribe to a Firestore document in real-time.
 * It gracefully handles null or undefined document references by not attempting to fetch.
 *
 * IMPORTANT: To prevent infinite loops, the `docRef` passed to this hook MUST be memoized
 * using `useMemo` or `useMemoFirebase`.
 *
 * @template T Optional type for the document data.
 * @param {DocumentReference<DocumentData> | null | undefined} docRef - The memoized Firestore DocumentReference.
 * @returns {UseDocResult<T>} An object containing the document data, loading state, and any error.
 */
export function useDoc<T = any>(
    docRef: (DocumentReference<DocumentData> & {__memo?: boolean}) | null | undefined
): UseDocResult<T> {
  const [data, setData] = useState<WithId<T> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // If the document reference is not provided, do nothing.
    if (!docRef) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id });
        } else {
          // The document does not exist
          setData(null);
        }
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        // Handle permission errors or other listener errors
        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: docRef.path,
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);
        
        // Globally emit the error for central handling
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [docRef]); // Re-run effect if the document reference changes

  if(docRef && !docRef.__memo) {
    throw new Error('useDoc received a non-memoized DocumentReference. Please wrap the reference creation in useMemoFirebase().');
  }

  return { data, isLoading, error };
}
