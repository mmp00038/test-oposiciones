import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ⚠️ PEGA AQUÍ TU CONFIGURACIÓN REAL DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyDxijpzkKAmP85H5MqYsS_UnnmS1ySAgC0",
    authDomain: "oposiciones-tests.firebaseapp.com",
    databaseURL: "https://oposiciones-tests-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "oposiciones-tests",
    storageBucket: "oposiciones-tests.firebasestorage.app",
    messagingSenderId: "334815991038",
    appId: "1:334815991038:web:287c3c46c72ee9837ec1af",
    measurementId: "G-55K6MR5WKS"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUserUid = null;

// Verificar sesión activa (redirige al login si alguien entra directo sin autenticarse)
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserUid = user.uid;
  } else {
    window.location.href = "../index.html";
  }
});

// 1. Detectar automáticamente el ID del tema desde el nombre del archivo o variable global
function detectarTopicId() {
  if (typeof window.CURRENT_TOPIC_ID !== "undefined" && window.CURRENT_TOPIC_ID) {
    return String(window.CURRENT_TOPIC_ID);
  }
  const url = decodeURIComponent(window.location.pathname);
  if (/repaso/i.test(url)) return "repaso";

  const matchEsp = url.match(/Tema(\d+)/i);
  if (matchEsp) return matchEsp[1]; // "1", "2", ..., "25"

  const matchComun = url.match(/(?:Test|Tema)-(\d+)/i);
  if (matchComun) return `c${matchComun[1]}`; // "c1", "c2", ...

  return "";
}

const topicId = detectarTopicId();

// 2. Detectar bloques y títulos (soporta tanto archivos con quizBlocks propios como archivos simples)
const blocksMap = (typeof quizBlocks !== "undefined") ? quizBlocks : null;
const titlesMap = (typeof titles !== "undefined") ? titles : {};
const fallbackQuestions = (typeof allQuestions !== "undefined") ? allQuestions : (window.allQuestions || []);

const finalBlocks = blocksMap || { "all": fallbackQuestions };
const finalTitles = { ...titlesMap };

if (!blocksMap) {
  const baseTitle = document.getElementById('test-title')?.textContent || "EXAMEN";
  finalTitles["all"] = `${baseTitle} (${fallbackQuestions.length} PREGUNTAS)`;
  const blockSelect = document.getElementById('block-select');
  if (blockSelect) {
    blockSelect.innerHTML = `<option value="all">Examen Completo (${fallbackQuestions.length} preguntas)</option>`;
    const totalBlocks = Math.ceil(fallbackQuestions.length / 25);
    for (let i = 0; i < totalBlocks; i++) {
      const start = i * 25;
      const end = Math.min(start + 25, fallbackQuestions.length);
      const key = `b${i + 1}`;
      finalBlocks[key] = fallbackQuestions.slice(start, end);
      finalTitles[key] = `BLOQUE ${i + 1}: PREGUNTAS ${start + 1} A ${end}`;
      if (totalBlocks > 1) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `Bloque ${i + 1}: Preguntas ${start + 1} - ${end}`;
        blockSelect.appendChild(opt);
      }
    }
  }
}

let activeData = [];
let answeredCount = 0;
let correctCount = 0;
let secondsElapsed = 0;
let timerInterval = null;

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    secondsElapsed++;
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const secs = String(secondsElapsed % 60).padStart(2, '0');
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = `⏱️ ${mins}:${secs}`;
  }, 1000);
}

window.changeBlock = function() {
  const selectEl = document.getElementById('block-select');
  const selected = selectEl ? selectEl.value : "all";
  activeData = finalBlocks[selected] || finalBlocks["all"] || [];

  const titleEl = document.getElementById('test-title');
  if (titleEl && (finalTitles[selected] || finalTitles["all"])) {
    titleEl.textContent = finalTitles[selected] || finalTitles["all"];
  }

  window.resetQuiz();
};

function renderQuiz() {
  const container = document.getElementById('quiz-container');
  if (!container) return;
  container.innerHTML = '';

  activeData.forEach((q, qIndex) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `question-${qIndex}`;

    const qText = document.createElement('div');
    qText.className = 'question-text';
    qText.textContent = q.question;
    card.appendChild(qText);

    const optionsGrid = document.createElement('div');
    optionsGrid.className = 'options-grid';

    q.options.forEach((opt, optIndex) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.onclick = () => selectOption(qIndex, optIndex);
      optionsGrid.appendChild(btn);
    });

    card.appendChild(optionsGrid);

    const feedback = document.createElement('div');
    feedback.className = 'feedback';
    feedback.id = `feedback-${qIndex}`;
    card.appendChild(feedback);

    container.appendChild(card);
  });

  updateStats();
}

function selectOption(qIndex, selectedIndex) {
  const q = activeData[qIndex];
  const card = document.getElementById(`question-${qIndex}`);
  const buttons = card.querySelectorAll('.option-btn');
  const feedback = document.getElementById(`feedback-${qIndex}`);

  buttons.forEach(btn => btn.disabled = true);
  answeredCount++;

  const hasJustification = q.justification && q.justification.trim() !== "";

  if (selectedIndex === q.correct) {
    correctCount++;
    buttons[selectedIndex].classList.add('correct');
    feedback.textContent = hasJustification ? `¡Correcto! ${q.justification}` : "¡Correcto!";
    feedback.className = "feedback correct";
  } else {
    buttons[selectedIndex].classList.add('incorrect');
    buttons[q.correct].classList.add('correct');
    const correctLetter = String.fromCharCode(65 + q.correct);
    feedback.textContent = hasJustification
      ? `Incorrecto. La respuesta correcta es la opción ${correctLetter}). Justificación: ${q.justification}`
      : `Incorrecto. La respuesta correcta es la opción ${correctLetter}).`;
    feedback.className = "feedback incorrect";
  }

  updateStats();
}

function updateStats() {
  const progressEl = document.getElementById('progress');
  const accuracyEl = document.getElementById('accuracy');
  const scoreEl = document.getElementById('score');

  if (progressEl) progressEl.textContent = `📝 ${answeredCount}/${activeData.length}`;

  const accuracyPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  if (accuracyEl) accuracyEl.textContent = `🎯 ${accuracyPct}%`;

  const numericScore = activeData.length > 0 ? (correctCount / activeData.length) * 10 : 0;
  if (scoreEl) scoreEl.textContent = `⭐ ${numericScore.toFixed(2)}/10`;

  if (answeredCount > 0 && answeredCount === activeData.length) {
    saveTestResults(numericScore);
  }
}

window.resetQuiz = function() {
  answeredCount = 0;
  correctCount = 0;
  secondsElapsed = 0;
  window.testSavedForThisSession = false;

  startTimer();
  renderQuiz();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

async function saveTestResults(scoreNum) {
  if (window.testSavedForThisSession || !currentUserUid || !topicId) return;
  window.testSavedForThisSession = true;

  try {
    const topicRef = ref(db, `usuarios/${currentUserUid}/progress/${topicId}`);
    const snapshot = await get(topicRef);
    const data = snapshot.val() || {};

    const newAttempts = (data.attempts || 0) + 1;
    const currentBest = data.bestScore || 0;
    const newBest = Math.max(currentBest, parseFloat(scoreNum.toFixed(1)));

    await set(topicRef, {
      attempts: newAttempts,
      bestScore: newBest
    });
  } catch (e) {
    console.error("Error guardando en Firebase:", e);
  }
}

window.resetTopicStats = async function() {
  if (!currentUserUid || !topicId) return;
  if (confirm(`¿Quieres borrar los intentos y la nota máxima del Tema ${topicId} en la nube?`)) {
    try {
      const topicRef = ref(db, `usuarios/${currentUserUid}/progress/${topicId}`);
      await remove(topicRef);
      alert('Progreso borrado en la nube.');
      location.reload();
    } catch (e) {
      alert('Error al intentar borrar el progreso.');
    }
  }
};

// Inicializar
window.changeBlock();