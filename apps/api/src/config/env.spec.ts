import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { DEFAULT_DIRECTOR_MODEL } from '../director/director.constants';
import { isLlmConfigured, validateEnv } from './env';

describe('validateEnv', () => {
  it('accepts a missing DATABASE_URL and DIRECT_URL', () => {
    const env = validateEnv({ NODE_ENV: 'test' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('treats blank DATABASE_URL as unset', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: '   ',
      DIRECT_URL: '',
    });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('defaults DIRECTOR_MODEL when unset or blank', () => {
    const unset = validateEnv({ NODE_ENV: 'test' });
    expect(unset.DIRECTOR_MODEL).toBe(DEFAULT_DIRECTOR_MODEL);

    const blank = validateEnv({
      NODE_ENV: 'test',
      DIRECTOR_MODEL: '  ',
    });
    expect(blank.DIRECTOR_MODEL).toBe(DEFAULT_DIRECTOR_MODEL);
  });

  it('keeps explicit DIRECTOR_MODEL', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      DIRECTOR_MODEL: 'gemini-3.5-flash-lite',
    });
    expect(env.DIRECTOR_MODEL).toBe('gemini-3.5-flash-lite');
  });

  it('keeps a non-empty DATABASE_URL', () => {
    const url = 'postgresql://postgres:postgres@localhost:5432/roomquest';
    const env = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      DIRECT_URL: url,
    });
    expect(env.DATABASE_URL).toBe(url);
    expect(env.DIRECT_URL).toBe(url);
  });

  it('treats LLM as configured only when GOOGLE_API_KEY is present', () => {
    expect(isLlmConfigured(validateEnv({ NODE_ENV: 'test' }))).toBe(false);
    expect(
      isLlmConfigured(
        validateEnv({ NODE_ENV: 'test', GOOGLE_API_KEY: 'test-google-key' })
      )
    ).toBe(true);
  });

  it('defaults LLM_QUOTA_COOLDOWN_S to 600 and keeps an explicit value', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).LLM_QUOTA_COOLDOWN_S).toBe(600);
    expect(
      validateEnv({ NODE_ENV: 'test', LLM_QUOTA_COOLDOWN_S: '120' })
        .LLM_QUOTA_COOLDOWN_S
    ).toBe(120);
  });

  it('rejects a non-positive LLM_QUOTA_COOLDOWN_S', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'test', LLM_QUOTA_COOLDOWN_S: '0' })
    ).toThrow(/Invalid environment/);
  });

  it('defaults LLM_DAILY_MAX to 150 and keeps an explicit value', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).LLM_DAILY_MAX).toBe(150);
    expect(
      validateEnv({ NODE_ENV: 'test', LLM_DAILY_MAX: '20' }).LLM_DAILY_MAX
    ).toBe(20);
  });

  it('rejects a non-positive LLM_DAILY_MAX', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'test', LLM_DAILY_MAX: '0' })
    ).toThrow(/Invalid environment/);
  });
});

describe('leftover ANTHROPIC_API_KEY', () => {
  const previous = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previous === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('startup with ANTHROPIC_API_KEY set and unset produces no warning logs', async () => {
    const warnings: string[] = [];
    const capture = (message: unknown): void => {
      warnings.push(typeof message === 'string' ? message : String(message));
    };
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(capture);

    for (const leftover of [undefined, 'leftover-anthropic-key'] as const) {
      if (leftover === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = leftover;
      }

      const env = validateEnv({
        NODE_ENV: 'test',
        ANTHROPIC_API_KEY: leftover,
      });
      expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
      expect(isLlmConfigured(env)).toBe(false);

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      await app.close();
    }

    expect(warnings).toEqual([]);
  });
});
