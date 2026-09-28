import { useEffect, useState } from "react";

/**
 * Returns `value` once it has stopped changing for `delay` ms.
 *
 * Product search is typed on a phone keyboard, so without this every letter
 * would fire a query. The value is applied immediately for short inputs so
 * single-character searches still feel instant on a fast connection.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
