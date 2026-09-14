# OpenCode request delivery

Checked 2026-09-14 against installed OpenCode 1.18.30 and a real OpenCode Go request.

LMBook passes its complete bounded prompt through the CLI's standard input. It runs in an empty temporary working directory, disables tools, and reuses the existing local CLI login. Credentials are not copied into notebook data.

The previous `--file request.txt` path produced a consequential failure: an 89,266-character prompt contained the selected passage near its end, but the model reported that the relevant material was absent. The attachment reader supplied only part of the file. Passing the same request through standard input made the relevant passage available; the response quoted the condition and preserved its limitations.

This path is supported directly by the [OpenCode 1.18.30 run command implementation](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/cli/cmd/run.ts), which reads non-terminal standard input with `Bun.stdin.text()` and incorporates it into the message. It also avoids Windows command-line length limits. This is a version-specific integration observation, not a guarantee about future CLI behavior or all context sizes.

Follow-up app validation used a 279,235-character illustrative archive. Deterministic passage selection supplied 1,800 characters containing the late relevant rule. A real Go chat returned five validated verbatim quotes and preserved both the public-vote condition and the limits on what could be inferred. Coverage established the supported goal and labelled an unrelated goal as not established, explicitly qualifying that only selected material was supplied. No actual course material or educational effectiveness was evaluated.

Provider limits still apply. LMBook bounds source context separately, records the supplied ranges, and does not treat failure to find evidence in a selected subset as proof of absence. A future CLI update should be checked with material at the end of a long request before claiming compatibility.
