const breathPhase = document.getElementById("breath-phase");
const breathCaption = document.getElementById("breath-caption");
const breathRing = document.getElementById("breath-ring");
const startSessionButton = document.getElementById("start-session");
const toggleSoundButton = document.getElementById("toggle-sound");
const timerDisplay = document.getElementById("timer-display");
const timerStatus = document.getElementById("timer-status");
const timerToggle = document.getElementById("timer-toggle");
const timerReset = document.getElementById("timer-reset");
const presetButtons = document.querySelectorAll(".preset");
const mistLayer = document.getElementById("mist-layer");
const revealElements = document.querySelectorAll("[data-reveal]");
const glows = document.querySelectorAll(".background-glow");
const sessionList = document.getElementById("session-list");
const sessionEmpty = document.getElementById("session-empty");
const statTotalSessions = document.getElementById("stat-total-sessions");
const statTotalMinutes = document.getElementById("stat-total-minutes");
const statStreak = document.getElementById("stat-streak");
const authLinks = document.getElementById("auth-links");
const userProfile = document.getElementById("user-profile");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const adminBadge = document.getElementById("admin-badge");
const dashboardLink = document.getElementById("dashboard-link");
const logoutButton = document.getElementById("logout-button");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const netlifyHosted = window.location.hostname.endsWith("netlify.app");

const breathSequence = [
  { label: "Arrive", caption: "Breathe in slowly and let the body settle.", duration: 4000 },
  { label: "Notice", caption: "Stay still. Feel the mind without forcing it.", duration: 4000 },
  { label: "Release", caption: "Exhale and soften any unnecessary effort.", duration: 6000 },
];

let breathIndex = 0;
let selectedMinutes = 10;
let timeRemaining = selectedMinutes * 60;
let timerIntervalId = null;
let audioContext = null;
let noiseNode = null;
let noiseGain = null;
let bowlIntervalId = null;
let breathTimeoutId = null;
let pointerTargetX = 0;
let pointerTargetY = 0;
let pointerCurrentX = 0;
let pointerCurrentY = 0;
let currentUser = null;

function getLocalSessionKey() {
  if (!currentUser || !currentUser.email) {
    return null;
  }

  return `vtn-local-sessions:${currentUser.email.toLowerCase()}`;
}

function getLocalSessions() {
  const key = getLocalSessionKey();
  if (!key) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    const sessions = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions) {
  const key = getLocalSessionKey();
  if (!key) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(sessions));
}

function calculateLocalStats(sessions) {
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((sum, session) => sum + Math.round((session.completed || 0) / 60), 0);
  const uniqueDays = new Set(
    sessions.map((session) => new Date(session.finishedAt).toISOString().slice(0, 10))
  );

  return {
    totalSessions,
    totalMinutes,
    streak: uniqueDays.size,
  };
}

function loadLocalStatsIntoUi() {
  const stats = calculateLocalStats(getLocalSessions());
  statTotalSessions.textContent = String(stats.totalSessions);
  statTotalMinutes.textContent = String(stats.totalMinutes);
  statStreak.textContent = String(stats.streak);
}

function updateBreathGuide() {
  const phase = breathSequence[breathIndex];
  breathPhase.textContent = phase.label;
  breathCaption.textContent = phase.caption;
  breathRing.dataset.phase = phase.label.toLowerCase();

  window.clearTimeout(breathTimeoutId);
  breathTimeoutId = window.setTimeout(() => {
    breathIndex = (breathIndex + 1) % breathSequence.length;
    updateBreathGuide();
  }, phase.duration);
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderTimer() {
  timerDisplay.textContent = formatTime(timeRemaining);
}

function setPreset(minutes) {
  selectedMinutes = minutes;
  timeRemaining = minutes * 60;
  renderTimer();
  timerStatus.textContent = `A ${minutes}-minute quiet session is ready.`;

  presetButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.minutes) === minutes);
  });
}

function stopTimer() {
  window.clearInterval(timerIntervalId);
  timerIntervalId = null;
  timerToggle.textContent = "Begin";
}

function playCompletionChime() {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(392, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(261.63, audioContext.currentTime + 2.8);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 2.8);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 2.8);
}

function startTimer() {
  if (timerIntervalId) {
    stopTimer();
    timerStatus.textContent = "Session paused. Return when your attention is ready.";
    return;
  }

  timerToggle.textContent = "Pause";
  timerStatus.textContent = "Session in progress. Stay with breath, body, and surroundings.";

  timerIntervalId = window.setInterval(async () => {
    if (timeRemaining <= 1) {
      timeRemaining = 0;
      renderTimer();
      stopTimer();
      timerStatus.textContent = "Session complete. Rest in stillness for one more breath.";
      playCompletionChime();
      await saveSession(selectedMinutes, selectedMinutes * 60);
      return;
    }

    timeRemaining -= 1;
    renderTimer();
  }, 1000);
}

function resetTimer() {
  stopTimer();
  timeRemaining = selectedMinutes * 60;
  renderTimer();
  timerStatus.textContent = "Ready when you are.";
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function createNoiseBuffer() {
  const bufferSize = audioContext.sampleRate * 2;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.35;
  }

  return buffer;
}

function playSoftBowl() {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(528, audioContext.currentTime);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.03, audioContext.currentTime + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 3.8);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 3.8);
}

function startAmbientSound() {
  ensureAudioContext();

  const bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = createNoiseBuffer();
  bufferSource.loop = true;

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;

  noiseGain = audioContext.createGain();
  noiseGain.gain.value = 0.018;

  bufferSource.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(audioContext.destination);
  bufferSource.start();
  noiseNode = bufferSource;

  playSoftBowl();
  bowlIntervalId = window.setInterval(playSoftBowl, 15000);
  toggleSoundButton.textContent = "Pause ambient sound";
}

function stopAmbientSound() {
  if (noiseNode) {
    noiseNode.stop();
    noiseNode.disconnect();
    noiseNode = null;
  }

  if (noiseGain) {
    noiseGain.disconnect();
    noiseGain = null;
  }

  window.clearInterval(bowlIntervalId);
  bowlIntervalId = null;
  toggleSoundButton.textContent = "Play ambient sound";
}

function toggleAmbientSound() {
  if (noiseNode) {
    stopAmbientSound();
    return;
  }

  startAmbientSound();
}

function createMist() {
  if (prefersReducedMotion) {
    return;
  }

  for (let i = 0; i < 18; i += 1) {
    const particle = document.createElement("span");
    particle.className = "mist-particle";
    particle.style.setProperty("--size", `${40 + Math.random() * 110}px`);
    particle.style.setProperty("--opacity", `${0.12 + Math.random() * 0.2}`);
    particle.style.setProperty("--x", `${Math.random() * 100}vw`);
    particle.style.setProperty("--y", `${75 + Math.random() * 35}vh`);
    particle.style.setProperty("--drift-x", `${-10 + Math.random() * 20}vw`);
    particle.style.setProperty("--duration", `${24 + Math.random() * 18}s`);
    particle.style.setProperty("--delay", `${-Math.random() * 22}s`);
    mistLayer.appendChild(particle);
  }
}

function setupReveal() {
  if (prefersReducedMotion) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });

  revealElements.forEach((element, index) => {
    element.style.transitionDelay = `${index * 120}ms`;
    observer.observe(element);
  });
}

function animateParallax() {
  if (prefersReducedMotion) {
    return;
  }

  pointerCurrentX += (pointerTargetX - pointerCurrentX) * 0.06;
  pointerCurrentY += (pointerTargetY - pointerCurrentY) * 0.06;

  glows.forEach((glow, index) => {
    const depth = index === 0 ? 16 : -20;
    glow.style.transform = `translate3d(${pointerCurrentX * depth}px, ${pointerCurrentY * depth}px, 0)`;
  });

  breathRing.style.transform =
    `scale(0.88) translate3d(${pointerCurrentX * -10}px, ${pointerCurrentY * -10}px, 0)`;

  window.requestAnimationFrame(animateParallax);
}

function bindPointerMotion() {
  if (prefersReducedMotion) {
    return;
  }

  window.addEventListener("pointermove", (event) => {
    pointerTargetX = event.clientX / window.innerWidth - 0.5;
    pointerTargetY = event.clientY / window.innerHeight - 0.5;
  });

  window.addEventListener("pointerleave", () => {
    pointerTargetX = 0;
    pointerTargetY = 0;
  });
}

function updateHeader(user) {
  currentUser = user;

  if (user) {
    authLinks.style.display = "none";
    userProfile.style.display = "flex";
    userName.textContent = user.name;
    userAvatar.src = user.picture || "https://www.gravatar.com/avatar/?d=mp";
    userAvatar.alt = `${user.name} avatar`;
    adminBadge.style.display = user.role === "admin" ? "inline-flex" : "none";
    dashboardLink.style.display = user.role === "admin" ? "inline-flex" : "none";
    return;
  }

  authLinks.style.display = "flex";
  userProfile.style.display = "none";
  adminBadge.style.display = "none";
  dashboardLink.style.display = "none";
}

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) {
      updateHeader(null);
      return null;
    }

    const data = await response.json();
    updateHeader(data.user);
    return data.user;
  } catch {
    updateHeader(null);
    return null;
  }
}

function showSignedOutHistoryState(message) {
  statTotalSessions.textContent = "-";
  statTotalMinutes.textContent = "-";
  statStreak.textContent = "-";
  sessionEmpty.textContent = message;
  sessionEmpty.style.display = "";
  Array.from(sessionList.querySelectorAll(".session-item")).forEach((item) => item.remove());
}

async function saveSession(duration, completed) {
  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration, completed }),
    });

    if (response.status === 401) {
      timerStatus.textContent = "Sign in with Google to save completed sessions.";
      showSignedOutHistoryState("Sign in with Google to save and review your meditation history.");
      return;
    }

    if (!response.ok) {
      throw new Error("Remote session save unavailable");
    }

    await loadStats();
    await loadSessions();
  } catch (error) {
    if (currentUser && netlifyHosted) {
      const sessions = getLocalSessions();
      sessions.unshift({
        duration,
        completed,
        finishedAt: new Date().toISOString(),
      });
      saveLocalSessions(sessions.slice(0, 24));
      await loadStats();
      await loadSessions();
      timerStatus.textContent = "Session saved in your browser for this signed-in account.";
      return;
    }

    console.warn("Could not save session:", error);
  }
}

async function loadStats() {
  try {
    const response = await fetch("/api/stats");

    if (response.status === 401) {
      showSignedOutHistoryState("Sign in with Google to view your private stats and saved sessions.");
      return;
    }

    if (!response.ok) {
      throw new Error("Remote stats unavailable");
    }

    const data = await response.json();
    statTotalSessions.textContent = data.totalSessions || "0";
    statTotalMinutes.textContent = data.totalMinutes || "0";
    statStreak.textContent = data.streak || "0";
  } catch (error) {
    if (currentUser && netlifyHosted) {
      loadLocalStatsIntoUi();
      return;
    }

    console.warn("Could not load stats:", error);
  }
}

async function loadSessions() {
  try {
    const response = await fetch("/api/sessions");

    if (response.status === 401) {
      showSignedOutHistoryState("Sign in with Google to save and review your meditation history.");
      return;
    }

    if (!response.ok) {
      throw new Error("Remote sessions unavailable");
    }

    const data = await response.json();
    const sessions = data.sessions || [];

    Array.from(sessionList.querySelectorAll(".session-item")).forEach((item) => item.remove());

    if (sessions.length === 0) {
      sessionEmpty.textContent = "No sessions recorded yet. Complete a meditation to see your history.";
      sessionEmpty.style.display = "";
      return;
    }

    sessionEmpty.style.display = "none";

    sessions.forEach((session) => {
      const li = document.createElement("li");
      li.className = "session-item";

      const completedMinutes = Math.round(session.completed / 60);
      const date = new Date(session.finishedAt);
      const dateString = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timeString = date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });

      li.innerHTML = `
        <span class="session-date">${dateString} - ${timeString}</span>
        <span class="session-detail">${session.duration} min session - ${completedMinutes} min completed</span>
      `;

      sessionList.appendChild(li);
    });
  } catch (error) {
    if (currentUser && netlifyHosted) {
      const sessions = getLocalSessions();
      Array.from(sessionList.querySelectorAll(".session-item")).forEach((item) => item.remove());

      if (sessions.length === 0) {
        sessionEmpty.textContent = "No browser-saved sessions yet. Complete a meditation to build your local history.";
        sessionEmpty.style.display = "";
        return;
      }

      sessionEmpty.style.display = "none";
      sessions.forEach((session) => {
        const li = document.createElement("li");
        li.className = "session-item";

        const completedMinutes = Math.round(session.completed / 60);
        const date = new Date(session.finishedAt);
        const dateString = date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const timeString = date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });

        li.innerHTML = `
          <span class="session-date">${dateString} - ${timeString}</span>
          <span class="session-detail">${session.duration} min session - ${completedMinutes} min completed</span>
        `;

        sessionList.appendChild(li);
      });
      return;
    }

    console.warn("Could not load sessions:", error);
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/login.html?mode=login";
  }
}

startSessionButton.addEventListener("click", () => {
  setPreset(10);
  if (!timerIntervalId) {
    startTimer();
  }
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
});

toggleSoundButton.addEventListener("click", toggleAmbientSound);
timerToggle.addEventListener("click", startTimer);
timerReset.addEventListener("click", resetTimer);
logoutButton.addEventListener("click", logout);

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stopTimer();
    setPreset(Number(button.dataset.minutes));
  });
});

async function initializePage() {
  renderTimer();
  createMist();
  setupReveal();
  bindPointerMotion();
  animateParallax();
  updateBreathGuide();
  await loadCurrentUser();
  await loadStats();
  await loadSessions();
}

initializePage();
