
'use client';

import { useState, useEffect } from 'react';

function getValueFromLocalStorage<T>(key: string, initialValue: T): T {
    if (typeof window === 'undefined') {
        return initialValue;
    }
    try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
    } catch (error) {
        console.error(error);
        return initialValue;
    }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => getValueFromLocalStorage(key, initialValue));
    
    useEffect(() => {
        try {
            const valueToStore = storedValue instanceof Function ? storedValue(getValueFromLocalStorage(key, initialValue)) : storedValue;
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            console.error(error);
        }
    }, [key, storedValue]);

    return [storedValue, setStoredValue];
}
