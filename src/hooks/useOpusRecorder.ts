import { useState, useRef, useCallback } from 'react';

interface OpusRecorderConfig {
  onDataAvailable: (blob: Blob) => void;
  onError: (error: Error) => void;
}

// Hook de gravação que PRIORIZA funcionamento estável no navegador
// Usa MediaRecorder nativo e tenta usar OGG/OPUS quando suportado.
// Em navegadores que não suportarem, ainda grava áudio com boa qualidade
// e mantém o fluxo PTT (ptt: true) no backend.
export const useOpusRecorder = ({ onDataAvailable, onError }: OpusRecorderConfig) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('🎙️ Iniciando gravação (MediaRecorder nativo)...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Tentar OGG/OPUS primeiro
      let mimeType = 'audio/ogg; codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm; codecs=opus';
        console.log('⚠️ OGG/OPUS não suportado, usando WebM/OPUS');
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        console.log('⚠️ WebM/OPUS não suportado, usando WebM genérico');
      }

      console.log('🎙️ Formato selecionado para gravação:', mimeType);

      const options: MediaRecorderOptions = {
        mimeType,
        audioBitsPerSecond: 64000, // 64kbps para voz
      };

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log('🛑 Gravação parada. Chunks:', audioChunks.length);

        if (audioChunks.length > 0) {
          // Forçamos o tipo OGG/OPUS para maximizar compatibilidade com backend/PTT.
          const finalBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });

          console.log('✅ Blob de áudio criado:', {
            size: finalBlob.size,
            type: finalBlob.type,
            duration: recordingTime,
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

      recorder.onerror = (event) => {
        console.error('❌ Erro no MediaRecorder:', event);
        setIsRecording(false);
        setIsLoading(false);
        onError(new Error('Erro ao gravar áudio'));
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      intervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      console.log('✅ Gravação iniciada com MediaRecorder');
    } catch (error) {
      console.error('❌ Erro ao iniciar gravação:', error);
      setIsRecording(false);
      setIsLoading(false);
      onError(error instanceof Error ? error : new Error('Não foi possível acessar o microfone'));
    }
  }, [onDataAvailable, onError, recordingTime]);

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
        console.error('❌ Erro ao parar MediaRecorder:', error);
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
        console.error('Erro ao parar MediaRecorder no cleanup:', error);
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
