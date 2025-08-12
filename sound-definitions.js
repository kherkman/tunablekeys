// This file can be loaded by the main application.
// It contains a function that returns the body for generating all audio sounds.
// The main application is responsible for loading the pianoSamples array.

// A global variable to hold the piano sample buffers, expected to be populated by the main script.
let pianoSamples = [];
let pianoSampleIndex = 0;

// The main function that will be called by the HTML file.
function getSoundDefinitionFunctionBody() {
    // Return the entire sound generation logic as a template literal string.
    return `
    let mainOsc, mainGain, filterNode, modulatorOsc, modulatorGain, noiseSource, lfo, lfoGain;
    let isSelfStopping = false;
    let soundNaturalDuration = 0.1; 

    switch (soundType) {
        case 'piano_wav':
            // This case handles the new round-robin piano sample playback.
            // It assumes 'pianoSamples' is an array of AudioBuffers loaded by the main script.
            if (!pianoSamples || pianoSamples.length === 0) {
                console.warn("Piano samples not loaded or array is empty. Playing fallback sine.");
                // Fallback to a simple sine wave if samples are not available.
                soundType = 'sine'; 
                // Re-run this switch with the new soundType. This is a simple way to fall back.
                // For now, we'll just define the sine wave here directly.
                mainGain = audioContext.createGain();
                mainOsc = audioContext.createOscillator();
                mainOsc.type = 'sine';
                mainOsc.connect(mainGain);
                mainGain.gain.setValueAtTime(0, now);
                mainGain.gain.linearRampToValueAtTime(0.3, now + 0.02); 
                mainOsc.frequency.setValueAtTime(frequency, now);
                mainOsc.start(now);
                return { mainOsc, mainGain, isSelfStopping: false, soundNaturalDuration: 0.1 };
            }

            // --- Round-Robin Logic ---
            const sampleToPlay = pianoSamples[pianoSampleIndex];
            pianoSampleIndex = (pianoSampleIndex + 1) % pianoSamples.length; // Cycle to the next sample.

            const sampleSource = audioContext.createBufferSource();
            sampleSource.buffer = sampleToPlay;

            // --- Pitch-Shifting Logic ---
            // The samples are of note A2, which has a frequency of 220 Hz.
            const baseFrequency = 220.0; 
            // The playbackRate determines the pitch shift.
            // rate = target frequency / original frequency
            const playbackRate = frequency / baseFrequency;
            sampleSource.playbackRate.setValueAtTime(playbackRate, now);
            
            mainGain = audioContext.createGain();
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.6, now + 0.01); // Quick attack

            sampleSource.connect(mainGain);
            sampleSource.start(now);
            
            // Assign sampleSource to mainOsc for compatibility with stop logic.
            mainOsc = sampleSource;
            break;

        case 'pluck_triangle': 
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator();
            mainOsc.type = 'triangle';
            mainOsc.connect(mainGain);
            soundNaturalDuration = 0.25 + Math.random() * 0.1; 
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.7, now + 0.005); 
            mainGain.gain.exponentialRampToValueAtTime(0.001, now + soundNaturalDuration);
            isSelfStopping = true;
            mainOsc.frequency.setValueAtTime(frequency, now);
            mainOsc.start(now);
            break;

        case 'pluck_saw': 
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator();
            mainOsc.type = 'sawtooth';
            filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.Q.setValueAtTime(1, now);
            mainOsc.connect(filterNode);
            filterNode.connect(mainGain);
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.5, now + 0.01); 
            mainGain.gain.exponentialRampToValueAtTime(0.2, now + 0.1); 
            mainGain.gain.exponentialRampToValueAtTime(0.1, now + 0.3); 
            filterNode.frequency.setValueAtTime(5000, now);
            filterNode.frequency.exponentialRampToValueAtTime(300, now + 0.15);
            filterNode.frequency.exponentialRampToValueAtTime(200, now + 0.4);
            mainOsc.frequency.setValueAtTime(frequency, now);
            mainOsc.start(now);
            soundNaturalDuration = 0.4; 
            break;

        case 'warm_saw':
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator();
            mainOsc.type = 'sawtooth';
            filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(800, now);
            filterNode.Q.setValueAtTime(0.7, now);
            mainOsc.connect(filterNode);
            filterNode.connect(mainGain);
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.4, now + 0.02); 
            mainOsc.frequency.setValueAtTime(frequency, now);
            mainOsc.start(now);
            break;
        
        case 'bell':
            mainGain = audioContext.createGain();
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.4, now + 0.005); 
            mainGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5); 
            isSelfStopping = true;
            soundNaturalDuration = 1.5;
            
            let oscBell1 = audioContext.createOscillator();
            oscBell1.type = 'sine';
            oscBell1.frequency.setValueAtTime(frequency, now);
            oscBell1.connect(mainGain);
            oscBell1.start(now);
            activeOscillators[\`\${soundId}_aux1\`] = { oscillator: oscBell1, gainNode: null };

            let oscBell2 = audioContext.createOscillator();
            oscBell2.type = 'triangle'; 
            oscBell2.frequency.setValueAtTime(frequency * 2.4, now); 
            let gainBell2 = audioContext.createGain();
            gainBell2.gain.setValueAtTime(0.2, now); 
            oscBell2.connect(gainBell2);
            gainBell2.connect(mainGain);
            oscBell2.start(now);
            activeOscillators[\`\${soundId}_aux2\`] = { oscillator: oscBell2, gainNode: gainBell2 };

            let oscBell3 = audioContext.createOscillator();
            oscBell3.type = 'sine';
            oscBell3.frequency.setValueAtTime(frequency * 3.6, now); 
            let gainBell3 = audioContext.createGain();
            gainBell3.gain.setValueAtTime(0.1, now);
            oscBell3.connect(gainBell3);
            gainBell3.connect(mainGain);
            oscBell3.start(now);
            activeOscillators[\`\${soundId}_aux3\`] = { oscillator: oscBell3, gainNode: gainBell3 };
            
            mainOsc = oscBell1; 
            break;

        case 'soft_pad':
            mainGain = audioContext.createGain(); 
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.3, now + 0.8);

            filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(1000, now);
            filterNode.Q.setValueAtTime(0.5, now);
            filterNode.connect(mainGain); 

            let sp_oscPad1 = audioContext.createOscillator();
            sp_oscPad1.type = 'sawtooth';
            sp_oscPad1.frequency.setValueAtTime(frequency, now);
            sp_oscPad1.detune.setValueAtTime(-5, now);
            sp_oscPad1.connect(filterNode); 
            sp_oscPad1.start(now);
            activeOscillators[\`\${soundId}_aux1\`] = { oscillator: sp_oscPad1, gainNode: null };

            let sp_oscPad2 = audioContext.createOscillator();
            sp_oscPad2.type = 'sawtooth';
            sp_oscPad2.frequency.setValueAtTime(frequency, now);
            sp_oscPad2.detune.setValueAtTime(5, now);
            sp_oscPad2.connect(filterNode); 
            sp_oscPad2.start(now);
            activeOscillators[\`\${soundId}_aux2\`] = { oscillator: sp_oscPad2, gainNode: null };
            
            mainOsc = sp_oscPad1; 
            break;

        case 'xylophone':
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator(); 
            mainOsc.type = 'sine';
            mainOsc.frequency.setValueAtTime(frequency, now); 
            mainOsc.connect(mainGain);

            modulatorOsc = audioContext.createOscillator(); 
            modulatorOsc.type = 'sine';
            modulatorOsc.frequency.setValueAtTime(frequency * 1.5, now); 

            modulatorGain = audioContext.createGain(); 
            modulatorGain.gain.setValueAtTime(0, now);
            modulatorGain.gain.linearRampToValueAtTime(frequency * 2, now + 0.01); 
            modulatorGain.gain.exponentialRampToValueAtTime(frequency * 0.5, now + 0.1); 
            modulatorGain.gain.exponentialRampToValueAtTime(1, now + 0.3);

            modulatorOsc.connect(modulatorGain);
            modulatorGain.connect(mainOsc.frequency); 

            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.5, now + 0.01); 
            mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); 
            isSelfStopping = true;
            soundNaturalDuration = 0.35;

            mainOsc.start(now);
            modulatorOsc.start(now);
            break;
        
        case 'lead_square':
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator();
            mainOsc.type = 'square';
            filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.Q.setValueAtTime(5, now); 
            mainOsc.connect(filterNode);
            filterNode.connect(mainGain); 

            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.3, now + 0.01); 

            filterNode.frequency.setValueAtTime(100, now); 
            filterNode.frequency.exponentialRampToValueAtTime(3000, now + 0.05); 
            filterNode.frequency.exponentialRampToValueAtTime(800, now + 0.2);   
            
            mainOsc.frequency.setValueAtTime(frequency, now);
            mainOsc.start(now);
            break;

        case 'organ':
            mainGain = audioContext.createGain();
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.2, now + 0.01); 

            const organHarmonics = [1, 2, 3, 4, 6]; 
            const organGains = [1, 0.6, 0.4, 0.3, 0.2];
            
            organHarmonics.forEach((harmonic, index) => {
                let osc = audioContext.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(frequency * harmonic, now);
                let gain = audioContext.createGain();
                gain.gain.setValueAtTime(organGains[index], now);
                osc.connect(gain);
                gain.connect(mainGain); 
                osc.start(now);
                activeOscillators[\`\${soundId}_harm\${index}\`] = { oscillator: osc, gainNode: gain };
                if (index === 0) mainOsc = osc; 
            });
            break;

        case 'kick_drum': 
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator();
            mainOsc.type = 'sine';
            
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.8, now + 0.005); 
            mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); 
            isSelfStopping = true;
            soundNaturalDuration = 0.2;

            mainOsc.frequency.setValueAtTime(150, now); 
            mainOsc.frequency.exponentialRampToValueAtTime(50, now + 0.05); 
            mainOsc.connect(mainGain);
            mainOsc.start(now);
            break;
        
        case 'hi_hat_noise':
            mainGain = audioContext.createGain();
            const bufferSize = audioContext.sampleRate * 0.1; 
            const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1; 
            }
            noiseSource = audioContext.createBufferSource();
            noiseSource.buffer = noiseBuffer;

            filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'highpass';
            filterNode.frequency.setValueAtTime(7000, now); 
            noiseSource.connect(filterNode);
            filterNode.connect(mainGain); 

            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.3, now + 0.002); 
            mainGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05); 
            isSelfStopping = true;
            soundNaturalDuration = 0.05;
            noiseSource.start(now);
            mainOsc = null; 
            break;

        case 'synth_snare':
            mainGain = audioContext.createGain();
            mainGain.gain.setValueAtTime(0, now);

            const noiseBufferSize = audioContext.sampleRate * 0.2;
            const snareNoiseBuffer = audioContext.createBuffer(1, noiseBufferSize, audioContext.sampleRate);
            const noiseOutput = snareNoiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseBufferSize; i++) {
                noiseOutput[i] = Math.random() * 2 - 1;
            }
            const snareNoiseSource = audioContext.createBufferSource();
            snareNoiseSource.buffer = snareNoiseBuffer;

            const noiseFilter = audioContext.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(3000, now);
            noiseFilter.Q.setValueAtTime(1, now);

            const noiseGain = audioContext.createGain();
            noiseGain.gain.setValueAtTime(0, now);
            noiseGain.gain.linearRampToValueAtTime(0.5, now + 0.005);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

            snareNoiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(mainGain);
            snareNoiseSource.start(now);
            activeOscillators[\`\${soundId}_noise\`] = { oscillator: snareNoiseSource, gainNode: noiseGain, filterNode: noiseFilter };

            const bodyOsc = audioContext.createOscillator();
            bodyOsc.type = 'triangle';
            const bodyFreq = (frequency && frequency > 50 && frequency < 800) ? frequency : 200;
            bodyOsc.frequency.setValueAtTime(bodyFreq, now);
            bodyOsc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.6, now + 0.08);

            const bodyGain = audioContext.createGain();
            bodyGain.gain.setValueAtTime(0, now);
            bodyGain.gain.linearRampToValueAtTime(0.6, now + 0.01);
            bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

            bodyOsc.connect(bodyGain);
            bodyGain.connect(mainGain);
            bodyOsc.start(now);
            mainOsc = bodyOsc;
            activeOscillators[\`\${soundId}_body\`] = { oscillator: bodyOsc, gainNode: bodyGain };

            mainGain.gain.setValueAtTime(0.0, now);
            mainGain.gain.linearRampToValueAtTime(0.7, now + 0.01);
            mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            
            isSelfStopping = true;
            soundNaturalDuration = 0.2;
            break;

        case 'synth':
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator();
            mainOsc.type = 'sawtooth'; 
            
            filterNode = audioContext.createBiquadFilter(); 
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(frequency * 3, now); 
            filterNode.Q.setValueAtTime(0.8, now);

            lfo = audioContext.createOscillator(); 
            lfo.type = 'square';
            lfo.frequency.setValueAtTime(8, now); 
            lfoGain = audioContext.createGain();
            lfoGain.gain.setValueAtTime(8, now); 
            lfo.connect(lfoGain);
            lfoGain.connect(mainOsc.detune); 

            mainOsc.connect(filterNode);
            filterNode.connect(mainGain); 

            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.4, now + 0.05); 

            mainOsc.frequency.setValueAtTime(frequency, now);
            mainOsc.start(now);
            lfo.start(now);
            break;

        case 'sine':
        default:
            mainGain = audioContext.createGain();
            mainOsc = audioContext.createOscillator();
            mainOsc.type = 'sine';
            mainOsc.connect(mainGain);
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(0.3, now + 0.02); 
            mainOsc.frequency.setValueAtTime(frequency, now);
            mainOsc.start(now);
            break;
    }
    return { mainOsc, mainGain, filterNode, modulatorOsc, modulatorGain, noiseSource, lfo, lfoGain, isSelfStopping, soundNaturalDuration };
    `;
}