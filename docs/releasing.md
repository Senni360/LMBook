# Publishing a Windows release

The **Windows release** GitHub Actions workflow runs when a commit reaches `master`. It reads `package.json` and skips versions that already have a published release. To release a change:

1. Set the new version with `npm version <version> --no-git-tag-version`; commit both package files.
2. Add `docs/releases/<version>.md` with the release notes.
3. Merge the PR into `master`.

The workflow installs locked dependencies, builds the app, runs the existing application tests, packages Windows installer/portable executables and runs the existing packaged-desktop smoke check. It then transfers the checked artifacts to a separate publishing job. That job creates `v<version>` at the exact built commit, uploads both executables and `SHA256SUMS.txt`, checks GitHub's returned file hashes and publishes the release only after all uploads are verified. The highest release version becomes **Latest**.

No personal token or additional secret is required. Build jobs have `contents: read`; only the publishing job has `contents: write` through GitHub's temporary `GITHUB_TOKEN`. Dependencies and packaging run without that write token. The workflow's third-party actions are pinned to commit SHAs.

A merge without a version bump does not produce another release for an already published version. Version numbers are not automatically incremented. Stable `MAJOR.MINOR.PATCH` versions are supported. This publishes downloads on GitHub; it does not install updates into an already running desktop app.

## Failures and retries

Inspect **Actions → Windows release**. Failed builds or desktop checks publish nothing. Failed uploads leave an unpublished draft; rerunning the failed jobs can complete that same release. The workflow never replaces published downloads or moves an existing version tag. If a tag or draft belongs to a different commit, it stops for inspection; use a new version for changed application code.

**Run workflow** on `master` can publish an already merged but unreleased version. Re-running a published version skips the build and leaves its downloads unchanged. Runs are serialized so releases cannot upload over each other.

For local packaging, `npm run desktop:dist -- --publish never` builds the Windows artifacts. Local binaries are not uploaded by merging a PR: the workflow produces its own checked build on a clean runner. Installer filenames on GitHub use `LMBook-Setup-<version>.exe`; portable files use `LMBook-<version>-portable.exe`.

Implementation references: [GitHub token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [release creation](https://docs.github.com/en/rest/releases/releases#create-a-release), and [electron-builder publishing controls](https://www.electron.build/v26/docs/publish/).
