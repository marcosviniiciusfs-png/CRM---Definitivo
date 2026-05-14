import { useState, useRef, useCallback } from 'react';

interface OpusRecorderConfig {
  onDataAvailable: (blob: Blob) => void;
  onError: (error: Error) => void;
}

// `opus-media-recorder` carregado dinamicamente quando o navegador NAO suporta
// MediaRecorder nativo com audio/ogg+opus (caso do Chrome, que so faz WebM).
// Garante que o blob final seja OGG/Opus real — Evolution API + WhatsApp aceitam
// como PTT sem precisar de conversao server-side via FFmpeg, que estava produzindo
// audio silencioso quando recebia bytes WebM rotulados como OGG.
const OPUS_LIB_OPTIONS = {
  // Servidos como assets estaticos pelo Vite a partir de public/.
  encoderWorkerFactory: () => new Worker('/opus-encoder-worker.js'),
  OggOpusEncoderWasmPath: '/OggOpusEncoder.wasm',
  WebMOpusEncoderWasmPath: '/WebMOpusEncoder.wasm',
};

async function getRecorder(stream: MediaStream): Promise<{ recorder: MediaRecorder; mimeType: string }> {
  const desired = 'audio/ogg; codecs=opus';
  // Caminho rapido: navegador suporta OGG nativo (Firefox).
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(desired)) {
    console.log('🎙️ Usando MediaRecorder nativo (suporta OGG/Opus)');
    const recorder = new MediaRecorder(stream, {
      mimeType: desired,
      audioBitsPerSecond: 64000,
    });
    return { recorder, mimeType: desired };
  }

  // Fallback: carrega o polyfill que produz OGG/Opus via WebAssembly (Chrome/Edge/Safari).
  console.log('🎙️ Navegador sem OGG nativo — carregando opus-media-recorder...');
  const mod = await import('opus-media-recorder');
  // O polyfill exporta default. Construtor aceita workerOptions como 3o arg.
  const OpusMediaRecorder = (mod as any).default || mod;
  const polyfillRecorder = new OpusMediaRecorder(
    stream,
    { mimeType: desired, audioBitsPerSecond: 64000 },
    OPUS_LIB_OPTIONS
  ) as unknown as MediaRecorder;
  return { recorder: polyfillRecorder, mimeType: desired };
}

export const useOpusRecorder = ({ onDataAvailable, onError }: OpusRecorderConfig) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Espelha recordingTime em ref para nao recriar startRecording a cada
  // tick do timer (recordingTime nas deps do useCallback dispara cascata:
  // hook re-renderiza → recorder muda referencia → cleanup useEffect que
  // tem `recorder` nas deps re-roda → mata a gravacao em andamento).
  const recordingTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('🎙️ Iniciando gravação...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const { recorder, mimeType } = await getRecorder(stream);
      mediaRecorderRef.current = recorder;

      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event: any) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log('🛑 Gravação parada. Chunks:', audioChunks.length);

        if (audioChunks.length > 0) {
          // Sempre rotulamos como audio/ogg porque garantimos bytes OGG/Opus —
          // nativo (Firefox) ou via polyfill (Chrome/Edge/Safari).
          const finalBlob = new Blob(audioChunks, { type: mimeType });

          console.log('✅ Blob de áudio criado:', {
            size: finalBlob.size,
            type: finalBlob.type,
            duration: recordingTimeRef.current,
          });

          onDataAvailable(finalBlob);
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        setIsRecording(false);
        setIsLoading(false);
      };

      recorder.onerror = (event: any) => {
        console.error('❌ Erro no recorder:', event);
        setIsRecording(false);
        setIsLoading(false);
        onError(new Error('Erro ao gravar áudio'));
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      intervalRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      console.log('✅ Gravação iniciada');
    } catch (error) {
      console.error('❌ Erro ao iniciar gravação:', error);
      setIsRecording(false);
      setIsLoading(false);
      onError(error instanceof Error ? error : new Error('Não foi possível acessar o microfone'));
    }
  }, [onDataAvailable, onError]);

  const stopRecording = useCallback(() => {
    console.log('🛑 stopRecording chamado');

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('❌ Erro ao parar recorder:', error);
      }
    }
  }, [isRecording]);

  const cleanup = useCallback(() => {
    console.log('🧹 Limpando recursos do gravador');

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Erro ao parar recorder no cleanup:', error);
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setIsLoading(false);
    setRecordingTime(0);
  }, []);

  return {
    isRecording,
    recordingTime,
    isLoading,
    startRecording,
    stopRecording,
    cleanup,
  };
};
