# TypeSafe Jev integration

Research captured 2026-09-16 from the official [TypeSafe API reference](https://docs.typesafe.ai/api), [quick start](https://docs.typesafe.ai/introduction/quickstart), [primitives](https://docs.typesafe.ai/primitives), and [JavaScript SDK documentation](https://docs.typesafe.ai/sdk/javascript). The official Python SDK repository is [typesafe-ai/typesafe-sdk-python](https://github.com/typesafe-ai/typesafe-sdk-python).

## Confirmed contract

The HTTP API is `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer <API_KEY>` and JSON. Requests contain `state`, `model` (`jev-latest`), and a named `questions` map. Choice questions use `type: "choice"`, `instructions`, and a criteria map. Responses contain `model`, an `answers` map, and `usage`; Choice answers contain `choice`, `probabilities`, and `confidence`.

The adapter keeps API keys in a host-only `data/jev-credentials.json` file with mode 0600 and atomic replacement. It never returns or logs secrets. A candidate key is checked against a small authored connection decision before persistence, and a revision guard prevents an older concurrent check from overwriting a newer choice. An environment `TYPESAFE_API_KEY` is supported as a fallback and is reported only as `environment` in status.

LMBook validates request bounds and the response schema locally, checks that returned choices and probability keys belong to the requested criteria, caps state at 120,000 serialized characters, caps questions at 32 and options at 255, bounds response bytes, and combines caller cancellation with a 120-second timeout. The connection check sends only the authored string `LMBook connection check`.

## Product boundary and limitations

The first adapter surface is generic Choice because it is sufficient for notebook review, source organization, answerability, ranking, and related routing decisions. Noul and Score are documented by TypeSafe and can be added behind the same endpoint, but are intentionally not exposed until a concrete LMBook workflow needs their semantics. The feature settings default to `notebookReview`, `connections`, and `searchRanking` disabled. Each is independently persisted; enabling a feature is an explicit opt-in and does not authorize sending the whole notebook automatically. The caller must construct bounded state for the specific decision.

TypeSafe documents `401`, `422`, `429`, and `529` responses. The adapter maps these to user-facing errors and does not retry automatically; workflows can decide whether a retry is appropriate. No API key or live paid request was available during implementation, so connectivity and billing behavior remain unverified in this environment.
