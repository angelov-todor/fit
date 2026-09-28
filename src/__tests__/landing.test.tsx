import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const meta = (selector: string) => doc.querySelector(selector)?.getAttribute('content') ?? '';
const structured = JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');

const descriptions: [string, string][] = [
  ['meta description', meta('meta[name="description"]')],
  ['Open Graph', meta('meta[property="og:description"]')],
  ['Twitter', meta('meta[name="twitter:description"]')],
  ['structured data', structured.description],
];

describe('landing page', () => {
  it('offers the 3D flyover alongside the other features', () => {
    const markup = renderToStaticMarkup(<App />);
    expect(markup).toContain('3D Flyover');
  });
});

describe('page metadata', () => {
  it.each(descriptions)('the %s mentions the 3D flyover', (_where, text) => {
    expect(text).toMatch(/3D flyover/i);
  });

  it('lists the 3D flyover in the structured data feature list', () => {
    expect(structured.featureList).toEqual(expect.arrayContaining([expect.stringMatching(/3D flyover/i)]));
  });

  // The file never leaves the browser, but the maps fetch imagery for the
  // ride's area from tile servers, so "everything runs locally" overclaims.
  it.each(descriptions)('the %s promises the file stays in the browser without claiming everything is local', (_where, text) => {
    expect(text).not.toMatch(/everything runs locally|all local/i);
    expect(text).toMatch(/never leave/i);
  });
});
