import { Chip } from '@/components/ui/Chip';
import type { ChipColor } from '@/components/ui/tone';
import type { TagRef, TagTone } from '@/lib/tags/types';

export const CHIP_TONE: Record<TagTone, ChipColor> = {
  GREY: 'grey',
  GREEN: 'green',
  AMBER: 'amber',
  RED: 'red',
  BLUE: 'blue',
  TEAL: 'teal',
  VIOLET: 'violet',
  PINK: 'pink',
  ORANGE: 'orange',
  LIME: 'lime',
};

/** A vacancy's tags, wrapping under its title; nothing, not an empty line, without any.
 * With `edit`, each chip has its × (off during `saving`, the vacancy's write in flight).
 * `dense` is its size in a table row. */
export function VacancyTags({
  tags,
  dense,
  edit,
}: {
  tags: readonly TagRef[];
  dense?: boolean;
  edit?: { saving: boolean; onRemove: (tag: TagRef) => void };
}) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className={`${dense ? 'mt-1' : 'mt-2'} flex flex-wrap gap-1`}>
      {tags.map((tag) => (
        <li key={tag.id} className="max-w-full">
          {edit ? (
            <Chip
              color={CHIP_TONE[tag.tone]}
              dense={dense}
              onRemove={() => edit.onRemove(tag)}
              removeLabel={`Remove tag ${tag.name}`}
              removeDisabled={edit.saving}
            >
              {tag.name}
            </Chip>
          ) : (
            <Chip color={CHIP_TONE[tag.tone]} dense={dense}>
              {tag.name}
            </Chip>
          )}
        </li>
      ))}
    </ul>
  );
}
