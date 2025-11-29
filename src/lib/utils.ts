"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useState } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);

  // Load from localStorage after mount
  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue !== null) {
        setState(JSON.parse(storedValue));
      }
    } catch (err) {
      console.error("Error reading from localStorage", err);
    }
  }, [key]);

  // Persist to localStorage whenever it changes
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      console.error("Error writing to localStorage", err);
    }
  }, [key, state]);

  return [state, setState];
}
