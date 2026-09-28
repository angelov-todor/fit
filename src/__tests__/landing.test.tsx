import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const doc = new DOMParser().parseFromString(read('index.html'), 'text/html');
const meta = (selector: string) => doc.querySelector(selector)?.getAttribute('content') ?? '';
// Parsed inside the tests that need it, so malformed JSON fails one test with a name, not the whole file.
const structuredData = () => JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');

const descriptions: [string, () => string][] = [
  ['meta description', () => meta('meta[name="description"]')],
  ['Open Graph', () => meta('meta[property="og:description"]')],
  ['Twitter', () => meta('meta[name="twitter:description"]')],
  ['structured data', () => structuredData().description],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('landing page', () => {
  it('offers the 3D flyover alongside the other features', () => {
    vi.stubEnv('VITE_MAPTILER_KEY', 'test-key');
    expect(renderToStaticMarkup(<App />)).toContain('3D Flyover');
  });

  it("doesn't advertise the flyover on a build without a MapTiler key, where its tab is disabled", () => {
    vi.stubEnv('VITE_MAPTILER_KEY', '');
    const markup = renderToStaticMarkup(<App />);
    expect(markup).not.toContain('3D Flyover');
    expect(markup).toContain('GPS Map');
  });
});

describe('page metadata', () => {
  it.each(descriptions)('the %s mentions the 3D flyover', (_where, text) => {
    expect(text()).toMatch(/3D flyover/i);
  });

  it('lists the 3D flyover in the structured data feature list', () => {
    expect(structuredData().featureList).toEqual(expect.arrayContaining([expect.stringMatching(/3D flyover/i)]));
  });

  // The file never leaves the browser, but the maps fetch imagery for the
  // ride's area from tile servers, so "everything runs locally" overclaims.
  it.each(descriptions)('the %s promises the file stays in the browser without claiming everything is local', (_where, text) => {
    expect(text()).not.toMatch(/everything runs locally|all local/i);
    expect(text()).toMatch(/never leave/i);
  });
});

describe('share image', () => {
  const svg = read('public/og-image.svg');

  it('shows the 3D flyover among its feature pills', () => {
    expect(svg).toMatch(/>3D Flyover</);
  });

  it('makes the same promise as the descriptions beside it', () => {
    expect(svg).not.toMatch(/100% Local/i);
    expect(svg).toMatch(/>Never uploaded</);
  });
});
