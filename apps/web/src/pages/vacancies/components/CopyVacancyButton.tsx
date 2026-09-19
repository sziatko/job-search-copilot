import { useEffect, useState } from 'react';
import { IconCopy } from '@/components/icons';

interface CopyVacancyButtonProps {
  id: number;
  company: string;
  title: string;
  applyUrl: string;
}

export function CopyVacancyButton({ id, company, title, applyUrl }: CopyVacancyButtonProps) {
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
      aria-label={`Copy ${title} at ${company}`}
      onClick={handleCopy}
      className={`icon-btn ${copied ? 'flash' : ''}`}
    >
      <IconCopy />
      <span className="copied-flag" role="status">
        Copied
      </span>
    </button>
  );
}
