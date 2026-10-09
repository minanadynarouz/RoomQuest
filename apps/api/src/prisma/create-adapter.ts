import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

const CONNECT_TIMEOUT_MS = 2_000;

/**
 * Neon pooled hosts look like `ep-xxx-pooler.us-west-2.aws.neon.tech`.
 * Local Docker Postgres uses `@prisma/adapter-pg` over TCP.
 */
export function isNeonConnectionString(connectionString: string): boolean {
  const host = hostnameOf(connectionString);
  if (host === undefined) {
    return false;
  }
  return host.endsWith('.neon.tech');
}

export function createPrismaAdapter(
  connectionString: string
): PrismaNeon | PrismaPg {
  const config = {
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  };
  if (isNeonConnectionString(connectionString)) {
    return new PrismaNeon(config);
  }
  return new PrismaPg(config);
}

function hostnameOf(connectionString: string): string | undefined {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
}
