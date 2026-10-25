import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';

/** A new USER comment. Enter sends, Shift+Enter breaks the line — the ApplyDialog's keys. */
export function CommentForm({
  saving,
  error,
  onSubmit,
}: {
  saving: boolean;
  error: string | null;
  onSubmit: (body: string, onDone: () => void) => void;
}) {
  const [body, setBody] = useState('');

  function submit() {
    if (body.trim() === '' || saving) return;
    onSubmit(body, () => setBody(''));
  }

  return (
    <form
      className="flex flex-col items-end gap-2 border-t border-border px-4.5 py-3.25"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="Add a comment"
        placeholder="Add a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
      />
      {error && <p className="self-start text-sm text-bad">{error}</p>}
      <Button type="submit" variant="primary" disabled={saving || body.trim() === ''}>
        {saving ? 'Saving…' : 'Add comment'}
      </Button>
    </form>
  );
}
