import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

export function useApi(path, options) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const key = typeof path === "string" ? path : JSON.stringify(path);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api(path, options)
      .then((result) => {
        if (!cancelled) {
          setData(result.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [key]);

  return { data, loading, error };
}

export function useApiCallback() {
  const [loading, setLoading] = useState(false);

  const call = useCallback(async (path, options) => {
    setLoading(true);
    try {
      const result = await api(path, options);
      return result.data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading };
}
