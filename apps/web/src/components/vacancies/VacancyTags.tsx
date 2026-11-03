import { Chip } from '@/components/ui/Chip';
import type { Tone } from '@/components/ui/tone';
import type { TagRef, TagTone } from '@/lib/tags/types';

export const CHIP_TONE = {
  NEUTRAL: 'neutral',
  GOOD: 'good',
  WARN: 'warn',
  BAD: 'bad',
  ACCENT: 'accent',
} as const satisfies Record<TagTone, Tone>;

/** A vacancy's tags, wrapping under its title; nothing, not an empty line, without any.
 * With `edit`, each chip has its × (off during `saving`, the vacancy's write in flight). */
export function VacancyTags({
  tags,
  edit,
}: {
  tags: readonly TagRef[];
  edit?: { saving: boolean; onRemove: (tag: TagRef) => void };
}) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className="mt-2 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li key={tag.id} className="max-w-full">
          {edit ? (
            <Chip
              tone={CHIP_TONE[tag.tone]}
              onRemove={() => edit.onRemove(tag)}
              removeLabel={`Remove tag ${tag.name}`}
              removeDisabled={edit.saving}
            >
              {tag.name}
            </Chip>
          ) : (
            <Chip tone={CHIP_TONE[tag.tone]}>{tag.name}</Chip>
          )}
        </li>
      ))}
    </ul>
  );
}
