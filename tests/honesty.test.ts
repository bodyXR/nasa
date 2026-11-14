import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectTsFiles(full, out);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('Scientific Honesty & Forbidden Label Guard', () => {
  it('contains zero instances of forbidden "SAFE ROUTE" labels across src/ and server/', () => {
    const files = [
      ...collectTsFiles(join(process.cwd(), 'src')),
      ...collectTsFiles(join(process.cwd(), 'server')),
      ...collectTsFiles(join(process.cwd(), 'shared')),
    ];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content.toUpperCase()).not.toContain('SAFE ROUTE');
    }
  });

  it('contains zero "guaranteed safe" safety claims anywhere in UI or API copy', () => {
    const files = [
      ...collectTsFiles(join(process.cwd(), 'src')),
      ...collectTsFiles(join(process.cwd(), 'server')),
    ];

    for (const file of files) {
      const content = readFileSync(file, 'utf8').toLowerCase();
      expect(content).not.toContain('guaranteed safe');
      expect(content).not.toContain('guaranteed passable');
    }
  });
});
