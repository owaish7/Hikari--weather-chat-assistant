
import { useState, useCallback, useEffect } from 'react';


const SpeechRecognition =
    (typeof window !== 'undefined' && (window as any).SpeechRecognition) ||
    (typeof window !== 'undefined' && (window as any).webkitSpeechRecognition);

export const useVoiceInput = (onTranscript: (transcript: string) => void, language: string = 'ja-JP') => {
    const [isListening, setIsListening] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);

    const isSupported = !!SpeechRecognition;

    
    const [recognition, setRecognition] = useState<any>(null);

    useEffect(() => {
        if (isSupported) {
            const rec = new SpeechRecognition();
            rec.continuous = false; 
            rec.interimResults = false;
            rec.lang = language; 

            rec.onstart = () => {
                setIsListening(true);
                setVoiceError(null);
            };

            rec.onresult = (event: any) => {
                try {
                    if (event.results && event.results[0] && event.results[0][0]) {
                        const transcript = event.results[0][0].transcript;
                        console.log('Voice transcript received:', transcript);
                        onTranscript(transcript);
                    } else {
                        console.warn('No valid transcript in voice recognition result');
                    }
                } catch (error) {
                    console.error('Error processing voice transcript:', error);
                    setVoiceError('Error processing voice input');
                }
            };

            rec.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                if (event.error !== 'no-speech') {
                    setVoiceError(`Voice error: ${event.error}.`);
                }
                setIsListening(false);
            };

            rec.onend = () => {
                setIsListening(false);
            };

            setRecognition(rec);
        }
    }, [isSupported, onTranscript, language]);

    const startListening = useCallback(() => {
        if (!recognition) {
            setVoiceError('Voice recognition not initialized or supported.');
            return;
        }

        // Stop any previous instance before starting
        if (isListening) {
            recognition.stop();
            return;
        }

        try {
            recognition.start();
        } catch (e: unknown) {
            
            if (e instanceof Error && e.name !== 'InvalidStateError') {
                setVoiceError(`Voice start error: ${e.message}`);
            }
        }
    }, [recognition, isListening]);

    return {
        isListening,
        voiceError,
        isSupported,
        startListening,
    };
};
