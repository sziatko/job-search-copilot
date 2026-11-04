import { useId } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Checkbox } from '@/components/ui/Field';
import { type TagTone, tagToneSchema } from '@/lib/tags/types';
import { CHIP_TONE } from './VacancyTags';

const TONE_LABEL: Record<TagTone, string> = {
  NEUTRAL: 'Neutral',
  GOOD: 'Good',
  WARN: 'Warning',
  BAD: 'Bad',
  ACCENT: 'Accent',
};

/** A tag's tone, in a dialog's form: a radio for each, drawn as the chip it gives. */
export function TagToneField({
  value,
  onChange,
}: {
  value: TagTone;
  onChange: (tone: TagTone) => void;
}) {
  const name = useId();
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-small font-bold text-ink-soft">Tone</legend>
      <div className="flex flex-wrap gap-3">
        {tagToneSchema.options.map((tone) => (
          <Checkbox
            key={tone}
            type="radio"
            name={name}
            label={<Chip tone={CHIP_TONE[tone]}>{TONE_LABEL[tone]}</Chip>}
            checked={value === tone}
            onChange={() => onChange(tone)}
          />
        ))}
      </div>
    </fieldset>
  );
}
