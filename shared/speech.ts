import {
  cartesiaSampleRateSchema,
  settingsSchema,
  type Settings,
} from "./model.ts";

// Episodes created before quality was configurable used 24 kHz. Keep their
// original format so existing previews, cached segments and backups still match.
export const savedEpisodeSettingsSchema = settingsSchema.extend({
  cartesiaSampleRate: cartesiaSampleRateSchema.default(24000),
});

export const speechSettingsSchema = settingsSchema.pick({
  ttsProvider: true,
  ttsModel: true,
  voiceA: true,
  voiceB: true,
  cartesiaModel: true,
  cartesiaVoiceA: true,
  cartesiaVoiceB: true,
  cartesiaSpeed: true,
  cartesiaSampleRate: true,
});

export type CartesiaVoice = {
  id: string;
  name: string;
  description: string;
  language: string;
};
export type CartesiaVoicePage = {
  voices: CartesiaVoice[];
  nextPage: string | null;
};

export function voiceSelectionError(settings: Settings) {
  const [a, b] =
    settings.ttsProvider === "cartesia"
      ? [settings.cartesiaVoiceA, settings.cartesiaVoiceB]
      : [settings.voiceA, settings.voiceB];
  if (!a || !b) return "Choose a voice for each host.";
  if (a === b) return "Choose different voices for the two hosts.";
  return "";
}

// Character metering is approximate: provider text normalization can change it.
export function cartesiaCredits(text: string) {
  return Array.from(text).length;
}
