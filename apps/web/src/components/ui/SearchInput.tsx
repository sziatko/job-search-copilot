import { type Ref, useEffect, useRef, useState } from 'react';

/** Debounced text search over company / role — the search modal's box. Local state
 * keeps typing snappy; `onChange` gets the text once typing pauses. The server matches
 * it (ADR-0025), so the caller trims it and the box keeps what was typed. */
export function SearchInput({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [text, setText] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep local state in sync when the value changes from elsewhere.
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChangeRef.current(text), 200);
    return () => clearTimeout(t);
  }, [text, value]);

  return (
    <input
      ref={inputRef}
      type="search"
      aria-label="Search company or role"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Search company or role…"
      className="search-input"
    />
  );
}
