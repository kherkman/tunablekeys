// This file contains all JavaScript functions related to the Sequencer & Drums.
// It relies on global variables and functions defined in the main index.html script.

async function loadDrumSamples() {
    if (!audioContext) return;
    for (let i = 0; i < NUM_DRUM_ROWS; i++) {
        const drumName = DRUM_ROW_NAMES[i];
        const wavFile = DRUM_WAV_FILES[i];
        try {
            const response = await fetch(DRUM_SAMPLES_PATH + wavFile);
            if (!response.ok) {
                console.warn(`Could not fetch ${wavFile}. Status: ${response.status}. Using synth fallback for ${drumName}.`);
                drumSamples[drumName] = null;
                continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await new Promise((resolve, reject) => {
                audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            });
            drumSamples[drumName] = buffer;
            console.log(`${wavFile} loaded successfully for ${drumName}.`);
        } catch (error) {
            console.error(`Error loading or decoding ${wavFile} for ${drumName}:`, error, `. Using synth fallback.`);
            drumSamples[drumName] = null;
        }
    }
}

function createSequencerGrid() {
    sequencerGridDiv = document.getElementById('sequencer-grid'); 
    if (!sequencerGridDiv) return;
    sequencerGridDiv.innerHTML = ''; 

    for (let r_drum = 0; r_drum < NUM_DRUM_ROWS; r_drum++) {
        const actualRowIndex = r_drum; 
        const drumName = DRUM_ROW_NAMES[r_drum];

        const rowWrapperDiv = document.createElement('div'); 
        rowWrapperDiv.classList.add('sequencer-row-wrapper');
        
        const drumControlCell = document.createElement('div');
        drumControlCell.classList.add('seq-drum-control-cell');

        const drumLabel = document.createElement('div');
        drumLabel.classList.add('seq-row-label');
        drumLabel.textContent = drumName;
        drumLabel.title = `Click to play ${drumName}`;
        drumLabel.addEventListener('click', async () => {
            await initAudioContext();
            const drumSoundId = `manual_play_${drumName}_${Date.now()}`;
            if (drumSamples[drumName]) {
                const sourceNode = audioContext.createBufferSource();
                sourceNode.buffer = drumSamples[drumName];
                sourceNode.connect(keysMasterGain);
                sourceNode.start(audioContext.currentTime);
                activeOscillators[drumSoundId] = { bufferSourceNode: sourceNode, source: 'key' };
                sourceNode.onended = () => { delete activeOscillators[drumSoundId]; checkWaveformDrawingState(); };
            } else {
                let frequencyForDrumFallback = 100;
                if (drumName === 'Kick') frequencyForDrumFallback = 60;
                else if (drumName === 'Snare') frequencyForDrumFallback = 200;
                else if (drumName === 'Hi-Hat') frequencyForDrumFallback = 8000;
                playSound({ finalFreq: frequencyForDrumFallback, baseFreq: frequencyForDrumFallback }, drumSoundId, 'key', 0.2, DRUM_FALLBACK_SYNTHS[r_drum]);
            }
        });

        drumControlCell.appendChild(drumLabel);

        const loadSampleBtn = document.createElement('button');
        loadSampleBtn.textContent = 'Load .wav';
        loadSampleBtn.classList.add('control-button');
        loadSampleBtn.style.fontSize = '0.65em';
        loadSampleBtn.style.padding = '2px 4px';
        loadSampleBtn.dataset.drumIndex = r_drum;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.wav,audio/wav';
        fileInput.style.display = 'none';
        fileInput.dataset.drumIndex = r_drum;

        loadSampleBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (event) => {
            loadCustomDrumSample(event, r_drum);
        });

        drumControlCell.appendChild(loadSampleBtn);
        drumControlCell.appendChild(fileInput);
        
        rowWrapperDiv.appendChild(drumControlCell);

        const rowDiv = document.createElement('div'); 
        rowDiv.classList.add('sequencer-row'); 
        rowDiv.dataset.row = actualRowIndex;

        for (let s = 0; s < NUM_SEQ_STEPS; s++) { 
            const stepDiv = document.createElement('div'); 
            stepDiv.classList.add('sequencer-step');
            stepDiv.classList.add(`drum-${drumName.toLowerCase().replace(/\s+/g,'-')}`); 
            stepDiv.dataset.row = actualRowIndex; 
            stepDiv.dataset.step = s; 
            stepDiv.addEventListener('click', () => toggleSequencerStep(actualRowIndex, s));
            if (sequencerData[actualRowIndex] && sequencerData[actualRowIndex][s]) {
                stepDiv.classList.add('active');
            }
            rowDiv.appendChild(stepDiv); 
        }
        rowWrapperDiv.appendChild(rowDiv); 
        sequencerGridDiv.appendChild(rowWrapperDiv);
    }

    for (let r_melodic = 0; r_melodic < NUM_SEQ_MELODIC_ROWS; r_melodic++) {
        const actualRowIndex = NUM_DRUM_ROWS + r_melodic; 

        const rowWrapperDiv = document.createElement('div'); 
        rowWrapperDiv.classList.add('sequencer-row-wrapper');
        
        const keySelect = document.createElement('select'); 
        keySelect.classList.add('seq-row-key-select'); 
        keySelect.dataset.rowIndex = r_melodic; 
        
        let hasAnyKeys = false;
        for (let k = 0; k < NUM_PIANO_KEYS; k++) { 
            if (!keysData[k]) continue;
            hasAnyKeys = true;
            const option = document.createElement('option'); option.value = k;
            const effectiveIntervalForSeqDisp = getEffectiveIntervalString(k);
            option.textContent = `Key ${k+1} (${effectiveIntervalForSeqDisp})`; 
            keySelect.appendChild(option); 
        }
        
        if (!hasAnyKeys) {
            const option = document.createElement('option');
            option.textContent = "N/A"; option.value = "";
            keySelect.appendChild(option);
            keySelect.disabled = true;
            SEQ_ROW_KEY_INDICES[r_melodic] = undefined;
        } else {
            keySelect.disabled = false;
            const currentAssignedKey = SEQ_ROW_KEY_INDICES[r_melodic];
            if (currentAssignedKey !== undefined && keysData[currentAssignedKey]) {
                keySelect.value = currentAssignedKey;
            } else {
                keySelect.selectedIndex = 0;
                SEQ_ROW_KEY_INDICES[r_melodic] = parseInt(keySelect.value, 10);
            }
        }

        keySelect.addEventListener('change', (e) => { 
            const changedMelodicRowIndex = parseInt(e.target.dataset.rowIndex);
            SEQ_ROW_KEY_INDICES[changedMelodicRowIndex] = parseInt(e.target.value); 
        });
        rowWrapperDiv.appendChild(keySelect);

        const rowDiv = document.createElement('div'); 
        rowDiv.classList.add('sequencer-row'); 
        rowDiv.dataset.row = actualRowIndex;
        for (let s = 0; s < NUM_SEQ_STEPS; s++) { 
            const stepDiv = document.createElement('div'); 
            stepDiv.classList.add('sequencer-step'); 
            stepDiv.dataset.row = actualRowIndex; 
            stepDiv.dataset.step = s; 
            stepDiv.addEventListener('click', () => toggleSequencerStep(actualRowIndex, s));
            if (sequencerData[actualRowIndex] && sequencerData[actualRowIndex][s]) {
                stepDiv.classList.add('active');
            } 
            rowDiv.appendChild(stepDiv); 
        }
        rowWrapperDiv.appendChild(rowDiv); 
        sequencerGridDiv.appendChild(rowWrapperDiv);
    }
    updateKeyDisplays(); 
}

async function toggleSequencerStep(row, step) { 
    await initAudioContext(); 
    sequencerData[row][step] = !sequencerData[row][step];
    const stepDiv = sequencerGridDiv.querySelector(`.sequencer-step[data-row="${row}"][data-step="${step}"]`);
    if (stepDiv) stepDiv.classList.toggle('active', sequencerData[row][step]);
}

function updateSequencerTempo(newTempo) { currentSeqTempoBPM = Math.max(20, Math.min(300, parseInt(newTempo, 10)));
    if(seqTempoDisplay) seqTempoDisplay.textContent = `${currentSeqTempoBPM} BPM`; 
    if (isSequencerPlaying) { stopSequencer(); startSequencer(); }
    if (isArpeggioActive && arpLoopIntervalId) { 
        const tempChordType = currentArpChordType;
        stopArpLoop();
        const arpButton = document.querySelector(`.chord-button[data-type="${tempChordType}"]`);
        if(arpButton) {
            playChord(tempChordType); 
        }
    }
}

async function handleTapTempo() { 
    await initAudioContext(); 
    const now = performance.now();
    if (tapTempoCount === 0 || (now - lastTapTime > 2000)) { tapTempoCount = 0; lastTapTime = now; tapTempoCount++; return; }
    const diff = now - lastTapTime; lastTapTime = now; const currentTapBPM = 60000 / diff;
    if (currentTapBPM > 30 && currentTapBPM < 300) { updateSequencerTempo(Math.round(currentTapBPM));
         if (seqTempoSlider) seqTempoSlider.value = currentSeqTempoBPM; if (seqTempoInput) seqTempoInput.value = currentSeqTempoBPM; }
    tapTempoCount++;
}

function handleApplySeqRows() { 
    const newNumMelodicRows = parseInt(numSeqRowsInput.value, 10);
    if (isNaN(newNumMelodicRows) || newNumMelodicRows < 0 || newNumMelodicRows > 13) { 
        alert("Number of melodic rows must be between 0 and 13.");
        numSeqRowsInput.value = NUM_SEQ_MELODIC_ROWS;
        return;
    }
    NUM_SEQ_MELODIC_ROWS = newNumMelodicRows;
    const totalRows = NUM_DRUM_ROWS + NUM_SEQ_MELODIC_ROWS;

    const oldSequencerData = sequencerData;
    sequencerData = Array(totalRows).fill(null).map((_, r) => {
        if (r < oldSequencerData.length && oldSequencerData[r]) {
            const oldRow = oldSequencerData[r];
            const newRow = Array(NUM_SEQ_STEPS).fill(false);
            for (let s = 0; s < Math.min(oldRow.length, NUM_SEQ_STEPS); s++) {
                newRow[s] = oldRow[s] || false;
            }
            return newRow;
        }
        return Array(NUM_SEQ_STEPS).fill(false);
    });

    const oldKeyIndices = [...SEQ_ROW_KEY_INDICES];
    SEQ_ROW_KEY_INDICES = Array(NUM_SEQ_MELODIC_ROWS);
    for (let i = 0; i < NUM_SEQ_MELODIC_ROWS; i++) {
        if (i < oldKeyIndices.length && oldKeyIndices[i] !== undefined && keysData[oldKeyIndices[i]]) {
            SEQ_ROW_KEY_INDICES[i] = oldKeyIndices[i];
        } else {
            // Find the first available key
            const firstValidKeyIndex = keysData.findIndex(k => k !== null);
            SEQ_ROW_KEY_INDICES[i] = (firstValidKeyIndex !== -1) ? firstValidKeyIndex : undefined;
        }
    }
    if (isSequencerPlaying) stopSequencer();
    createSequencerGrid();
}

function handleApplySeqSteps() { 
    const newNumSteps = parseInt(numSeqStepsInput.value, 10);
    if (isNaN(newNumSteps) || newNumSteps < 4 || newNumSteps > 64) { 
        alert("Number of steps must be between 4 and 64."); 
        numSeqStepsInput.value = NUM_SEQ_STEPS; return; 
    }
    const oldNumSteps = NUM_SEQ_STEPS; 
    NUM_SEQ_STEPS = newNumSteps;
    const totalRows = NUM_DRUM_ROWS + NUM_SEQ_MELODIC_ROWS;

    const newSequencerData = Array(totalRows).fill(null).map((_, r) => { 
        const oldRow = sequencerData[r] || []; 
        const newRow = Array(NUM_SEQ_STEPS).fill(false);
        for (let s = 0; s < Math.min(oldNumSteps, NUM_SEQ_STEPS); s++) { 
            newRow[s] = oldRow[s] || false; 
        } 
        return newRow; 
    });
    sequencerData = newSequencerData; 
    if (isSequencerPlaying) stopSequencer(); 
    currentSeqStep = 0; 
    createSequencerGrid(); 
}

function setupSequencerControls() {
    seqPlayStopBtn = document.getElementById('seq-play-stop-btn'); seqTempoSlider = document.getElementById('seq-tempo-slider');
    seqTempoDisplay = document.getElementById('seq-tempo-display'); seqTempoInput = document.getElementById('seq-tempo-input');
    tapTempoBtn = document.getElementById('tap-tempo-btn'); numSeqStepsInput = document.getElementById('num-seq-steps-input');
    applySeqStepsBtn = document.getElementById('apply-seq-steps-btn');
    numSeqRowsInput = document.getElementById('num-seq-rows-input'); 
    applySeqRowsBtn = document.getElementById('apply-seq-rows-btn'); 

    if(seqPlayStopBtn) seqPlayStopBtn.addEventListener('click', async () => { await initAudioContext(); if (isSequencerPlaying) stopSequencer(); else startSequencer(); });
    if(seqTempoSlider) seqTempoSlider.addEventListener('input', (e) => { updateSequencerTempo(e.target.value); if(seqTempoInput) seqTempoInput.value = e.target.value; });
    if(seqTempoInput) seqTempoInput.addEventListener('change', (e) => { updateSequencerTempo(e.target.value); if(seqTempoSlider) seqTempoSlider.value = e.target.value;});
    if(tapTempoBtn) tapTempoBtn.addEventListener('click', handleTapTempo); 
    if(applySeqStepsBtn) applySeqStepsBtn.addEventListener('click', handleApplySeqSteps);
    if(applySeqRowsBtn) applySeqRowsBtn.addEventListener('click', handleApplySeqRows); 

    document.getElementById('save-sequence-btn')?.addEventListener('click', saveSequence);
    const loadSeqInput = document.getElementById('load-sequence-input');
    document.getElementById('load-sequence-btn')?.addEventListener('click', () => loadSeqInput?.click()); 
    loadSeqInput?.addEventListener('change', loadSequence);
    document.getElementById('export-midi-btn')?.addEventListener('click', exportMIDI);
    
    if (numSeqStepsInput) numSeqStepsInput.value = NUM_SEQ_STEPS; 
    if (numSeqRowsInput) numSeqRowsInput.value = NUM_SEQ_MELODIC_ROWS; 
    updateSequencerTempo(currentSeqTempoBPM); 
    if (seqTempoSlider) seqTempoSlider.value = currentSeqTempoBPM; if (seqTempoInput) seqTempoInput.value = currentSeqTempoBPM;
}

async function startSequencer() { 
    await initAudioContext(); 
    if (isSequencerPlaying) return; 
    isSequencerPlaying = true;
    if(seqPlayStopBtn) { seqPlayStopBtn.textContent = "Stop"; seqPlayStopBtn.classList.add('active'); }
    currentSeqStep = -1; 
    const stepDurationMs = (60 / currentSeqTempoBPM) * 1000 / 4; 
    
    function tick() { 
        if(!isSequencerPlaying) return; 
        const prevStepDivs = sequencerGridDiv?.querySelectorAll(`.sequencer-step.current`);
        prevStepDivs?.forEach(div => div.classList.remove('current')); 
        currentSeqStep = (currentSeqStep + 1) % NUM_SEQ_STEPS;
        const currentStepDivs = sequencerGridDiv?.querySelectorAll(`.sequencer-step[data-step="${currentSeqStep}"]`);
        currentStepDivs?.forEach(div => div.classList.add('current'));
        
        const totalRows = NUM_DRUM_ROWS + NUM_SEQ_MELODIC_ROWS;
        for (let dataRowIndex = 0; dataRowIndex < totalRows; dataRowIndex++) { 
            if (sequencerData[dataRowIndex] && sequencerData[dataRowIndex][currentSeqStep]) {
                if (dataRowIndex < NUM_DRUM_ROWS) { 
                    const drumIndex = dataRowIndex;
                    const drumName = DRUM_ROW_NAMES[drumIndex];
                    const drumSoundId = `seq_drum_${drumName}_s${currentSeqStep}`;
                    const noteDurSec = (stepDurationMs / 1000) * 0.95;

                    if (drumSamples[drumName]) { 
                        const sourceNode = audioContext.createBufferSource();
                        sourceNode.buffer = drumSamples[drumName];
                        sourceNode.connect(sequencerMasterGain);
                        sourceNode.start(audioContext.currentTime);
                        activeOscillators[drumSoundId] = { bufferSourceNode: sourceNode, source: 'sequencer_drum_sample' };
                        sourceNode.onended = () => { delete activeOscillators[drumSoundId]; checkWaveformDrawingState(); };
                    } else { 
                        let frequencyForDrumFallback = 100; 
                        if (drumName === 'Kick') frequencyForDrumFallback = 60;
                        else if (drumName === 'Snare') frequencyForDrumFallback = 200;
                        else if (drumName === 'Hi-Hat') frequencyForDrumFallback = 8000; 
                        playSound({ finalFreq: frequencyForDrumFallback, baseFreq: frequencyForDrumFallback }, drumSoundId, 'sequencer_drum_synth', noteDurSec, DRUM_FALLBACK_SYNTHS[drumIndex]);
                    }
                } else { 
                    const melodicRowIndex = dataRowIndex - NUM_DRUM_ROWS;
                    const keyIndexToPlay = SEQ_ROW_KEY_INDICES[melodicRowIndex]; 
                    if (keyIndexToPlay === undefined || keyIndexToPlay === null || keyIndexToPlay < 0 || keyIndexToPlay >= NUM_PIANO_KEYS || !keysData[keyIndexToPlay]) continue; 
                    const freqObject = getFrequencyForKey(keyIndexToPlay); 
                    if (freqObject !== null) { 
                        playSound(freqObject, `seq_r${dataRowIndex}_s${currentSeqStep}`, 'sequencer', (stepDurationMs / 1000) * 0.95); 
                    }
                }
            }
        }
        if (isSequencerPlaying) { seqIntervalId = setTimeout(tick, stepDurationMs); }
    }
    tick(); 
}

function stopSequencer() { if (!isSequencerPlaying) return; isSequencerPlaying = false; clearTimeout(seqIntervalId); seqIntervalId = null;
    if(seqPlayStopBtn) { seqPlayStopBtn.textContent = "Play"; seqPlayStopBtn.classList.remove('active');}
    sequencerGridDiv?.querySelectorAll(`.sequencer-step.current`).forEach(div => div.classList.remove('current'));
    Object.keys(activeOscillators).forEach(id => { 
        if (activeOscillators[id] && (activeOscillators[id].source === 'sequencer' || 
                                      activeOscillators[id].source === 'sequencer_drum_sample' ||
                                      activeOscillators[id].source === 'sequencer_drum_synth')
           ) { 
            stopSound(id, 0.01); 
        }
    });
}

async function loadCustomDrumSample(event, drumIndex) {
    const file = event.target.files[0];
    if (!file) { return; }
    await initAudioContext();

    const drumName = DRUM_ROW_NAMES[drumIndex];
    if (!drumName) {
        console.error(`Invalid drum index: ${drumIndex}`);
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const arrayBuffer = e.target.result;
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            drumSamples[drumName] = audioBuffer;
            console.log(`Custom sample for ${drumName} loaded and decoded successfully.`);
            alert(`New sample for "${drumName}" loaded!`);
        } catch (error) {
            console.error(`Error loading or decoding custom sample for ${drumName}:`, error);
            alert(`Failed to load sample for "${drumName}". Please ensure it's a valid WAV file. Error: ${error.message}`);
            drumSamples[drumName] = null;
        }
    };
    reader.readAsArrayBuffer(file);
    if (event.target) event.target.value = null;
}

function TICKS_PER_BEAT() {
    return 128;
}

function exportMIDI() {
    function stringToBytes(str) { const bytes = []; for (let i = 0; i < str.length; i++) { bytes.push(str.charCodeAt(i)); } return bytes; }
    function numberToBytes(num, byteCount) { const bytes = []; for (let i = byteCount - 1; i >= 0; i--) { bytes.push((num >> (i * 8)) & 0xFF); } return bytes;}
    function encodeVLQ(value) { const result = []; let v = value; const tempBytes = []; tempBytes.push(v & 0x7F); v >>= 7;
        while (v > 0) { tempBytes.push(v & 0x7F); v >>= 7; }
        while (tempBytes.length > 0) { let b = tempBytes.pop(); if (tempBytes.length > 0) { b |= 0x80; } result.push(b); }
        return result.length > 0 ? result : [0]; 
    }
    const midiFileBytes = []; const tracksData = []; 
    const totalRows = NUM_DRUM_ROWS + NUM_SEQ_MELODIC_ROWS;
    const ticksPerBeat = TICKS_PER_BEAT();

    const DRUM_MIDI_NOTES = { "Kick": 36, "Snare": 38, "Hi-Hat": 42 }; 
    const DRUM_MIDI_CHANNEL = 9; 

    let drumTrackHasNotes = false;
    const drumTrackEvents = [];
    let drumCurrentAbsoluteTick = 0;
    const drumTrackName = "Drums";
    const drumTrackNameBytes = stringToBytes(drumTrackName);
    drumTrackEvents.push({ delta: 0, eventBytes: [0xFF, 0x03, drumTrackNameBytes.length, ...drumTrackNameBytes]});

    if (tracksData.length === 0) { 
        const microSecondsPerBeat = Math.round(60000000 / currentSeqTempoBPM);
        drumTrackEvents.push({ delta: 0, eventBytes: [0xFF, 0x51, 0x03, ...numberToBytes(microSecondsPerBeat, 3)] });
    }

    const drumTimedEvents = [];
    for (let drumRowIndex = 0; drumRowIndex < NUM_DRUM_ROWS; drumRowIndex++) {
        const drumName = DRUM_ROW_NAMES[drumRowIndex];
        const midiNote = DRUM_MIDI_NOTES[drumName];
        if (midiNote === undefined) continue;

        for (let s = 0; s < NUM_SEQ_STEPS; s++) {
            if (sequencerData[drumRowIndex] && sequencerData[drumRowIndex][s]) {
                drumTrackHasNotes = true;
                const noteStartTick = s * (ticksPerBeat / 4);
                const noteDurationTicks = ticksPerBeat / 4; 
                const noteEndTick = noteStartTick + noteDurationTicks;
                const velocity = 100;
                drumTimedEvents.push({ tick: noteStartTick, type: 'on', bytes: [0x90 | DRUM_MIDI_CHANNEL, midiNote, velocity] });
                drumTimedEvents.push({ tick: noteEndTick, type: 'off', bytes: [0x80 | DRUM_MIDI_CHANNEL, midiNote, 0] });
            }
        }
    }
    if (drumTrackHasNotes) {
        drumTimedEvents.sort((a,b) => a.tick - b.tick || (a.type === 'off' ? 1 : -1)); 
        for (const event of drumTimedEvents) {
            const delta = event.tick - drumCurrentAbsoluteTick;
            drumTrackEvents.push({ delta: delta, eventBytes: event.bytes });
            drumCurrentAbsoluteTick = event.tick;
        }
        const endOfDrumSequenceTick = NUM_SEQ_STEPS * (ticksPerBeat / 4);
        const deltaToEndDrums = Math.max(0, endOfDrumSequenceTick - drumCurrentAbsoluteTick);
        drumTrackEvents.push({ delta: deltaToEndDrums, eventBytes: [0xFF, 0x2F, 0x00] });
        tracksData.push(drumTrackEvents);
    }

    for (let melodicRow = 0; melodicRow < NUM_SEQ_MELODIC_ROWS; melodicRow++) {
        const dataRowIndex = NUM_DRUM_ROWS + melodicRow;
        const keyIndexToPlay = SEQ_ROW_KEY_INDICES[melodicRow];

        if (keyIndexToPlay === undefined || keyIndexToPlay === null || keyIndexToPlay < 0 || keyIndexToPlay >= NUM_PIANO_KEYS || !keysData[keyIndexToPlay]) continue;
        let rowHasNotes = false; 
        for (let s = 0; s < NUM_SEQ_STEPS; s++) { 
            if (sequencerData[dataRowIndex] && sequencerData[dataRowIndex][s]) { 
                rowHasNotes = true; break; 
            }
        }
        if (!rowHasNotes) continue; 
        
        let midiChannel;
        if (melodicRow < DRUM_MIDI_CHANNEL) { 
            midiChannel = melodicRow;
        } else if (melodicRow < 15) { 
            midiChannel = melodicRow + 1; 
        } else {
            continue; 
        }

        const trackEventsList = [];  let currentAbsoluteTick = 0; 
        const trackName = `Melody ${melodicRow + 1}`; const trackNameBytes = stringToBytes(trackName);
        trackEventsList.push({ delta: 0, eventBytes: [0xFF, 0x03, trackNameBytes.length, ...trackNameBytes] });
        
        if (tracksData.length === 0) { 
            const microSecondsPerBeat = Math.round(60000000 / currentSeqTempoBPM);
            trackEventsList.push({ delta: 0, eventBytes: [0xFF, 0x51, 0x03, ...numberToBytes(microSecondsPerBeat, 3)] }); 
        }

        trackEventsList.push({ delta: 0, eventBytes: [0xB0 | midiChannel, 101, 0] }); 
        trackEventsList.push({ delta: 0, eventBytes: [0xB0 | midiChannel, 100, 0] });
        trackEventsList.push({ delta: 0, eventBytes: [0xB0 | midiChannel, 6, PITCH_BEND_RANGE_SEMITONES] }); 
        trackEventsList.push({ delta: 0, eventBytes: [0xB0 | midiChannel, 38, 0] });
        
        const timedEvents = []; let lastKnownPitchBendOnChannel = 8192; 
        for (let s = 0; s < NUM_SEQ_STEPS; s++) {
            if (sequencerData[dataRowIndex] && sequencerData[dataRowIndex][s]) {
                const freqObject = getFrequencyForKey(keyIndexToPlay); 
                if (freqObject === null) continue;
                const freq = freqObject.baseFreq; // Use base frequency for MIDI export
                const midiNoteValue = 69 + 12 * Math.log2(freq / 440.0); const closestMidiNote = Math.max(0, Math.min(127, Math.round(midiNoteValue)));
                const deviationSemitones = midiNoteValue - closestMidiNote; let pitchBendActual = 8192; 
                if (Math.abs(deviationSemitones) > 0.001) { const pitchBendUnits = (deviationSemitones / PITCH_BEND_RANGE_SEMITONES) * 8191;
                    pitchBendActual = Math.round(8192 + pitchBendUnits); pitchBendActual = Math.max(0, Math.min(16383, pitchBendActual)); }
                const pitchBendLSB = pitchBendActual & 0x7F; const pitchBendMSB = (pitchBendActual >> 7) & 0x7F;
                const noteStartTick = s * (ticksPerBeat / 4); const noteDurationTicks = ticksPerBeat / 4; 
                const noteEndTick = noteStartTick + noteDurationTicks; const velocity = 100; 
                if (pitchBendActual !== lastKnownPitchBendOnChannel) {
                    timedEvents.push({ tick: noteStartTick, type: 'pb', bytes: [0xE0 | midiChannel, pitchBendLSB, pitchBendMSB] });
                    lastKnownPitchBendOnChannel = pitchBendActual; }
                timedEvents.push({ tick: noteStartTick, type: 'on', bytes: [0x90 | midiChannel, closestMidiNote, velocity] });
                timedEvents.push({ tick: noteEndTick, type: 'off', bytes: [0x80 | midiChannel, closestMidiNote, 0] });
            }}
        timedEvents.sort((a, b) => { if (a.tick !== b.tick) return a.tick - b.tick; const typeOrder = { 'pb': 0, 'on': 1, 'off': 2 }; return typeOrder[a.type] - typeOrder[b.type]; });
        for (const event of timedEvents) { const delta = event.tick - currentAbsoluteTick; trackEventsList.push({ delta: delta, eventBytes: event.bytes }); currentAbsoluteTick = event.tick; }
        const endOfSequenceTick = NUM_SEQ_STEPS * (ticksPerBeat / 4); const deltaToEnd = Math.max(0, endOfSequenceTick - currentAbsoluteTick);
        trackEventsList.push({ delta: deltaToEnd, eventBytes: [0xFF, 0x2F, 0x00] }); 
        tracksData.push(trackEventsList);
    }

    if (tracksData.length === 0) { alert("No notes in sequencer to export."); return; }

    midiFileBytes.push(...stringToBytes('MThd')); midiFileBytes.push(...numberToBytes(6, 4)); midiFileBytes.push(...numberToBytes(1, 2)); 
    midiFileBytes.push(...numberToBytes(tracksData.length, 2)); midiFileBytes.push(...numberToBytes(ticksPerBeat, 2)); 
    for (const trackEvents of tracksData) { const trackChunkBytes = [];
        for (const event of trackEvents) { trackChunkBytes.push(...encodeVLQ(event.delta)); trackChunkBytes.push(...event.eventBytes); }
        midiFileBytes.push(...stringToBytes('MTrk')); midiFileBytes.push(...numberToBytes(trackChunkBytes.length, 4)); midiFileBytes.push(...trackChunkBytes);
    }
    const byteArray = new Uint8Array(midiFileBytes); const blob = new Blob([byteArray], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sequencer_output.mid';
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); alert("MIDI file exported!");
}