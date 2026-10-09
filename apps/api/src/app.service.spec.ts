import { describe, it, expect } from 'vitest';
import { AppService } from './app.service';

describe('AppService', () => {
  it('returns Hello World', () => {
    const service = new AppService();
    expect(service.getHello()).toBe('Hello World!');
  });
});
