import { Chip } from '@/components/ui/Chip';
import type { Tone } from '@/components/ui/tone';
import type { TagRef, TagTone } from '@/lib/tags/types';

const CHIP_TONE = {
  NEUTRAL: 'neutral',
  GOOD: 'good',
  WARN: 'warn',
  BAD: 'bad',
  ACCENT: 'accent',
} as const satisfies Record<TagTone, Tone>;

/** A vacancy's tags, wrapping under its title; nothing, not an empty line, without any. */
export function VacancyTags({ tags }: { tags: readonly TagRef[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className="mt-2 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li key={tag.id} className="max-w-full">
          <Chip tone={CHIP_TONE[tag.tone]}>{tag.name}</Chip>
        </li>
      ))}
    </ul>
  );
}
