import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('Extension Build Output', () => {
  it('generates valid Manifest V3 structure in dist', () => {
    const dist = resolve(__dirname, '../dist');
    expect(existsSync(resolve(dist, 'manifest.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel?.default_path).toBe('sidepanel/index.html');
    expect(existsSync(resolve(dist, 'background.js'))).toBe(true);
    expect(existsSync(resolve(dist, 'content.js'))).toBe(true);
    expect(existsSync(resolve(dist, 'sidepanel/index.html'))).toBe(true);
  });
});
