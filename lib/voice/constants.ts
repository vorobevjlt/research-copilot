export const MAX_VOICE_TEXT_LENGTH = 4096;
export const MAX_VOICE_FILE_SIZE = 10 * 1024 * 1024;

export const VOICE_FILE_MIME_TYPES = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  mpeg: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
} as const;

export type VoiceFileExtension = keyof typeof VOICE_FILE_MIME_TYPES;

export const VOICE_FILE_EXTENSIONS = Object.keys(
  VOICE_FILE_MIME_TYPES,
) as VoiceFileExtension[];

export const VOICE_FILE_ACCEPT = [
  ...VOICE_FILE_EXTENSIONS.map((extension) => `.${extension}`),
  ...new Set(Object.values(VOICE_FILE_MIME_TYPES)),
].join(",");

export function voiceFileDetails(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!Object.hasOwn(VOICE_FILE_MIME_TYPES, extension)) return null;

  const supportedExtension = extension as VoiceFileExtension;
  return {
    extension: supportedExtension,
    mimeType: VOICE_FILE_MIME_TYPES[supportedExtension],
  };
}

export const CONSENT_PHRASES = {
  de: "Ich bin Eigentümer dieser Stimme und stimme zu, dass diese Anwendung sie zur Erzeugung synthetischer Sprache verwendet.",
  en: "I own this voice and consent to this application using it to create synthetic speech.",
  es: "Soy el propietario de esta voz y autorizo a esta aplicación a utilizarla para crear voz sintética.",
  fr: "Je suis propriétaire de cette voix et j'autorise cette application à l'utiliser pour créer une voix synthétique.",
  it: "Sono il proprietario di questa voce e autorizzo questa applicazione a usarla per creare un parlato sintetico.",
  ja: "私はこの声の所有者であり、このアプリケーションが合成音声を作成するために使用することに同意します。",
  ko: "나는 이 음성의 소유자이며 이 애플리케이션이 합성 음성을 만드는 데 사용하는 것에 동의합니다.",
  nl: "Ik ben de eigenaar van deze stem en geef deze toepassing toestemming om de stem te gebruiken voor synthetische spraak.",
  pl: "Jestem właścicielem tego głosu i wyrażam zgodę na użycie go przez tę aplikację do tworzenia mowy syntetycznej.",
  pt: "Sou o proprietário desta voz e autorizo este aplicativo a usá-la para criar fala sintética.",
  ru: "Я являюсь владельцем этого голоса и разрешаю этому приложению использовать его для создания синтетической речи.",
  zh: "我是此声音的所有者，并同意此应用使用它来创建合成语音。",
} as const;

export type ConsentLanguage = keyof typeof CONSENT_PHRASES;

export const CONSENT_LANGUAGE_LABELS: Record<ConsentLanguage, string> = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
};
