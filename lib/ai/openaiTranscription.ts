import { supabase } from '@/lib/supabase';

export type TranscribeAudioInput = {
  audioBase64: string;
  fileName: string;
  language?: string;
  mimeType: string;
  prompt?: string;
};

export type TranscribeAudioResult = {
  durationMs?: number;
  model?: string;
  text: string;
};

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const { data, error } = await supabase.functions.invoke('openai-transcribe', {
    body: input,
  });

  if (error) {
    throw new Error(error.message);
  }

  const text = String(data?.text ?? '').trim();

  if (!text) {
    throw new Error('Voice transcription returned no text.');
  }

  return {
    durationMs: typeof data?.durationMs === 'number' ? data.durationMs : undefined,
    model: typeof data?.model === 'string' ? data.model : undefined,
    text,
  };
}
