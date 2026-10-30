import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardHead, CardTitle } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Field';
import { useApiKeys } from './useProfile';

/**
 * The signed-in user's API keys, for n8n and MCP (ADR-0039): each acts as this user.
 * The API keeps only a hash, so a new key is shown once, here, to copy. Revoke deletes
 * it; whatever still sends it gets a 401.
 */
export function ApiKeysCard() {
  const nameId = useId();
  const [name, setName] = useState('');
  const { keys, create, revoke } = useApiKeys(() => setName(''));
  const copy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Key copied');
    } catch {
      toast.error('Could not copy: select the key and copy it by hand');
    }
  };

  return (
    <Card>
      <CardHead>
        <CardTitle>API keys</CardTitle>
      </CardHead>
      <div className="flex flex-col gap-2 px-4 pb-2">
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(name.trim());
          }}
        >
          <div className="flex-1">
            <Label htmlFor={nameId}>Key name</Label>
            <Input
              id={nameId}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. n8n"
            />
          </div>
          <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
            Create a key
          </Button>
        </form>
        {create.data && (
          <div className="flex flex-col gap-2">
            <p>Copy this key now: it will not be shown again.</p>
            <div className="flex items-center gap-3">
              <code className="break-all">{create.data}</code>
              <Button onClick={() => copy(create.data)}>Copy</Button>
            </div>
          </div>
        )}
        {keys.isPending && <p className="text-ink-muted">Loading…</p>}
        {keys.isError && <p className="text-bad-ink">Failed to load API keys</p>}
        {keys.data?.length === 0 && (
          <p className="text-ink-muted">No API keys yet. Create one for n8n or MCP.</p>
        )}
        {keys.data && keys.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {keys.data.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3">
                <span>
                  {key.name || 'API key'}
                  <span className="text-ink-muted">
                    {' '}
                    · {key.start}… · created {new Date(key.createdAt).toLocaleDateString()} ·{' '}
                    {key.lastRequest
                      ? `last used ${new Date(key.lastRequest).toLocaleDateString()}`
                      : 'never used'}
                  </span>
                </span>
                <Button disabled={revoke.isPending} onClick={() => revoke.mutate(key.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
