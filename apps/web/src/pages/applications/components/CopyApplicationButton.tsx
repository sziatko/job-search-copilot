import { useEffect, useState } from 'react';

interface CopyApplicationButtonProps {
  id: number;
  company: string;
  title: string;
  applyUrl: string;
}

const CopyIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="8" y="8" width="10" height="10" rx="2" />
    <path d="M4 12H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8.5L6.5 12L13 4" />
  </svg>
);

export function CopyApplicationButton({
  id,
  company,
  title,
  applyUrl,
}: CopyApplicationButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeout = setTimeout(() => {
      setCopied(false);
    }, 1500);

    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    const text = `[Job Search Copilot]
ID: ${id}
Company: ${company}
Title: ${title}
URL: ${applyUrl}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Silent fail — clipboard API can fail in HTTP/iframes
    }
  };

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied!' : 'Copy application to clipboard'}
      onClick={handleCopy}
      className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-700 transition-colors"
      title={copied ? 'Copied!' : undefined}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
