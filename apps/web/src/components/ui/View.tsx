import type { HTMLAttributes } from 'react';

const PAD = 'px-7 pt-4 narrow:px-3.5 narrow:pt-3';

/**
 * A page's body, under the topbar. `fill` is a list page's: a flex column that runs to
 * the window's bottom, so `ListFrame`'s card and `Table`'s box can fill it and the page
 * itself does not scroll (RootLayout's main reads `data-view` for the height).
 */
export function View({ fill, ...props }: HTMLAttributes<HTMLElement> & { fill?: boolean }) {
  return fill ? (
    <section
      data-view="fill"
      className={`${PAD} flex flex-1 flex-col pb-6 narrow:pb-4.5`}
      {...props}
    />
  ) : (
    <section className={`${PAD} pb-14 narrow:pb-11`} {...props} />
  );
}
