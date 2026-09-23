import { useEffect, useId, useRef, useState } from 'react';

/** Debounced text search over company / role. Local state keeps typing snappy;
 * the debounced call pushes the term into the URL (see useApplications and
 * useVacancies — the tracker filters on it client-side, /vacancies sends it to
 * the API, ADR-0025). */
export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep local state in sync when the URL changes from elsewhere (back button).
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChangeRef.current(text), 200);
    return () => clearTimeout(t);
  }, [text, value]);

  return (
    <input
      id={id}
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Search company or role…"
      className="search-input"
    />
  );
}
