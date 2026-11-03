import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalysisComment } from './AnalysisComment';

const strongs = (container: HTMLElement) =>
  [...container.querySelectorAll('strong')].map((el) => el.textContent);

describe('AnalysisComment', () => {
  it('makes each marked part a strong, without the markers', () => {
    const { container } = render(
      <AnalysisComment
        text={'**Stack: 85%**\nReact is the core.\n**Scope: 70%**\nA small team.'}
      />,
    );

    expect(strongs(container)).toEqual(['Stack: 85%', 'Scope: 70%']);
    expect(container.textContent).toBe('Stack: 85%\nReact is the core.\nScope: 70%\nA small team.');
  });

  it('leaves a comment with no markers as it is, as the old comments are', () => {
    const { container } = render(<AnalysisComment text={'Strong match.\nRemote.'} />);

    expect(strongs(container)).toEqual([]);
    expect(container.textContent).toBe('Strong match.\nRemote.');
  });

  it.each([
    ['one marker', 'Rate **unknown'],
    ['a marker on each of two lines', 'Rate **unknown\nStack** unclear'],
    ['an empty pair', 'Rate ****'],
  ])('leaves %s literal', (_, text) => {
    const { container } = render(<AnalysisComment text={text} />);

    expect(strongs(container)).toEqual([]);
    expect(container.textContent).toBe(text);
  });

  it('renders a tag as text, not as markup', () => {
    render(<AnalysisComment text="**<b>Stack</b>**" />);

    expect(screen.getByText('<b>Stack</b>').tagName).toBe('STRONG');
  });
});
