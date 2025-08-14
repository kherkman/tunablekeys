// --- chords-arpeggio.js ---
// This file contains all logic for the Chord & Arpeggio Controls.
// It relies on global variables and functions from the main script, such as:
// - keysData, NUM_PIANO_KEYS: For knowing which piano keys are available.
// - currentSeqTempoBPM: For setting the arpeggiator speed.
// - getFrequencyForKey(), playSound(), stopSound(): For audio generation.
// - initAudioContext(): To ensure the audio engine is running.
// - getEffectiveIntervalString(): For displaying key information in selectors.

// --- Global Chord & Arpeggio Variables ---
let NUM_CHORDS = 4;
let chordDefinitions = {};

let isArpeggioActive = false;
let activeChordSounds = [];
let highlightedChordKeys = [];

let arpLoopIntervalId = null;
let currentArpChordType = null;
let currentArpNoteIndex = 0;
let currentArpSoundId = null;
let currentArpPlayingKeyElement = null;

// --- UI Element Variables ---
let numChordsInput, applyNumChordsBtn;
let chordButtonsRowDiv;
let arpToggleBtn;


// --- Core Functions ---

/**
 * Removes the 'chord-playing' highlight from any currently highlighted keys.
 */
function clearChordKeyHighlights() {
    highlightedChordKeys.forEach(el => el.classList.remove('chord-playing'));
    highlightedChordKeys = [];
}

/**
 * Stops the sound of the current arpeggio note and removes its highlight.
 */
function stopCurrentArpNoteSoundAndHighlight() {
    if (currentArpSoundId) stopSound(currentArpSoundId, 0.01);
    if (currentArpPlayingKeyElement) currentArpPlayingKeyElement.classList.remove('chord-playing');
    currentArpSoundId = null;
    currentArpPlayingKeyElement = null;
}

/**
 * Stops the arpeggiator loop and clears any related sound or highlights.
 */
function stopArpLoop() {
    if (arpLoopIntervalId) clearInterval(arpLoopIntervalId);
    arpLoopIntervalId = null;
    stopCurrentArpNoteSoundAndHighlight();
    currentArpChordType = null;
}

/**
 * Plays the next note in the active arpeggio sequence.
 */
function playNextArpNote() {
    if (!isArpeggioActive || !currentArpChordType || !chordDefinitions[currentArpChordType]) {
        stopArpLoop();
        return;
    }

    const chordDef = chordDefinitions[currentArpChordType];
    const validNotes = chordDef.currentKeyIndices.filter(ki => {
        if (ki === null) return false;
        const keyIndex = (typeof ki === 'object') ? ki.keyIndex : ki;
        return keysData[keyIndex] !== null; // Check that the key slot is not empty
    });

    if (validNotes.length === 0) {
        stopArpLoop();
        return;
    }

    currentArpNoteIndex = currentArpNoteIndex % validNotes.length;
    const keyInfo = validNotes[currentArpNoteIndex];

    let keyIndex, octaveMod = 0;
    if (typeof keyInfo === 'number') {
        keyIndex = keyInfo;
    } else {
        keyIndex = keyInfo.keyIndex;
        octaveMod = keyInfo.octaveMod || 0;
    }

    if (keyIndex === null || keyIndex === undefined || keyIndex < 0 || keyIndex >= NUM_PIANO_KEYS || !keysData[keyIndex]) {
        currentArpNoteIndex++;
        return;
    }

    const freqObject = getFrequencyForKey(keyIndex, octaveMod);
    const arpStepDurationMs = (60 / currentSeqTempoBPM) * 1000 / 4;

    if (freqObject !== null) {
        stopCurrentArpNoteSoundAndHighlight();

        currentArpSoundId = `arp_${currentArpChordType}_note${currentArpNoteIndex}`;
        playSound(freqObject, currentArpSoundId, 'key', (arpStepDurationMs / 1000) * 0.95);

        currentArpPlayingKeyElement = document.querySelector(`.piano-key[data-key-index="${keyIndex}"]`);
        if (currentArpPlayingKeyElement) {
            currentArpPlayingKeyElement.classList.add('chord-playing');
        }
    }
    currentArpNoteIndex++;
}

/**
 * Plays a chord, either as a block or by starting the arpeggiator.
 * @param {string} chordType - The ID of the chord to play (e.g., 'cho1').
 */
async function playChord(chordType) {
    await initAudioContext();
    const chordDef = chordDefinitions[chordType];
    if (!chordDef) return;

    clearChordKeyHighlights();
    stopActiveChordSounds();

    if (isArpeggioActive) {
        stopArpLoop();
        currentArpChordType = chordType;
        currentArpNoteIndex = 0;
        const arpStepDurationMs = (60 / currentSeqTempoBPM) * 1000 / 4;
        playNextArpNote();
        arpLoopIntervalId = setInterval(playNextArpNote, arpStepDurationMs);
    } else {
        stopArpLoop();
        const soundIds = [];
        for (let i = 0; i < chordDef.currentKeyIndices.length; i++) {
            const keyInfo = chordDef.currentKeyIndices[i];
            if (keyInfo === null) continue;

            let keyIndex, octaveMod = 0;
            if (typeof keyInfo === 'number') {
                keyIndex = keyInfo;
            } else {
                keyIndex = keyInfo.keyIndex;
                octaveMod = keyInfo.octaveMod || 0;
            }
            if (keyIndex === null || keyIndex === undefined || keyIndex < 0 || keyIndex >= NUM_PIANO_KEYS || !keysData[keyIndex]) continue;

            const freqObject = getFrequencyForKey(keyIndex, octaveMod);
            if (freqObject !== null) {
                const soundId = `chord_${chordType}_note${i}`;
                playSound(freqObject, soundId, 'key');
                activeChordSounds.push(soundId);

                const keyElement = document.querySelector(`.piano-key[data-key-index="${keyIndex}"]`);
                if (keyElement) {
                    keyElement.classList.add('chord-playing');
                    highlightedChordKeys.push(keyElement);
                }
            }
        }
    }
}

/**
 * Stops all currently playing notes from block chords.
 */
function stopActiveChordSounds() {
    activeChordSounds.forEach(id => stopSound(id));
    activeChordSounds = [];
    clearChordKeyHighlights();
}

/**
 * (Re)creates the dropdown selectors for assigning piano keys to a specific chord.
 * This is called when keys change or the octave is shifted.
 * @param {string} chordType - The ID of the chord to update.
 */
function createChordKeySelectors(chordType) {
    const chordDef = chordDefinitions[chordType];
    if (!chordDef) return;

    const selectorsContainer = document.getElementById(`chord-selectors-${chordType}`);
    if (!selectorsContainer) return;
    selectorsContainer.innerHTML = '';

    for (let noteIndex = 0; noteIndex < chordDef.numNotes; noteIndex++) {
        const controlGroupDiv = document.createElement('div');
        controlGroupDiv.classList.add('control-group');

        const labelEl = document.createElement('label');
        labelEl.textContent = `${chordDef.labels[noteIndex] || `Note ${noteIndex + 1}`}:`;
        labelEl.htmlFor = `chord-${chordType}-key${noteIndex}-select`;

        const selectEl = document.createElement('select');
        selectEl.id = `chord-${chordType}-key${noteIndex}-select`;
        selectEl.dataset.chordType = chordType;
        selectEl.dataset.noteIndex = noteIndex;

        const noneOption = document.createElement('option');
        noneOption.value = "-1";
        noneOption.textContent = "None";
        selectEl.appendChild(noneOption);

        const hasValidKeys = keysData.some(k => k !== null);

        if (!hasValidKeys) {
            selectEl.disabled = true;
        } else {
            for (let i = 0; i < NUM_PIANO_KEYS; i++) {
                if (!keysData[i]) continue; // Skip null keys
                const option = document.createElement('option');
                option.value = i;
                const effectiveInterval = getEffectiveIntervalString(i);
                option.textContent = `Key ${i + 1} (${effectiveInterval})`;
                selectEl.appendChild(option);
            }
            selectEl.disabled = false;
        }

        let currentKeyForNote;
        const keyDef = chordDef.currentKeyIndices[noteIndex];

        if (keyDef === null) {
            currentKeyForNote = -1;
        } else if (typeof keyDef === 'object') {
            currentKeyForNote = keyDef.keyIndex;
        } else {
            currentKeyForNote = keyDef;
        }

        if (!hasValidKeys) {
            selectEl.value = "-1";
        } else if (currentKeyForNote === -1 || !keysData[currentKeyForNote]) {
            selectEl.value = "-1";
        } else {
            selectEl.value = currentKeyForNote;
        }

        selectEl.addEventListener('change', (event) => {
            const selectedValue = parseInt(event.target.value);
            const cType = event.target.dataset.chordType;
            const nIndex = parseInt(event.target.dataset.noteIndex);

            if (selectedValue === -1) {
                chordDefinitions[cType].currentKeyIndices[nIndex] = null;
            } else {
                let currentNoteDefinition = chordDefinitions[cType].currentKeyIndices[nIndex];
                if (typeof currentNoteDefinition === 'object' && currentNoteDefinition !== null) {
                    currentNoteDefinition.keyIndex = selectedValue;
                } else {
                    chordDefinitions[cType].currentKeyIndices[nIndex] = selectedValue;
                }
            }
        });
        controlGroupDiv.appendChild(labelEl);
        controlGroupDiv.appendChild(selectEl);
        selectorsContainer.appendChild(controlGroupDiv);
    }
}

/**
 * Creates the entire UI for a single chord definition group.
 * @param {string} chordId - The ID of the chord to build the UI for.
 */
function buildChordGroupUI(chordId) {
    const chordDef = chordDefinitions[chordId];
    if (!chordDef) return;

    const groupDiv = document.createElement('div');
    groupDiv.classList.add('chord-definition-group');
    groupDiv.id = `chord-group-${chordId}`;

    const button = document.createElement('button');
    button.classList.add('chord-button');
    button.dataset.type = chordId;
    button.textContent = chordDef.name;

    button.addEventListener('mousedown', () => { playChord(chordId); button.classList.add('playing'); });
    button.addEventListener('mouseup', () => {
        if (isArpeggioActive && currentArpChordType === chordId) {
            stopArpLoop();
        } else if (!isArpeggioActive) {
            stopActiveChordSounds();
        }
        button.classList.remove('playing');
    });
    button.addEventListener('mouseleave', () => {
        if (button.classList.contains('playing')) {
            if (isArpeggioActive && currentArpChordType === chordId) {
                // Don't stop the arp on mouseleave
            } else if (!isArpeggioActive) {
                stopActiveChordSounds();
                button.classList.remove('playing');
            }
        }
    });
    button.addEventListener('touchstart', (e) => { e.preventDefault(); playChord(chordId); button.classList.add('playing'); });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (isArpeggioActive && currentArpChordType === chordId) {
            stopArpLoop();
        } else if (!isArpeggioActive) {
            stopActiveChordSounds();
        }
        button.classList.remove('playing');
    });

    groupDiv.appendChild(button);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = chordDef.name;
    nameInput.dataset.chordType = chordId;
    nameInput.style.width = '90%';
    nameInput.style.textAlign = 'center';
    nameInput.style.backgroundColor = '#566573';
    nameInput.style.color = '#ecf0f1';
    nameInput.style.border = '1px solid #4a6278';
    nameInput.style.borderRadius = '4px';
    nameInput.style.padding = '4px';
    nameInput.style.fontSize = '0.7em';
    nameInput.style.marginTop = '4px';
    nameInput.placeholder = "Chord Name";

    nameInput.addEventListener('input', (event) => {
        const cType = event.target.dataset.chordType;
        const newName = event.target.value;
        chordDefinitions[cType].name = newName;
        const chordButton = groupDiv.querySelector(`.chord-button[data-type="${cType}"]`);
        if (chordButton) {
            chordButton.textContent = newName;
        }
    });
    groupDiv.appendChild(nameInput);

    const numNotesControlDiv = document.createElement('div');
    numNotesControlDiv.classList.add('chord-num-notes-control');

    const numNotesLabel = document.createElement('label');
    numNotesLabel.textContent = "Notes:";
    numNotesLabel.htmlFor = `chord-${chordId}-num-notes-input`;
    numNotesControlDiv.appendChild(numNotesLabel);

    const numNotesInput = document.createElement('input');
    numNotesInput.type = 'number';
    numNotesInput.id = `chord-${chordId}-num-notes-input`;
    numNotesInput.value = chordDef.numNotes;
    numNotesInput.min = 1;
    numNotesInput.max = 8;
    numNotesInput.dataset.chordType = chordId;

    numNotesInput.addEventListener('change', (event) => {
        const cType = event.target.dataset.chordType;
        const newNumNotes = parseInt(event.target.value);
        if (isNaN(newNumNotes) || newNumNotes < 1 || newNumNotes > 8) {
            event.target.value = chordDefinitions[cType].numNotes;
            return;
        }
        chordDefinitions[cType].numNotes = newNumNotes;
        const oldIndices = chordDefinitions[cType].currentKeyIndices;
        const newIndices = Array(newNumNotes);
        for (let i = 0; i < newNumNotes; i++) {
            if (i < oldIndices.length) {
                newIndices[i] = oldIndices[i];
            } else {
                newIndices[i] = null;
            }
        }
        chordDefinitions[cType].currentKeyIndices = newIndices;
        chordDefinitions[cType].labels = Array(newNumNotes).fill(null).map((_, i) => `Note ${i + 1}`);

        createChordKeySelectors(cType);
    });
    numNotesControlDiv.appendChild(numNotesInput);
    groupDiv.appendChild(numNotesControlDiv);

    const selectorsDiv = document.createElement('div');
    selectorsDiv.classList.add('chord-key-selectors');
    selectorsDiv.id = `chord-selectors-${chordId}`;
    groupDiv.appendChild(selectorsDiv);

    chordButtonsRowDiv.appendChild(groupDiv);
}

/**
 * Initializes or re-initializes the entire chord system based on the number of chords input.
 */
function initChordSystem() {
    NUM_CHORDS = parseInt(numChordsInput.value);
    chordDefinitions = {};
    if (chordButtonsRowDiv) chordButtonsRowDiv.innerHTML = '';

    for (let i = 0; i < NUM_CHORDS; i++) {
        const chordId = `cho${i + 1}`;
        const defaultNumNotes = 4;
        const defaultKeyIndices = Array(defaultNumNotes).fill(null).map((_, idx) => {
            const defaultProgression = [0, 4, 7, 10];
            let potentialIndex = defaultProgression[idx % defaultProgression.length];
            // Find the first valid key at or after the potential index
            for (let k = potentialIndex; k < keysData.length; k++) {
                if (keysData[k]) return k;
            }
            // If not found, wrap around and search from the beginning
            for (let k = 0; k < potentialIndex; k++) {
                if (keysData[k]) return k;
            }
            return null; // No valid keys exist
        });

        chordDefinitions[chordId] = {
            name: `Chord ${i + 1}`,
            numNotes: defaultNumNotes,
            currentKeyIndices: defaultKeyIndices,
            labels: Array(defaultNumNotes).fill(null).map((_, j) => `Note ${j + 1}`)
        };
        buildChordGroupUI(chordId);
        createChordKeySelectors(chordId);
    }
}

/**
 * Rebuilds the entire chord UI from the `chordDefinitions` object.
 * Used when loading a session from a file.
 */
function rebuildAllChordUIFromDefinitions() {
    if (chordButtonsRowDiv) chordButtonsRowDiv.innerHTML = '';
    numChordsInput.value = NUM_CHORDS;

    for (let i = 0; i < NUM_CHORDS; i++) {
        const chordId = `cho${i + 1}`;
        if (!chordDefinitions[chordId]) {
            const defaultNumNotes = 4;
            chordDefinitions[chordId] = {
                name: `Chord ${i + 1}`,
                numNotes: defaultNumNotes,
                currentKeyIndices: Array(defaultNumNotes).fill(null),
                labels: Array(defaultNumNotes).fill(null).map((_, j) => `Note ${j + 1}`)
            };
        }
        buildChordGroupUI(chordId);
        createChordKeySelectors(chordId);
    }
}


/**
 * Sets up initial event listeners and grabs DOM elements for the chord controls.
 * This is the main entry point for this script, called from the main script on DOMContentLoaded.
 */
function setupChordControls() {
    numChordsInput = document.getElementById('num-chords-input');
    applyNumChordsBtn = document.getElementById('apply-num-chords-btn');
    chordButtonsRowDiv = document.getElementById('chord-buttons-row');
    arpToggleBtn = document.getElementById('arp-toggle-btn');

    if (applyNumChordsBtn) applyNumChordsBtn.addEventListener('click', initChordSystem);

    arpToggleBtn.addEventListener('click', () => {
        isArpeggioActive = !isArpeggioActive;
        arpToggleBtn.textContent = `Arp: ${isArpeggioActive ? 'On' : 'Off'}`;
        arpToggleBtn.classList.toggle('active', isArpeggioActive);
        if (!isArpeggioActive) {
            stopArpLoop();
            document.querySelectorAll('.chord-button.playing').forEach(b => b.classList.remove('playing'));
        }
    });

    initChordSystem();
}