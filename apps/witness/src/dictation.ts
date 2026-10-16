/**
 * Voice answers on SCR-006 by dictation: the browser's speech recognition turns the reporter's voice into text in the
 * answer field, the reporter checks it, and only the text is sent. AGESOA never receives or stores the voice of an
 * anonymous reporter (a voice identifies a person). Not offered where the browser has no speech recognition.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionClass(scope: object = globalThis): RecognitionConstructor | null {
  const w = scope as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(scope?: object): boolean {
  return recognitionClass(scope) !== null;
}

export interface Dictation {
  stop(): void;
}

/** Starts dictation in Indonesian; `onText` gets each final phrase, `onEnd` is called once (with an error code). */
export function startDictation(
  onText: (text: string) => void,
  onEnd: (error?: string) => void,
  scope?: object,
): Dictation | null {
  const Ctor = recognitionClass(scope);
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "id-ID";
  recognition.interimResults = false;
  recognition.continuous = true;
  let failure: string | undefined;
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (result.isFinal && text) onText(text);
    }
  };
  recognition.onerror = (event) => {
    failure = event.error;
  };
  recognition.onend = () => onEnd(failure);
  recognition.start();
  return { stop: () => recognition.stop() };
}

/** Appends a dictated phrase to what is already typed. */
export function appendDictated(draft: string, phrase: string): string {
  const base = draft.trimEnd();
  return base ? `${base} ${phrase}` : phrase;
}
