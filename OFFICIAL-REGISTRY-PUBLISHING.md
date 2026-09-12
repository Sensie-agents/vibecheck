# Official MCP Registry publication

The `Publish Official MCP Registry` workflow replaces expiring personal
Registry sessions with GitHub Actions OIDC. It is manual and publishes only
from this repository's `main` branch. It has no PAT, stored Registry token, or
human OAuth step.

The workflow's `version` input must exactly match `server.json`, the private
wrapper version, its exact `@somacheck/vibecheck` dependency, the lock entry,
and public npm metadata. The npm `dist.integrity` must equal the lockfile SRI.
The canonical Registry namespace is `io.github.Sensie-agents/vibecheck`, which
matches the owner of the public `Sensie-agents/vibecheck` repository. A private
`sensie-app` checkout is not an authorized substitute.

Before dispatch, review the exact `main` SHA and run:

```sh
node --test .github/scripts/verify-registry-publication.test.mjs
npm ci --omit=dev --ignore-scripts
node .github/scripts/verify-mcp-runtime.mjs ./node_modules/.bin/vibecheck
mcp-publisher validate server.json
```

Then an authorized release owner may manually dispatch the workflow against
`main`, entering the exact reviewed version. The job revalidates repository,
ref, event, namespace, version, npm identity, and SRI before requesting an OIDC
token. It downloads `mcp-publisher` 1.8.1 from the official Registry release
and checks the fixed Linux amd64 SHA-256 before execution.

Publication is successful only after the public Registry latest-version API
returns this exact version as both `active` and latest. The retained artifact
contains only repository/ref/source SHA, version, publisher version, manifest
hash, bounded Registry state, and observation time. It contains no OIDC token,
Registry JWT, GitHub token, npm payload, user data, or MCP result data.

Local tests and workflow validation do not prove that GitHub issued an OIDC
token or that Registry publication succeeded. Those remain live dispatch and
public readback gates.
