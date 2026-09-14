# Cartesia website versus LMBook audio

2026-09-14. The owner reports that the same voices sound like a phone call in LMBook and studio recordings on Cartesia's website. The website script was authored by the owner and differs from the app script. This is a timbre/fidelity complaint, not primarily a complaint about dialogue writing.

## Verified behavior before 0.2.6

- Completed houseplant episode: Sonic 3.6, Gemma and Jameson, English, synthesis speed 1.0. The separate gs notebook has synthesis speed 1.2 but no generated episodes; that setting does not explain the completed plant audio.
- Cartesia requests use `/tts/bytes`, API version 2026-08-14, mono 24,000 Hz PCM16 WAV. No emotion, accent or pronunciation dictionary overrides are sent; normalization uses the provider default.
- The 240.08-second completed episode has 12 speaker turns and 12 independent requests. None of those turns was split internally or changed by whitespace normalization.
- The final WAV's PCM samples exactly match the concatenated 12 cached provider responses. No lossy encoding, resampling, volume processing, or sample alteration was introduced by joining. Optional MP3 export is separate from in-app WAV playback.
- API voice metadata identifies Gemma's native British accent and Jameson's native American accent. The request uses the base `en` language rather than an explicit regional locale. Whether the website uses different regional settings has not been established.

## Matched format comparison

Generated two separate short API responses using the first 339-character Gemma turn from the completed episode. Model, voice ID, text, language and speed were identical; only requested sample rate changed:

| Sample | Format | Duration |
| --- | --- | --- |
| A | PCM16 WAV, 24,000 Hz | 20.96 s |
| B | PCM16 WAV, 44,100 Hz | 20.80 s |

Ignored local artifacts: `.work/cartesia-quality/gemma-24000.wav`, `gemma-44100.wav`, `comparison-text.txt`, request settings without credentials, and level measurements. These used two short speech calls; no existing episode was regenerated during the comparison.

The API accepts both rates. The website's actual output format has not been measured. A higher requested rate is not proof of greater perceptual quality, and 24 kHz is already above conventional telephone bandwidth. Separate generations also have normal delivery variation.

## Owner feedback and adopted change

The owner confirmed sample B (44.1 kHz) sounds right and approved making it the default. This establishes their preference for this comparison, not a universal finding that 24 kHz causes telephone-like sound or proof of the website's exact settings.

Desktop 0.2.6 requests native 44.1 kHz PCM16 WAV for new plans, with a selectable 24 kHz option. It does not upsample old audio. Legacy episode snapshots default to their original 24 kHz, preserving existing fingerprints and cached segments; the high-quality fingerprint is distinct. Backups retain each episode's rate. Changing quality on an episode with audio creates a separate script copy through the existing voice-settings flow, leaving the original intact.

Validation: all 35 application tests passed, including four focused regressions covering native request rates, both WAV formats, legacy cache compatibility, separate revisions and backup/restore. The packaged desktop startup/sandbox/persistence/restart check passed. A separate packaged UI check loaded an isolated legacy episode, selected 44.1 kHz, saved a new episode copy and generated an actual two-host preview: 8.4 seconds, mono 44.1 kHz PCM16. Original bytes and script were preserved, and no renderer errors occurred. This used only 120 authored script characters in two short speech calls; no full user episode was generated or altered. Hidden-window screenshot capture was unavailable, so no visual screenshot sign-off is claimed. Local verification metadata is in `.work/cartesia-quality/desktop-026-verification.json`.

## Primary sources

- [Cartesia bytes endpoint](https://docs.cartesia.ai/api-reference/tts/bytes): Sonic 3.6, PCM16 WAV examples at 44.1 kHz and request controls.
- [Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest): same model offered in Playground and API; stable aliases and voice recommendations.
- [Generation controls](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion): settings are per request, not inherited from Playground or account configuration.
- [Contexts](https://docs.cartesia.ai/use-the-api/tts-websocket/contexts): continuation preserves prosody within a voice context. This does not establish that independently generated speaker turns caused the current fidelity complaint.
- [Regional behavior](https://docs.cartesia.ai/build-with-cartesia/capability-guides/advanced-capabilities): locale, accent and text normalization controls.
