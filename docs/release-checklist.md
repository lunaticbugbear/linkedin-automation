# Release checklist

- [ ] Run `npm test -- tests/api-registry/release-artifacts.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run registry audit with `npm run registry -- audit`.
- [ ] Confirm example validation passes for every file in `examples/*.json`.
- [ ] Confirm documentation freshness for schema, commands, agent contract, source policy, README, and LinkedIn post.
