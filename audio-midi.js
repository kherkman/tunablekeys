// audio-midi.js

// --- Audio Context and Core Playback Variables ---
let audioContext;
let keysMasterGain, sequencerMasterGain;
let analyserNode, waveformCanvas, waveformCtx, waveformDataArray, waveformAnimationId;
const activeOscillators = {};

// --- MIDI Variables ---
let midiAccess = null;
let midiInSelect, midiOutSelect, midiInToggleButton, midiOutToggleButton, modWheelSelect;
let isMidiInActive = false, isMidiOutActive = false;
let selectedMidiInput = null, selectedMidiOutput = null;
let modWheelTarget = 'none';
const PITCH_BEND_RANGE_SEMITONES = 2;


async function loadPianoSamples() {
    if (!audioContext) return;
    // The global 'pianoSamples' array from sound-definitions.js is populated here.
    pianoSamples = []; 
    for (const pianoFile of PIANO_WAV_FILES) {
        try {
            const response = await fetch(PIANO_SAMPLES_PATH + pianoFile);
            if (!response.ok) {
                console.warn(`Could not fetch piano sample: ${pianoFile}. Status: ${response.status}.`);
                continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await new Promise((resolve, reject) => {
                audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            });
            pianoSamples.push(buffer);
            console.log(`Piano sample ${pianoFile} loaded successfully.`);
        } catch (error) {
            console.error(`Error loading or decoding piano sample ${pianoFile}:`, error);
        }
    }
    if (pianoSamples.length === 0) {
        console.error("No piano samples could be loaded. The 'Piano Wav' sound will not work.");
    }
}

async function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        keysMasterGain = audioContext.createGain();
        sequencerMasterGain = audioContext.createGain();
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        waveformDataArray = new Uint8Array(analyserNode.frequencyBinCount);
        keysMasterGain.connect(analyserNode);
        sequencerMasterGain.connect(analyserNode);
        analyserNode.connect(audioContext.destination); 
        waveformCanvas = document.getElementById('waveform-canvas');
        if (waveformCanvas) waveformCtx = waveformCanvas.getContext('2d');
        intervalDisplayLineContainer = document.getElementById('interval-display-line-container');

        await loadDrumSamples(); 
        await loadPianoSamples();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function playSound(frequencyObject, soundId, source = 'key', noteOnDuration = null, forcedSoundType = null) {
    if (!audioContext || frequencyObject === null) return;
    const finalFrequency = frequencyObject.finalFreq;
    const baseFrequency = frequencyObject.baseFreq;

    if (activeOscillators[soundId]) stopSound(soundId, 0.01);

    const now = audioContext.currentTime;
    const masterGainNodeToUse = (source === 'sequencer' || source === 'sequencer_drum_synth') ? sequencerMasterGain : keysMasterGain;
    const soundTypeToUse = forcedSoundType || 
                         ((source === 'sequencer') ? currentSoundTypeSeq : currentSoundTypeKeys);
    
    let soundElements;
    try {
        // The external script expects pianoSamples and pianoSampleIndex to be available globally.
        soundElements = currentSoundGenerator(
            soundTypeToUse, finalFrequency, now, audioContext, masterGainNodeToUse, soundId, activeOscillators
        );
    } catch (e) {
        console.error(`Error generating sound '${soundTypeToUse}':`, e);
        const fallbackGain = audioContext.createGain();
        const fallbackOsc = audioContext.createOscillator();
        fallbackOsc.type = 'sine';
        if (finalFrequency !== null) fallbackOsc.frequency.setValueAtTime(finalFrequency, now);
        else fallbackOsc.frequency.setValueAtTime(440, now); 
        fallbackOsc.connect(fallbackGain);
        fallbackGain.gain.setValueAtTime(0, now);
        fallbackGain.gain.linearRampToValueAtTime(0.3, now + 0.02);
        fallbackOsc.start(now);
        soundElements = { 
            mainOsc: fallbackOsc, mainGain: fallbackGain, 
            isSelfStopping: false, soundNaturalDuration: 0.1 
        };
        alert(`Error in sound definition for '${soundTypeToUse}'. Playing a default sine wave. Check console for details.`);
    }

    let { mainOsc, mainGain, filterNode, modulatorOsc, modulatorGain, noiseSource, lfo, lfoGain, isSelfStopping, soundNaturalDuration } = soundElements;

    if (!mainGain) { 
        console.error(`Sound '${soundTypeToUse}' definition did not create/return 'mainGain'. Cannot play sound.`);
        return;
    }
    mainGain.connect(masterGainNodeToUse); 
    
    activeOscillators[soundId] = { 
        oscillator: mainOsc, gainNode: mainGain, filterNode: filterNode, source: source, 
        isSequencerNote: (noteOnDuration !== null), soundTypeUsed: soundTypeToUse, 
        modulatorOsc: modulatorOsc, modulatorGain: modulatorGain, noiseSource: noiseSource,
        lfo: lfo, lfoGain: lfoGain, baseFrequency: baseFrequency
    };

    if (isMidiOutActive && selectedMidiOutput && (source.startsWith('key') || source.startsWith('keyboard_key'))) {
        const soundObject = activeOscillators[soundId];
        if (soundObject && finalFrequency) {
            const keyIndexMatch = soundId.match(/\d+$/);
            if (keyIndexMatch) {
                const keyIndex = parseInt(keyIndexMatch[0], 10);
                const midiChannel = keyIndex % 16;
                
                const midiNoteValue = 69 + 12 * Math.log2(finalFrequency / 440.0);
                const closestMidiNote = Math.max(0, Math.min(127, Math.round(midiNoteValue)));
                const deviationSemitones = midiNoteValue - closestMidiNote;
                let pitchBendActual = 8192;
                if (Math.abs(deviationSemitones) > 0.001) {
                    const pitchBendUnits = (deviationSemitones / PITCH_BEND_RANGE_SEMITONES) * 8191;
                    pitchBendActual = Math.max(0, Math.min(16383, Math.round(8192 + pitchBendUnits)));
                }
                const pitchBendLSB = pitchBendActual & 0x7F;
                const pitchBendMSB = (pitchBendActual >> 7) & 0x7F;

                soundObject.midiNote = closestMidiNote;
                soundObject.midiChannel = midiChannel;

                selectedMidiOutput.send([0xE0 | midiChannel, pitchBendLSB, pitchBendMSB]);
                selectedMidiOutput.send([0x90 | midiChannel, closestMidiNote, 100]);
            }
        }
    }


    const isSynthDrum = source === 'sequencer_drum_synth';

    if (noteOnDuration !== null) { 
        let stopTime = now + noteOnDuration;
        if (isSelfStopping) {
            stopTime = now + Math.min(noteOnDuration, soundNaturalDuration);
            if (mainOsc) mainOsc.stop(stopTime + 0.01);
            if (modulatorOsc) modulatorOsc.stop(stopTime + 0.01);
            if (noiseSource) try {noiseSource.stop(stopTime + 0.01);} catch(e){}
            if (lfo) lfo.stop(stopTime + 0.01);
            if(soundTypeToUse === 'bell' || soundTypeToUse === 'organ' || soundTypeToUse === 'soft_pad' || soundTypeToUse === 'synth_snare') { 
                for (const key in activeOscillators) {
                    if (key.startsWith(`${soundId}_aux`) || key.startsWith(`${soundId}_harm`) || key.startsWith(`${soundId}_noise`) || key.startsWith(`${soundId}_body`)) {
                        if(activeOscillators[key] && activeOscillators[key].oscillator) activeOscillators[key].oscillator.stop(stopTime + 0.01);
                    }
                }
            }

        } else if (soundTypeToUse === 'pluck_saw' || soundTypeToUse === 'synth' || soundTypeToUse === 'soft_pad' || isSynthDrum) { 
            const releaseStartTime = now + noteOnDuration;
            mainGain.gain.cancelScheduledValues(releaseStartTime); 
            mainGain.gain.setValueAtTime(mainGain.gain.value, releaseStartTime); 
            let releaseDuration = 0.3;
            if (soundTypeToUse === 'pluck_saw' && !isSynthDrum) releaseDuration = 0.5; 
            else if (soundTypeToUse === 'soft_pad') releaseDuration = 0.8;
            else if (isSynthDrum && (soundTypeToUse === 'pluck_saw' || soundTypeToUse === 'kick_drum' || soundTypeToUse === 'hi_hat_noise' || soundTypeToUse === 'synth_snare')) {
                releaseDuration = Math.min(soundNaturalDuration || 0.15, noteOnDuration); 
                stopTime = now + releaseDuration; 
            }

            mainGain.gain.exponentialRampToValueAtTime(0.0001, releaseStartTime + releaseDuration); 
            if (mainOsc) mainOsc.stop(releaseStartTime + releaseDuration + 0.01);
            if (lfo) lfo.stop(releaseStartTime + releaseDuration + 0.01); 
             if(soundTypeToUse === 'soft_pad' || soundTypeToUse === 'synth_snare') { 
                for (const key in activeOscillators) {
                    if (key.startsWith(`${soundId}_aux`) || key.startsWith(`${soundId}_noise`) || key.startsWith(`${soundId}_body`)) {
                        if(activeOscillators[key] && activeOscillators[key].oscillator) activeOscillators[key].oscillator.stop(releaseStartTime + releaseDuration + 0.01); 
                    }
                }
            }
            if(!isSynthDrum || !(soundTypeToUse === 'pluck_saw' || soundTypeToUse === 'kick_drum' || soundTypeToUse === 'hi_hat_noise' || soundTypeToUse === 'synth_snare')) {
               stopTime = releaseStartTime + releaseDuration; 
            }
        } else { 
            let sustainValue = 0.3; 
            if (soundTypeToUse === 'warm_saw') sustainValue = 0.4;
            else if (soundTypeToUse === 'lead_square') sustainValue = 0.3;
            else if (soundTypeToUse === 'organ') sustainValue = 0.2;
            
            const currentGain = mainGain.gain.value; 
            mainGain.gain.cancelScheduledValues(now + noteOnDuration - 0.05); 
            mainGain.gain.setValueAtTime(currentGain > 0.001 ? currentGain : sustainValue, now + noteOnDuration - 0.05);

            mainGain.gain.linearRampToValueAtTime(0.0001, stopTime);
            if (mainOsc) mainOsc.stop(stopTime + 0.01);
            if (lfo) lfo.stop(stopTime + 0.01); 
        }
        
        setTimeout(() => {
            for (const key in activeOscillators) {
                if (key.startsWith(`${soundId}_`)) { 
                     if (activeOscillators[key] && activeOscillators[key].oscillator === (activeOscillators[soundId] ? activeOscillators[soundId].oscillator : null) || key !== soundId) { 
                        delete activeOscillators[key];
                    }
                }
            }
            if (activeOscillators[soundId]) delete activeOscillators[soundId]; 
            checkWaveformDrawingState();
        }, (stopTime - now + 0.05) * 1000); 

    } else if (isSelfStopping) { 
         if (mainOsc) mainOsc.stop(now + soundNaturalDuration + 0.01);
         if (modulatorOsc) modulatorOsc.stop(now + soundNaturalDuration + 0.01);
         if (noiseSource) try {noiseSource.stop(now + soundNaturalDuration + 0.01);} catch(e){}
         if (lfo) lfo.stop(now + soundNaturalDuration + 0.01);
          if(soundTypeToUse === 'bell' || soundTypeToUse === 'organ' || soundTypeToUse === 'soft_pad' || soundTypeToUse === 'synth_snare') {
                for (const key in activeOscillators) {
                    if (key.startsWith(`${soundId}_aux`) || key.startsWith(`${soundId}_harm`) || key.startsWith(`${soundId}_noise`) || key.startsWith(`${soundId}_body`)) {
                        if(activeOscillators[key] && activeOscillators[key].oscillator) activeOscillators[key].oscillator.stop(now + soundNaturalDuration + 0.01);
                    }
                }
            }
         setTimeout(() => {
            for (const key in activeOscillators) {
                if (key.startsWith(`${soundId}_`)) {
                     if (activeOscillators[key] && activeOscillators[key].oscillator === (activeOscillators[soundId] ? activeOscillators[soundId].oscillator : null) || key !== soundId) {
                        delete activeOscillators[key];
                    }
                }
            }
            if (activeOscillators[soundId]) delete activeOscillators[soundId];
            checkWaveformDrawingState();
        }, (soundNaturalDuration + 0.05) * 1000);
    }
    checkWaveformDrawingState();
}

function stopSound(soundId, releaseTime = 0.15) {
    const soundObject = activeOscillators[soundId];
    if (soundObject) {
        if (isMidiOutActive && selectedMidiOutput && soundObject.midiNote !== undefined) {
            selectedMidiOutput.send([0x80 | soundObject.midiChannel, soundObject.midiNote, 0]); 
        }

        if (soundObject.bufferSourceNode) {
            try { soundObject.bufferSourceNode.stop(audioContext.currentTime + 0.01); } catch (e) { }
            delete activeOscillators[soundId];
            checkWaveformDrawingState();
            return;
        }

        const { oscillator, gainNode, filterNode, modulatorOsc, modulatorGain, noiseSource, lfo, lfoGain, isSequencerNote, soundTypeUsed } = soundObject;
        const now = audioContext.currentTime;

        for (const key in activeOscillators) {
            if (key.startsWith(`${soundId}_`) && key !== soundId) { 
                if (activeOscillators[key] && activeOscillators[key].oscillator) {
                    try { activeOscillators[key].oscillator.stop(now + 0.02); } catch(e) {}
                }
                delete activeOscillators[key];
            }
        }
        
        if (gainNode) {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        }

        let actualReleaseTime = releaseTime;
         if (isSequencerNote || 
             (soundTypeUsed === 'pluck_triangle' && !isSequencerNote) || 
             soundTypeUsed === 'kick_drum' || 
             soundTypeUsed === 'hi_hat_noise' || 
             soundTypeUsed === 'bell' || 
             soundTypeUsed === 'xylophone' ||
             soundTypeUsed === 'synth_snare' ||
             soundTypeUsed === 'piano_wav' 
            ) { 
            if (gainNode) gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.01);
            actualReleaseTime = 0.01; 
        } else if (soundTypeUsed === 'pluck_saw' || soundTypeUsed === 'synth' || soundTypeUsed === 'soft_pad') {
             if (soundTypeUsed === 'pluck_saw') actualReleaseTime = 0.5;
             else if (soundTypeUsed === 'synth') actualReleaseTime = 0.3;
             else if (soundTypeUsed === 'soft_pad') actualReleaseTime = 0.8; 
             if (gainNode) gainNode.gain.exponentialRampToValueAtTime(0.0001, now + actualReleaseTime);
        } else { 
            if (gainNode) gainNode.gain.linearRampToValueAtTime(0.0001, now + actualReleaseTime);
        }

        if (oscillator) try { oscillator.stop(now + actualReleaseTime + 0.01); } catch(e){}
        if (modulatorOsc) try { modulatorOsc.stop(now + actualReleaseTime + 0.01); } catch(e){}
        if (noiseSource) try { noiseSource.stop(now + actualReleaseTime + 0.01); } catch(e){} 
        if (lfo) try { lfo.stop(now + actualReleaseTime + 0.01); } catch(e){}
        
        delete activeOscillators[soundId];
        checkWaveformDrawingState();
    }
}

function checkWaveformDrawingState() {
    const anySoundPlaying = Object.keys(activeOscillators).length > 0;
    if (anySoundPlaying && !waveformAnimationId) { drawWaveform(); } 
    else if (!anySoundPlaying && waveformAnimationId) { cancelAnimationFrame(waveformAnimationId); waveformAnimationId = null;
        setTimeout(() => { if (waveformCtx && Object.keys(activeOscillators).length === 0) { waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height); }}, 200);
    }
}

function drawWaveform() {
    if (!analyserNode || !waveformCtx || !waveformDataArray) return;
    waveformAnimationId = requestAnimationFrame(drawWaveform);
    analyserNode.getByteTimeDomainData(waveformDataArray);
    waveformCtx.fillStyle = '#22303f'; waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformCtx.lineWidth = 2; waveformCtx.strokeStyle = '#e67e22'; waveformCtx.beginPath();
    const sliceWidth = waveformCanvas.width * 1.0 / waveformDataArray.length; let x = 0;
    for (let i = 0; i < waveformDataArray.length; i++) { const v = waveformDataArray[i] / 128.0; const y = v * waveformCanvas.height / 2;
        if (i === 0) waveformCtx.moveTo(x, y); else waveformCtx.lineTo(x, y); x += sliceWidth; }
    waveformCtx.lineTo(waveformCanvas.width, waveformCanvas.height / 2); waveformCtx.stroke();
}

function setupGlobalAudioControls() {
    keysVolumeSlider = document.getElementById('keys-volume-slider'); sequencerVolumeSlider = document.getElementById('sequencer-volume-slider');
    soundTypeKeysSelect = document.getElementById('sound-type-keys-select'); soundTypeSeqSelect = document.getElementById('sound-type-seq-select');
    
    exportSoundDefsBtn = document.getElementById('export-sound-definitions-btn');
    importSoundDefsInput = document.getElementById('import-sound-definitions-input');
    importSoundDefsBtn = document.getElementById('import-sound-definitions-btn');

    if(keysVolumeSlider) { keysVolumeSlider.addEventListener('input', (e) => { if (keysMasterGain) keysMasterGain.gain.value = parseFloat(e.target.value); });
        if(keysMasterGain) keysMasterGain.gain.value = parseFloat(keysVolumeSlider.value); }
    if(sequencerVolumeSlider) { sequencerVolumeSlider.addEventListener('input', (e) => { if (sequencerMasterGain) sequencerMasterGain.gain.value = parseFloat(e.target.value); });
        if(sequencerMasterGain) sequencerMasterGain.gain.value = parseFloat(sequencerVolumeSlider.value); }
    
    if(soundTypeKeysSelect) { soundTypeKeysSelect.addEventListener('change', (e) => currentSoundTypeKeys = e.target.value ); }
    if(soundTypeSeqSelect) { soundTypeSeqSelect.addEventListener('change', (e) => currentSoundTypeSeq = e.target.value ); }
    
    if(exportSoundDefsBtn) exportSoundDefsBtn.addEventListener('click', exportSoundDefinitions);
    if(importSoundDefsBtn) importSoundDefsBtn.addEventListener('click', () => importSoundDefsInput.click());
    if(importSoundDefsInput) importSoundDefsInput.addEventListener('change', loadSoundDefinitions);

    const initialSoundNames = extractSoundNames(soundDefinitionFunctionBody);
    updateSoundSelectors(initialSoundNames);

    // Set default sounds after populating the lists
    if (soundTypeKeysSelect && initialSoundNames.includes('piano_wav')) {
        soundTypeKeysSelect.value = 'piano_wav';
    }
    currentSoundTypeKeys = soundTypeKeysSelect.value;
    currentSoundTypeSeq = soundTypeSeqSelect.value;
}

function audioBufferToBase64(buffer) {
    if (!buffer) return null;
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const channelData = buffer.getChannelData(i);
        const uint8Array = new Uint8Array(channelData.buffer);
        let binary = '';
        for (let j = 0; j < uint8Array.length; j++) {
            binary += String.fromCharCode(uint8Array[j]);
        }
        channels.push(window.btoa(binary));
    }
    return {
        sampleRate: buffer.sampleRate,
        length: buffer.length,
        numberOfChannels: buffer.numberOfChannels,
        channels: channels
    };
}

async function base64ToAudioBuffer(data) {
    if (!data || !audioContext) return null;
    const { sampleRate, length, numberOfChannels, channels } = data;
    const newBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

    for (let i = 0; i < numberOfChannels; i++) {
        const binary = window.atob(channels[i]);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let j = 0; j < len; j++) {
            bytes[j] = binary.charCodeAt(j);
        }
        const float32Array = new Float32Array(bytes.buffer);
        newBuffer.copyToChannel(float32Array, i);
    }
    return newBuffer;
}

function setupMIDI() {
    midiInSelect = document.getElementById('midi-in-select');
    midiOutSelect = document.getElementById('midi-out-select');
    midiInToggleButton = document.getElementById('midi-in-toggle-btn');
    midiOutToggleButton = document.getElementById('midi-out-toggle-btn');
    modWheelSelect = document.getElementById('midi-mod-wheel-select');

    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess({ sysex: false })
            .then(onMIDISuccess, onMIDIFailure);
    } else {
        console.warn("WebMIDI is not supported in this browser.");
        midiInToggleButton.disabled = true;
        midiOutToggleButton.disabled = true;
        midiInSelect.disabled = true;
        midiOutSelect.disabled = true;
    }

    midiInToggleButton.addEventListener('click', toggleMidiIn);
    midiOutToggleButton.addEventListener('click', toggleMidiOut);
    midiInSelect.addEventListener('change', setMidiInput);
    midiOutSelect.addEventListener('change', setMidiOutput);
    modWheelSelect.addEventListener('change', (e) => {
        modWheelTarget = e.target.value;
    });
}

function onMIDISuccess(m) {
    midiAccess = m;
    updateMidiDeviceLists();
    midiAccess.onmidistatechange = updateMidiDeviceLists;
}

function onMIDIFailure(msg) {
    console.error(`Failed to get MIDI access - ${msg}`);
    alert(`Failed to get MIDI access. Please ensure your browser has permissions.`);
}

function updateMidiDeviceLists() {
    if (!midiAccess) return;
    midiInSelect.innerHTML = '';
    if (midiAccess.inputs.size > 0) {
        midiAccess.inputs.forEach(input => {
            const option = document.createElement('option');
            option.value = input.id;
            option.textContent = input.name;
            midiInSelect.appendChild(option);
        });
    } else {
        midiInSelect.innerHTML = '<option value="">(No devices)</option>';
    }
    setMidiInput();

    midiOutSelect.innerHTML = '';
    if (midiAccess.outputs.size > 0) {
        midiAccess.outputs.forEach(output => {
            const option = document.createElement('option');
            option.value = output.id;
            option.textContent = output.name;
            midiOutSelect.appendChild(option);
        });
    } else {
        midiOutSelect.innerHTML = '<option value="">(No devices)</option>';
    }
    setMidiOutput();
}

function setMidiInput() {
    if (selectedMidiInput) {
        selectedMidiInput.onmidimessage = null;
    }
    const selectedId = midiInSelect.value;
    selectedMidiInput = midiAccess.inputs.get(selectedId);
    if (selectedMidiInput && isMidiInActive) {
        selectedMidiInput.onmidimessage = handleMidiMessage;
    }
}

function setMidiOutput() {
    const selectedId = midiOutSelect.value;
    selectedMidiOutput = midiAccess.outputs.get(selectedId);
}

function toggleMidiIn() {
    isMidiInActive = !isMidiInActive;
    midiInToggleButton.textContent = isMidiInActive ? "On" : "Off";
    midiInToggleButton.classList.toggle('active', isMidiInActive);
    setMidiInput(); 
}

function toggleMidiOut() {
    isMidiOutActive = !isMidiOutActive;
    midiOutToggleButton.textContent = isMidiOutActive ? "On" : "Off";
    midiOutToggleButton.classList.toggle('active', isMidiOutActive);
}

async function handleMidiMessage(event) {
    const command = event.data[0] & 0xF0;
    const note = event.data[1];
    const velocity = event.data[2];
    
    // --- UPDATED LOGIC ---
    // Find the key index that is mapped to the incoming MIDI note.
    // Each key object in keysData can have a user-defined 'midiNote' property.
    const keyIndex = keysData.findIndex(key => key && key.midiNote === note);

    if (command === 0x90 && velocity > 0) { // Note On
        // If a key is mapped to this note...
        if (keyIndex > -1) {
            const targetKeyElement = document.querySelector(`.piano-key[data-key-index="${keyIndex}"]`);
            const soundId = `keyboard_key_${keyIndex}`;
            
            if (!activeKeyboardNotes[keyIndex]) {
                activeKeyboardNotes[keyIndex] = true;
                if (targetKeyElement) {
                    await initAudioContext();
                    const freqObject = getFrequencyForKey(keyIndex);
                    if (freqObject !== null) {
                        playSound(freqObject, soundId, 'key');
                        targetKeyElement.classList.add('keyboard-playing');
                    }
                }
            }
        }
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) { // Note Off
        // If a key is mapped to this note...
         if (keyIndex > -1) {
             const soundId = `keyboard_key_${keyIndex}`;
             if (activeKeyboardNotes[keyIndex]) {
                activeKeyboardNotes[keyIndex] = false;
                stopSound(soundId);
                const targetKeyElement = document.querySelector(`.piano-key[data-key-index="${keyIndex}"]`);
                if (targetKeyElement) {
                    targetKeyElement.classList.remove('keyboard-playing');
                }
            }
        }
    } else if (command === 0xE0) { // Pitch Bend
        const pitchBendValue = (event.data[2] << 7) | event.data[1];
        const normalizedBend = (pitchBendValue - 8192) / 8192;
        globalPitchShiftSemitones = normalizedBend * PITCH_BEND_RANGE_SEMITONES;
        updatePitchShiftUI();
        updateAllActiveNotePitches();
    } else if (command === 0xB0) { // Control Change
        const ccNumber = event.data[1];
        const ccValue = event.data[2];
        if (ccNumber === 1) { // Mod Wheel (CC #1)
            handleModWheel(ccValue);
        }
    }
}

function handleModWheel(value) { // value is 0-127
    const normalizedValue = value / 127.0;

    switch(modWheelTarget) {
        case 'keys_vol':
            if (keysMasterGain) keysMasterGain.gain.setTargetAtTime(normalizedValue, audioContext.currentTime, 0.01);
            if (keysVolumeSlider) keysVolumeSlider.value = normalizedValue;
            break;
        case 'seq_vol':
            if (sequencerMasterGain) sequencerMasterGain.gain.setTargetAtTime(normalizedValue, audioContext.currentTime, 0.01);
            if (sequencerVolumeSlider) sequencerVolumeSlider.value = normalizedValue;
            break;
        case 'tempo':
            const minTempo = parseFloat(seqTempoSlider.min) || 30;
            const maxTempo = parseFloat(seqTempoSlider.max) || 280;
            const newTempo = minTempo + normalizedValue * (maxTempo - minTempo);
            updateSequencerTempo(Math.round(newTempo));
            if (seqTempoSlider) seqTempoSlider.value = Math.round(newTempo);
            if (seqTempoInput) seqTempoInput.value = Math.round(newTempo);
            break;
        case 'pitch':
            const minPitch = parseFloat(pitchShiftSlider.min) || -2;
            const maxPitch = parseFloat(pitchShiftSlider.max) || 2;
            globalPitchShiftSemitones = minPitch + normalizedValue * (maxPitch - minPitch);
            updatePitchShiftUI();
            updateAllActiveNotePitches();
            break;
        case 'none':
        default:
            return;
    }
}

function muteAll() {
    Object.keys(activeOscillators).forEach(id => stopSound(id, 0.01));
    if (isArpeggioActive) stopArpLoop();
    stopActiveChordSounds();
    document.querySelectorAll('.piano-key.playing, .piano-key.keyboard-playing, .piano-key.chord-playing').forEach(k => {
        k.classList.remove('playing', 'keyboard-playing', 'chord-playing');
    });
}

function updateAllActiveNotePitches() {
    const now = audioContext.currentTime;
    const pitchShiftFactor = Math.pow(2, globalPitchShiftSemitones / 12);
    for (const soundId in activeOscillators) {
        const soundObject = activeOscillators[soundId];
        if (soundObject && soundObject.baseFrequency && soundObject.oscillator) {
            const newFreq = soundObject.baseFrequency * pitchShiftFactor;
            if(soundObject.oscillator.frequency) { // standard oscillator
                soundObject.oscillator.frequency.cancelScheduledValues(now);
                soundObject.oscillator.frequency.linearRampToValueAtTime(newFreq, now + 0.01);
            } else if (soundObject.oscillator.playbackRate) { // sample source
                const baseSampleFreq = 220.0;
                const newPlaybackRate = newFreq / baseSampleFreq;
                soundObject.oscillator.playbackRate.cancelScheduledValues(now);
                soundObject.oscillator.playbackRate.linearRampToValueAtTime(newPlaybackRate, now + 0.01);
            }
        }
    }
}