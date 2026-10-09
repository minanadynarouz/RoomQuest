import { describe, expect, it } from 'vitest';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPrismaAdapter, isNeonConnectionString } from './create-adapter';

describe('createPrismaAdapter', () => {
  it('detects Neon pooled and direct hosts', () => {
    expect(
      isNeonConnectionString(
        'postgresql://user:pass@ep-foo-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require'
      )
    ).toBe(true);
    expect(
      isNeonConnectionString(
        'postgresql://user:pass@ep-foo.us-west-2.aws.neon.tech/neondb?sslmode=require'
      )
    ).toBe(true);
  });

  it('does not treat local Docker Postgres as Neon', () => {
    expect(
      isNeonConnectionString(
        'postgresql://postgres:postgres@localhost:5432/roomquest'
      )
    ).toBe(false);
  });

  it('uses PrismaNeon for Neon URLs and PrismaPg otherwise', () => {
    const neon = createPrismaAdapter(
      'postgresql://user:pass@ep-foo-pooler.us-west-2.aws.neon.tech/neondb'
    );
    const local = createPrismaAdapter(
      'postgresql://postgres:postgres@localhost:5432/roomquest'
    );
    expect(neon).toBeInstanceOf(PrismaNeon);
    expect(local).toBeInstanceOf(PrismaPg);
  });
});
