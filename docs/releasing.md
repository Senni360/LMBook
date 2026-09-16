# Publishing a desktop release

## Local delivery location

The owner's explicit 2026-09-16 direction is to deliver builds only to the normal `D:\Downloads\SenniBook\release\<version>` directory on this computer. Do not put releases in worktree-local folders, `ai-preview`, temporary preview destinations or upload them elsewhere. This is the current delivery rule; older preview paths are historical evidence only. `scripts/package-desktop.mjs`, used by the desktop packaging npm scripts, resolves the main checkout even when run from a worktree, chooses `release/<version>` there and forces `--publish never`. Source archives use their own `release/<version>` directory. A local version request does not authorize GitHub publication or 0.4 approval.

The **Desktop release** GitHub Actions workflow builds iteration artifacts on PRs and `master`. Publication also requires explicit owner approval recorded in `release-policy.json`. The current target is 0.4.0 and approval is unset; see [the milestone agreement](0.4-plan.md). A merge or version bump alone cannot publish. To release an approved milestone:

1. Set the new version with `npm version <version> --no-git-tag-version`; commit both package files.
2. Add `docs/releases/<version>.md` with the release notes.
3. Only after the owner says the milestone is ready, set `targetVersion` and `approvedVersion` in `release-policy.json` to that exact version.
4. Merge the reviewed release changes into `master`.

The workflow installs locked dependencies, builds the app, runs the existing application tests, packages Windows installer/portable executables and macOS DMG/ZIP packages on native Apple Silicon and Intel runners and runs the existing packaged-desktop smoke check. It then transfers the checked artifacts to a separate publishing job. That job creates `v<version>` at the exact built commit, uploads all six packages and a combined `SHA256SUMS.txt`, checks GitHub's returned file hashes and publishes the release only after all uploads are verified. The highest release version becomes **Latest**.

No personal token is required. The first Mac builds are ad-hoc signed and not notarized; Developer ID signing would require separate Apple credentials. Build jobs have `contents: read`; only the publishing job has `contents: write` through GitHub's temporary `GITHUB_TOKEN`. Dependencies and packaging run without that write token. The workflow's third-party actions are pinned to commit SHAs.

A merge without a version bump does not produce another release for an already published version. Version numbers are not automatically incremented. Stable `MAJOR.MINOR.PATCH` versions are supported. This publishes downloads on GitHub; it does not install updates into an already running desktop app.

## Failures and retries

Inspect **Actions → Desktop release**. Failed builds or desktop checks publish nothing. Failed uploads leave an unpublished draft; rerunning the failed jobs can complete that same release. The workflow never replaces published downloads or moves an existing version tag. If a tag or draft belongs to a different commit, it stops for inspection; use a new version for changed application code.

**Run workflow** on `master` can publish an already merged but unreleased version only when the release policy approves that version. With approval unset, it checks the build without uploading iteration artifacts. Re-running an approved published version skips the build and leaves its downloads unchanged. Runs are serialized so releases cannot upload over each other.

For local packaging, `npm run desktop:dist` builds the Windows artifacts. Local binaries are not uploaded by merging a PR: the workflow produces its own checked build on a clean runner. Installer filenames on GitHub use `LMBook-Setup-<version>.exe`; portable files use `LMBook-<version>-portable.exe`.

Implementation references: [GitHub token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [release creation](https://docs.github.com/en/rest/releases/releases#create-a-release), and [electron-builder publishing controls](https://www.electron.build/v26/docs/publish/).


## macOS and PR checks

Pull requests to master run the same native Windows/Apple Silicon/Intel build matrix, even for an already released version. They build and check locally on each runner. They do not upload downloads as Actions artifacts and never run the publishing job. Artifact transfer is enabled only for an approved publication. The two Mac runners produce architecture-labelled DMG and ZIP files; Windows names remain compatible with earlier releases.

Each runner stages its own commit/version-bound manifest. A separate verification job requires all three target manifests, verifies every hash and size, and creates the combined checksum file. The publisher rechecks that complete set before creating or repairing its unpublished draft. One failed platform prevents publication of the whole release. Build and verification jobs have only read permissions; only master publication receives contents:write.

For local Mac packaging use `npm run desktop:dist:mac -- --arm64` or `--x64` on the matching Mac. See [Mac installation and limitations](macos.md).
