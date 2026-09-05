"use strict";

const INTERVAL_MAP = [
    { semitones: 0, name: 'Uníson', btnName: 'Uníson' },
    { semitones: 1, name: '2a menor', btnName: '2a m' },
    { semitones: 2, name: '2a major', btnName: '2a M' },
    { semitones: 3, name: '3a menor', btnName: '3a m' },
    { semitones: 4, name: '3a major', btnName: '3a M' },
    { semitones: 5, name: '4a Justa', btnName: '4a J' },
    { semitones: 6, name: 'Tritò', btnName: 'Tritò' },
    { semitones: 7, name: '5a Justa', btnName: '5a J' },
    { semitones: 8, name: '6a menor', btnName: '6a m' },
    { semitones: 9, name: '6a major', btnName: '6a M' },
    { semitones: 10, name: '7a menor', btnName: '7a m' },
    { semitones: 11, name: '7a major', btnName: '7a M' },
    { semitones: 12, name: '8a Justa', btnName: '8a J' },
];

const getIntervalInfo = (semitones) => INTERVAL_MAP.find(i => i.semitones === semitones);

const DIFFICULTY_CONFIG = {
    'inicial': { 
        semitones: [0, 2, 4, 5, 7, 9, 11, 12], 
        directions: ['ascendente'], 
        name: 'Inicial' 
    },
    'intermedio': { 
        semitones: [0, 2, 4, 5, 7, 9, 11, 12], 
        directions: ['ascendente', 'descendente'], 
        name: 'Intermedi' 
    },
    'dificil': { 
        semitones: INTERVAL_MAP.map(i => i.semitones), 
        directions: ['ascendente', 'descendente'], 
        name: 'Difícil' 
    }
};

const MIN_NOTE_MIDI = 60; // C4
const MAX_NOTE_MIDI = 81; // A5

const AppState = {
    difficulty: null,
    currentIntervalSemitones: null,
    currentDirection: null,
    startNoteMIDI: null,
    selectedInterval: null,
    selectedDirection: 'ascendente',
    timer: 30,
    timerId: null,
    isChecking: false,
    totalAttempts: 0,
    correctAnswers: 0,
    isVexFlowLoaded: false,
    vexFlow: { renderer: null, stave: null, context: null }
};

const DOM = {};

function getVexFlowNamespace() {
    const globalObj = typeof window !== 'undefined' ? window : globalThis;
    if (!globalObj) return null;
    if (globalObj.Vex && globalObj.Vex.Flow) return globalObj.Vex.Flow;
    if (globalObj.Vex && !globalObj.Vex.Flow) return globalObj.Vex;
    if (globalObj.VexFlow) return globalObj.VexFlow;
    return null;
}

function cacheDOMElements() {
    DOM.startScreen = document.getElementById('start-screen');
    DOM.gameScreen = document.getElementById('game-screen');
    DOM.difficultyDisplay = document.getElementById('current-difficulty');
    DOM.staveContainer = document.getElementById('stave-container');
    DOM.staveDisplayContainer = document.getElementById('stave-display');
    DOM.intervalButtonsContainer = document.getElementById('interval-buttons-container');
    DOM.btnAscendente = document.getElementById('btn-ascendente');
    DOM.btnDescendente = document.getElementById('btn-descendente');
    DOM.feedbackMessage = document.getElementById('feedback-message');
    DOM.btnCheck = document.getElementById('btn-check');
    DOM.btnNext = document.getElementById('btn-next');
    DOM.timerDisplay = document.getElementById('timer-display');
    DOM.scoreCorrect = document.getElementById('score-correct');
    DOM.scoreTotal = document.getElementById('score-total');
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_BASE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midiToSpelling(midiNote) {
    const octave = Math.floor(midiNote / 12) - 1;
    const semi = midiNote % 12;
    let bestLetter = 'C';
    let bestDiff = 999;
    for (const L of LETTERS) {
        const base = LETTER_BASE_SEMITONES[L];
        const diff = Math.abs(semi - base);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestLetter = L;
        }
    }
    const accidental = semi - LETTER_BASE_SEMITONES[bestLetter];
    return { letter: bestLetter, accidental: accidental, octave: octave };
}

function computeLetterStepsForSemitones(semitones) {
    const map = { 0:0, 1:1, 2:1, 3:2, 4:2, 5:3, 6:3, 7:4, 8:5, 9:5, 10:6, 11:6, 12:7 };
    return map[semitones] ?? 0;
}

function spelledToMidi(spell) {
    const base = LETTER_BASE_SEMITONES[spell.letter];
    const pitchClass = (base + spell.accidental + 12) % 12;
    return (spell.octave + 1) * 12 + pitchClass;
}

function accidentalToVexSymbol(acc) {
    if (acc === -2) return 'bb';
    if (acc === -1) return 'b';
    if (acc === 1) return '#';
    if (acc === 2) return '##';
    return '';
}

function spellingToVexKey(spell) {
    return `${spell.letter.toLowerCase()}/${spell.octave}`;
}

function getProperEnharmonicSpelling(startSpell, intervalSemitones, direction) {
    const ascending = direction !== 'descendente';
    const steps = computeLetterStepsForSemitones(intervalSemitones);
    const startLetterIdx = LETTERS.indexOf(startSpell.letter);
    
    let targetLetterIdx = ascending 
        ? (startLetterIdx + steps) % 7 
        : (startLetterIdx - steps + 7) % 7;
        
    const targetLetter = LETTERS[targetLetterIdx];
    let targetOctave = startSpell.octave;

    if (ascending && targetLetterIdx < startLetterIdx) targetOctave++;
    if (!ascending && targetLetterIdx > startLetterIdx) targetOctave--;
    if (intervalSemitones === 12) targetOctave = startSpell.octave + (ascending ? 1 : -1);

    const startMidi = spelledToMidi(startSpell);
    const targetMidi = startMidi + (ascending ? intervalSemitones : -intervalSemitones);
    const targetPC = ((targetMidi % 12) + 12) % 12;
    const basePC = LETTER_BASE_SEMITONES[targetLetter];
    
    let accidental = (targetPC - basePC + 12) % 12;
    if (accidental > 6) accidental -= 12;

    return { letter: targetLetter, accidental: accidental, octave: targetOctave };
}

function getIntervalNoteRenderData(startMidi, semitones, direction) {
    const startSpell = midiToSpelling(startMidi);
    const endSpell = getProperEnharmonicSpelling(startSpell, semitones, direction);

    return { 
        startVF: { key: spellingToVexKey(startSpell), accidental: accidentalToVexSymbol(startSpell.accidental) },
        endVF: { key: spellingToVexKey(endSpell), accidental: accidentalToVexSymbol(endSpell.accidental) }
    };
}

function setupVexFlowRenderer(VF) {
    try {
        const container = DOM.staveDisplayContainer;
        if (!container) return;
        container.innerHTML = '';
        
        const containerWidth = DOM.staveContainer.clientWidth || 300;
        const width = Math.max(240, containerWidth - 10);
        const height = 110;

        const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();

        const stave = new VF.Stave(5, 0, width - 10);
        stave.addClef('treble').setContext(context).draw();

        AppState.vexFlow = { renderer, context, stave, VF };
    } catch (e) {
        console.error('Error VexFlow init:', e);
    }
}

function drawInterval(note1VF, note2VF) {
    const container = DOM.staveDisplayContainer;
    if (!AppState.isVexFlowLoaded || !AppState.vexFlow.VF) return;

    const { VF } = AppState.vexFlow;
    try {
        container.innerHTML = '';
        
        const containerWidth = DOM.staveContainer.clientWidth || 300;
        const width = Math.max(240, containerWidth - 10);
        const height = 110;

        const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();

        const stave = new VF.Stave(5, 0, width - 10);
        stave.addClef('treble').setContext(context).draw();

        const note1 = new VF.StaveNote({ clef: 'treble', keys: [note1VF.key], duration: 'q' });
        const note2 = new VF.StaveNote({ clef: 'treble', keys: [note2VF.key], duration: 'q' });

        if (note1VF.accidental) note1.addModifier(new VF.Accidental(note1VF.accidental), 0);
        if (note2VF.accidental) note2.addModifier(new VF.Accidental(note2VF.accidental), 0);

        const voice = new VF.Voice({ num_beats: 2, beat_value: 4 }).setStrict(false);
        voice.addTickables([note1, note2]);

        new VF.Formatter().joinVoices([voice]).format([voice], width - 50);
        voice.draw(context, stave);
    } catch (e) {
        console.error("Error dibuixant interval:", e);
    }
}

function switchView(viewName) {
    DOM.startScreen.classList.add('hidden');
    DOM.gameScreen.classList.add('hidden');

    if (viewName === 'start') {
        DOM.startScreen.classList.remove('hidden');
        document.getElementById('main-header').style.display = 'block';
        document.getElementById('main-footer').style.display = 'block';
    } else if (viewName === 'game') {
        DOM.gameScreen.classList.remove('hidden');
        document.getElementById('main-header').style.display = 'none';
        document.getElementById('main-footer').style.display = 'none';
    }
}

function updateScoreDisplay() {
    if (DOM.scoreCorrect && DOM.scoreTotal) {
        DOM.scoreCorrect.textContent = AppState.correctAnswers;
        DOM.scoreTotal.textContent = AppState.totalAttempts;
    }
}

function startGame(difficultyKey) {
    AppState.difficulty = difficultyKey;
    AppState.totalAttempts = 0;
    AppState.correctAnswers = 0;
    AppState.selectedDirection = DIFFICULTY_CONFIG[difficultyKey].directions[0];
    DOM.difficultyDisplay.textContent = DIFFICULTY_CONFIG[difficultyKey].name;
    switchView('game');
    generateButtons();
    updateScoreDisplay();
    nextInterval();
}

function generateInterval() {
    const config = DIFFICULTY_CONFIG[AppState.difficulty];
    const intervalSemitones = config.semitones[Math.floor(Math.random() * config.semitones.length)];
    const direction = config.directions[Math.floor(Math.random() * config.directions.length)];
    
    AppState.currentIntervalSemitones = intervalSemitones;
    AppState.currentDirection = direction;

    let validStartMin = direction === 'descendente' ? MIN_NOTE_MIDI + intervalSemitones : MIN_NOTE_MIDI;
    let validStartMax = direction === 'descendente' ? MAX_NOTE_MIDI : MAX_NOTE_MIDI - intervalSemitones;

    const startNoteMIDI = Math.floor(Math.random() * (validStartMax - validStartMin + 1)) + validStartMin;
    AppState.startNoteMIDI = startNoteMIDI;

    const { startVF, endVF } = getIntervalNoteRenderData(startNoteMIDI, intervalSemitones, direction);
    drawInterval(startVF, endVF);

    resetUI();
    startTimer();
}

function resetUI() {
    AppState.isChecking = false;
    AppState.selectedInterval = null;
    AppState.selectedDirection = DIFFICULTY_CONFIG[AppState.difficulty].directions[0];
    DOM.feedbackMessage.textContent = '';
    DOM.btnCheck.disabled = true;
    DOM.btnNext.disabled = true;

    document.querySelectorAll('.interval-button-choice, #btn-ascendente, #btn-descendente').forEach(btn => {
        btn.disabled = false;
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('bg-blue-600', 'bg-green-600', 'bg-red-600', 'ring-2', 'ring-offset-2', 'ring-blue-400');
        btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
    });
    setupDirectionButtons();
}

function nextInterval() {
    stopTimer();
    generateInterval();
}

function enableCheckButton() {
    if (!AppState.isChecking && AppState.selectedInterval !== null && AppState.selectedDirection !== null) {
        DOM.btnCheck.disabled = false;
    }
}

function selectInterval(semitones) {
    if (AppState.isChecking) return;
    AppState.selectedInterval = semitones;
    document.querySelectorAll('.interval-button-choice').forEach(btn => {
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('bg-blue-600', 'ring-2', 'ring-offset-2', 'ring-blue-400');
        btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
    });
    const selectedBtn = document.getElementById(`interval-${semitones}`);
    if (selectedBtn) {
        selectedBtn.setAttribute('aria-pressed', 'true');
        selectedBtn.classList.remove('bg-gray-700');
        selectedBtn.classList.add('bg-blue-600', 'ring-2', 'ring-offset-2', 'ring-blue-400');
    }
    enableCheckButton();
}

function selectDirection(direction) {
    const configDirections = DIFFICULTY_CONFIG[AppState.difficulty].directions;
    if (AppState.isChecking || configDirections.length === 1) return;
    AppState.selectedDirection = direction;

    DOM.btnAscendente.classList.toggle('bg-blue-600', direction === 'ascendente');
    DOM.btnAscendente.classList.toggle('bg-gray-700', direction !== 'ascendente');
    DOM.btnDescendente.classList.toggle('bg-blue-600', direction === 'descendente');
    DOM.btnDescendente.classList.toggle('bg-gray-700', direction !== 'descendente');
    
    enableCheckButton();
}

function checkAnswer() {
    if (AppState.isChecking) return;
    AppState.isChecking = true;
    stopTimer();
    AppState.totalAttempts++;

    const { currentIntervalSemitones, currentDirection, selectedInterval, selectedDirection } = AppState;
    const isDirectionChecked = DIFFICULTY_CONFIG[AppState.difficulty].directions.length > 1;

    const isIntervalCorrect = selectedInterval === currentIntervalSemitones;
    const isDirectionCorrect = !isDirectionChecked || (selectedDirection === currentDirection);
    const isCorrect = isIntervalCorrect && isDirectionCorrect;

    updateScore(isCorrect);
    const { name: correctIntervalName } = getIntervalInfo(currentIntervalSemitones);
    displayFeedback(isCorrect, correctIntervalName, isDirectionChecked, currentDirection);
    highlightAnswers(isCorrect, selectedInterval, currentIntervalSemitones, selectedDirection, currentDirection, isDirectionChecked);

    DOM.btnCheck.disabled = true;
    DOM.btnNext.disabled = false;
    document.querySelectorAll('.interval-button-choice, #btn-ascendente, #btn-descendente').forEach(btn => btn.disabled = true);
}

function updateScore(isCorrect) {
    if (isCorrect) AppState.correctAnswers++;
    updateScoreDisplay();
}

function displayFeedback(isCorrect, correctIntervalName, isDirectionChecked, correctDirection) {
    if (isCorrect) {
        DOM.feedbackMessage.textContent = "¡CORRECTE! 🥳";
        DOM.feedbackMessage.className = 'text-center h-6 font-bold text-sm sm:text-base text-green-500';
    } else {
        const dirText = isDirectionChecked ? `, ${correctDirection === 'ascendente' ? 'Ascendent' : 'Descendent'}` : '';
        DOM.feedbackMessage.textContent = `INCORRECTE. Era: ${correctIntervalName}${dirText}.`;
        DOM.feedbackMessage.className = 'text-center h-6 font-bold text-sm sm:text-base text-red-500';
    }
}

function highlightAnswers(isCorrect, selectedInterval, correctInterval, selectedDirection, correctDirection, isDirectionChecked) {
    const correctBtn = document.getElementById(`interval-${correctInterval}`);
    if (correctBtn) {
        correctBtn.classList.remove('bg-gray-700', 'bg-blue-600');
        correctBtn.classList.add('bg-green-600');
    }

    if (!isCorrect && selectedInterval !== null && selectedInterval !== correctInterval) {
        const selectedBtn = document.getElementById(`interval-${selectedInterval}`);
        if (selectedBtn) {
            selectedBtn.classList.remove('bg-gray-700', 'bg-blue-600');
            selectedBtn.classList.add('bg-red-600');
        }
    }

    if (isDirectionChecked) {
        const correctDirBtn = document.getElementById(`btn-${correctDirection}`);
        if (correctDirBtn) {
            correctDirBtn.classList.remove('bg-gray-700', 'bg-blue-600');
            correctDirBtn.classList.add('bg-green-600');
        }
        if (selectedDirection !== correctDirection) {
            const selectedDirBtn = document.getElementById(`btn-${selectedDirection}`);
            if (selectedDirBtn) {
                selectedDirBtn.classList.remove('bg-gray-700', 'bg-blue-600');
                selectedDirBtn.classList.add('bg-red-600');
            }
        }
    }
}

function startTimer() {
    stopTimer();
    AppState.timer = 30;
    DOM.timerDisplay.textContent = AppState.timer;
    DOM.timerDisplay.className = 'timer-display font-mono font-bold text-base sm:text-lg text-green-400';

    AppState.timerId = setInterval(() => {
        AppState.timer--;
        DOM.timerDisplay.textContent = AppState.timer;
        if (AppState.timer <= 0) {
            stopTimer();
            if (!AppState.isChecking) checkAnswer();
        }
    }, 1000);
}

function stopTimer() {
    if (AppState.timerId) {
        clearInterval(AppState.timerId);
        AppState.timerId = null;
    }
}

function generateButtons() {
    const container = DOM.intervalButtonsContainer;
    container.innerHTML = '';
    const allowedSemitones = DIFFICULTY_CONFIG[AppState.difficulty].semitones;
    const allowedIntervals = INTERVAL_MAP.filter(i => allowedSemitones.includes(i.semitones));

    allowedIntervals.forEach(interval => {
        const btn = document.createElement('button');
        btn.id = `interval-${interval.semitones}`;
        btn.textContent = interval.btnName;
        btn.onclick = () => IntervallyApp.selectInterval(interval.semitones);
        btn.className = 'interval-button interval-button-choice py-2.5 px-1 rounded-lg font-bold text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white transition border-2 border-transparent shadow';
        container.appendChild(btn);
    });
}

function setupDirectionButtons() {
    const isDirectionEnabled = DIFFICULTY_CONFIG[AppState.difficulty].directions.length > 1;
    DOM.btnDescendente.disabled = !isDirectionEnabled;
    DOM.btnDescendente.classList.toggle('opacity-40', !isDirectionEnabled);
    DOM.btnAscendente.classList.add('bg-blue-600');
    DOM.btnDescendente.classList.remove('bg-blue-600');
    DOM.btnDescendente.classList.add('bg-gray-700');
}

function returnToMenu() {
    stopTimer();
    switchView('start');
}

const IntervallyApp = {
    startGame,
    nextInterval,
    checkAnswer,
    selectInterval,
    selectDirection,
    returnToMenu
};

function init() {
    cacheDOMElements();
    const VFNS = getVexFlowNamespace();
    if (VFNS) {
        AppState.isVexFlowLoaded = true;
        setupVexFlowRenderer(VFNS);
    }
    switchView('start');
}

// Re-dibuixa si l'alumnat gira el mòbil o canvia de mida
window.addEventListener('resize', () => {
    if (AppState.isVexFlowLoaded && AppState.startNoteMIDI !== null) {
        const { startVF, endVF } = getIntervalNoteRenderData(
            AppState.startNoteMIDI, 
            AppState.currentIntervalSemitones, 
            AppState.currentDirection
        );
        drawInterval(startVF, endVF);
    }
});

document.addEventListener('DOMContentLoaded', init);
if (typeof window !== 'undefined') window.IntervallyApp = IntervallyApp;
