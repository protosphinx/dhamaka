# Publishing `dhamaka` to npm

Releases are tag-driven. Push `vX.Y.Z` and the release workflow
(`.github/workflows/release.yml`) handles everything: wasm build, tests,
staging, GitHub release with artifacts, and npm publish.

## One-time setup

1. Reserve the `dhamaka` name on npm (or, if you already own it, skip).
2. Create an npm automation token: <https://www.npmjs.com/settings/~/tokens>.
   Use an **Automation** token so 2FA doesn't block CI.
3. Add it to the GitHub repo secrets:
   `Settings → Secrets and variables → Actions → New repository secret`
   - Name: `NPM_TOKEN`
   - Value: the token from step 2
4. (Optional) Enable OIDC trusted publishing if you prefer provenance over
   tokens. The workflow already passes `--provenance`, which npm requires
   for verified builds from GitHub Actions.

## Cut a release

```bash
# Bump the version in packages/sdk/package.json and CHANGELOG.md, then:
git add packages/sdk/package.json CHANGELOG.md
git commit -m "release: v0.1.1"
git tag -a v0.1.1 -m "v0.1.1"
git push origin main
git push origin v0.1.1
```

The tag push triggers the release workflow, which will:

1. Install Rust + `wasm32-unknown-unknown`
2. `cargo test` the runtime crate
3. Build `dhamaka-runtime.wasm` via `crates/dhamaka-runtime/build.sh`
4. Run the JS test suite (`npm test`)
5. Run `scripts/prepare-publish.mjs` to stage `packages/sdk/_staging/`
6. `npm pack` the staged package
7. Verify the tag matches the package version
8. `npm publish --access public --provenance` (if `NPM_TOKEN` is set)
9. Create a GitHub release named "Dhamaka vX.Y.Z" with release notes
   extracted from `CHANGELOG.md` and the tarball + raw wasm attached

If `NPM_TOKEN` is **not** set, the workflow still runs end-to-end but skips
step 8 gracefully — useful for dry-running the pipeline before flipping the
publish switch.

## Manual publish

You don't need the workflow. If you have your npm credentials locally:

```bash
# from the repo root
crates/dhamaka-runtime/build.sh    # compile the wasm
node scripts/prepare-publish.mjs   # stage packages/sdk/_staging/
cd packages/sdk/_staging
npm publish --access public
```

## What ends up in the tarball

```
dhamaka-X.Y.Z.tgz
├── package.json            # standalone, no workspace refs
├── README.md
├── LICENSE
├── CHANGELOG.md
└── src/
    ├── index.js            # Dhamaka.load / complete / stream / chat / …
    ├── hub-client.js       # tiered HubClient + FallbackStore
    ├── chat.js             # stateful chat session
    ├── openai-shim.js      # /v1/chat/completions compatibility
    └── _runtime/           # vendored @dhamaka/runtime
        ├── index.js
        ├── engine.js
        ├── factory.js
        ├── mock-engine.js
        ├── wasm-engine.js
        ├── tokenizer.js
        └── dhamaka-runtime.wasm   # 56 KB compiled Rust
```

The published `dhamaka` package depends on **nothing**. It bundles the
compiled WASM runtime, so `npm install dhamaka` followed by
`import { Dhamaka } from "dhamaka"` is all a consumer needs.

## Version policy

- `major`: breaking ABI changes to the Rust runtime, or breaking changes to
  the `Dhamaka` SDK class.
- `minor`: new features, new engines, new models in the registry, new
  public SDK methods.
- `patch`: bug fixes, doc updates, internal refactors.

The published npm version is always the same as the `packages/sdk/package.json`
version, which is always the same as the git tag without its `v` prefix.
The release workflow verifies this and fails the build if they diverge.
