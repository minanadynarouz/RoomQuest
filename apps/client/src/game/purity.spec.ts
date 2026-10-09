/**
 * Purity test for game/ directory - F-02
 * Ensures no DOM, IWSDK, or Three.js imports in game logic
 */

import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN_IMPORTS = [
  // DOM
  'document',
  'window',
  'HTMLElement',
  'addEventListener',
  
  // IWSDK
  '@iwsdk/core',
  '@iwsdk/',
  
  // Three.js
  'three',
  'super-three',
  'THREE',
  
  // PMNDRS (Three.js ecosystem)
  '@pmndrs/',
];

async function* getFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const path = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      yield* getFiles(path);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      // Skip test files
      if (!entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.test.ts')) {
        yield path;
      }
    }
  }
}

async function checkFileForForbiddenImports(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: string[] = [];
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Check import statements
    if (trimmed.startsWith('import ')) {
      for (const forbidden of FORBIDDEN_IMPORTS) {
        if (trimmed.includes(forbidden)) {
          violations.push(
            `Line ${index + 1}: Forbidden import "${forbidden}" in ${filePath}`
          );
        }
      }
    }
    
    // Check require statements
    if (trimmed.includes('require(')) {
      for (const forbidden of FORBIDDEN_IMPORTS) {
        if (trimmed.includes(forbidden)) {
          violations.push(
            `Line ${index + 1}: Forbidden require "${forbidden}" in ${filePath}`
          );
        }
      }
    }
  });
  
  return violations;
}

describe('game/ directory purity', () => {
  it('has no DOM, IWSDK, or Three.js imports', async () => {
    const gameDir = join(process.cwd(), 'src', 'game');
    const allViolations: string[] = [];
    
    for await (const file of getFiles(gameDir)) {
      const violations = await checkFileForForbiddenImports(file);
      allViolations.push(...violations);
    }
    
    if (allViolations.length > 0) {
      console.error('\n' + allViolations.join('\n'));
    }
    
    expect(allViolations).toEqual([]);
  }, 10000); // Increase timeout for file operations
});
