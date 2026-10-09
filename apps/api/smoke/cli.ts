import { parseSmokeArgs } from './args';
import { formatSmokeTable, runSmoke } from './run';

async function main(): Promise<void> {
  const options = parseSmokeArgs(process.argv.slice(2));
  const report = await runSmoke(options);
  console.log(`Roomquest API smoke against ${report.baseUrl}`);
  console.log(formatSmokeTable(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

void main().catch((err: unknown) => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(message);
  process.exitCode = 1;
});
