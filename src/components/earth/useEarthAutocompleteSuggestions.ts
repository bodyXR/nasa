import { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

export function isGmpQuotaError(err: unknown): boolean {
  if (!err) return false;
  const record = err as { status?: string; code?: string | number; message?: string };
  const statusStr = String(record.status ?? '').toUpperCase();
  const codeVal = record.code;
  const msgStr = (err instanceof Error ? err.message : String(record.message ?? err)).toUpperCase();

  return (
    codeVal === 429 ||
    statusStr === 'RESOURCE_EXHAUSTED' ||
    statusStr === 'OVER_QUERY_LIMIT' ||
    msgStr.includes('RESOURCE_EXHAUSTED') ||
    msgStr.includes('OVER_QUERY_LIMIT') ||
    msgStr.includes('OVERQUOTAMAPERROR') ||
    msgStr.includes('QUOTAEXCEEDEDERROR') ||
    msgStr.includes('QUOTA EXCEEDED') ||
    msgStr.includes('429')
  );
}

export interface UseEarthAutocompleteReturn {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isLoading: boolean;
  error: string | null;
  resetSession: () => void;
}

/**
 * Modern Places API (New) autocomplete hook using AutocompleteSuggestion and AutocompleteSessionToken.
 */
export function useEarthAutocompleteSuggestions(
  inputString: string,
  requestOptions: Partial<google.maps.places.AutocompleteRequest> = {}
): UseEarthAutocompleteReturn {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!placesLib) return;

    const trimmed = inputString.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken();
      }

      setIsLoading(true);
      setError(null);

      const request: google.maps.places.AutocompleteRequest = {
        ...requestOptions,
        input: trimmed,
        sessionToken: sessionTokenRef.current,
      };

      try {
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (!cancelled) {
          setSuggestions(res.suggestions ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        if (isGmpQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          setError('Google Maps Platform quota reached.');
        } else {
          setError(err instanceof Error ? err.message : 'Unable to fetch place suggestions.');
        }
        setSuggestions([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, inputString]);

  return {
    suggestions,
    isLoading,
    error,
    resetSession: () => {
      sessionTokenRef.current = null;
      setSuggestions([]);
    },
  };
}
