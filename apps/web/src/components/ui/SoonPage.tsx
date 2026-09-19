import type { ComponentType, SVGProps } from 'react';

/** Placeholder body for a route that has no backend behind it yet. */
export function SoonPage({
  icon: Icon,
  title,
  description,
  items,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  items?: string[];
}) {
  return (
    <section className="view">
      <div className="soon-wrap">
        <div className="soon-icon">
          <Icon />
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        {items && (
          <div className="soon-list">
            {items.map((item) => (
              <div key={item}>· {item}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
