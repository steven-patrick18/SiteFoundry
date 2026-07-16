// Seed stub — with M1/M2 this creates 1 tenant, 1 admin user, and 5 stock
// templates (per §15 of the build doc). No models exist yet, so it's a no-op.

async function main() {
  console.log('Seed: no models to seed yet (schema lands with Milestone M1).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
