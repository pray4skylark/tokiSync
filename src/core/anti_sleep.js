/**
 * Anti-Sleep Module
 * Prevents browser tab throttling by playing silent audio
 */

let audioContext = null;
let audioEl = null;
let oscillator = null;

export function startSilentAudio() {
    if (audioContext && audioContext.state === 'running') {
        console.log('[Anti-Sleep] Already running');
        return;
    }
    
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const dest = audioContext.createMediaStreamDestination();
        const gain = audioContext.createGain();
        
        oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 1; // 1Hz (Inaudible)
        oscillator.type = 'sine';
        gain.gain.value = 0.001; // Near silence
        
        oscillator.connect(gain);
        gain.connect(dest);
        oscillator.start();
        
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.classList.add('toki-hidden');
            document.body.appendChild(audioEl);
        }
        
        audioEl.srcObject = dest.stream;
        audioEl.play()
            .then(() => console.log('🔊 [Anti-Sleep] Audio started successfully'))
            .catch(e => {
                console.warn('🚫 [Anti-Sleep] Autoplay blocked:', e);
                throw e; // Re-throw to let caller handle
            });
            
    } catch (e) {
        console.error('[Anti-Sleep] Failed to start:', e);
        throw e;
    }
}

export function stopSilentAudio() {
    try {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
        
        if (audioEl) {
            audioEl.pause();
            audioEl.srcObject = null;
        }
        
        if (audioContext) {
            const ctx = audioContext;
            audioContext = null;
            ctx.close().then(() => {
                console.log('🔇 [Anti-Sleep] Audio stopped');
            }).catch(e => {
                console.warn('[Anti-Sleep] close error:', e);
            });
        }
    } catch (e) {
        console.error('[Anti-Sleep] Failed to stop:', e);
    }
}

export function isAudioRunning() {
    return audioContext && audioContext.state === 'running';
}
