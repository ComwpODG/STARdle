/* =========================================================================
   STARDLE — a Wordle-style daily guessing game for Star Conflict ships
   =========================================================================
   All ship data lives in ships.json (same folder). This file only contains
   game logic — add ships/factions/etc. by editing ships.json, nothing here
   needs to change.

   Expected shape of ships.json:
   {
     "allColors":   [...],   // ordered low -> high, used for the ▲/▼ hint
     "allClasses":  [...],
     "allRoles":    [...],
     "allFactions": [...],
     "shipDetails": [ { name, faction, class, role, color, rank }, ... ]
   }
   ========================================================================= */

const DATA_URL = 'ships.json';
const PACIFIC_TZ = 'America/Los_Angeles';

let SHIPS = [];
let COLOR_ORDER = [];
let byNameLower = new Map();
let SECRET = null;
let state = { guesses: [], won: false };

/* ---------------------------------------------------------------------
   DOM refs
   --------------------------------------------------------------------- */
const form = document.getElementById('guessForm');
const input = document.getElementById('guessInput');
const btn = document.getElementById('guessBtn');
const errorMsg = document.getElementById('errorMsg');
const rowsBody = document.getElementById('guessRows');
const emptyState = document.getElementById('emptyState');
const guessCountEl = document.getElementById('guessCount');
const winBanner = document.getElementById('winBanner');
const dayLabel = document.getElementById('dayLabel');
const datalist = document.getElementById('shipList');

dayLabel.textContent = new Date().toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
init();

async function init(){
  input.disabled = true;
  btn.disabled = true;
  input.placeholder = 'Loading ship data…';

  let data;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    errorMsg.textContent = `Couldn't load ships.json (${err.message}). ` +
      `If you're opening this file directly, serve it over http instead ` +
      `(e.g. "python3 -m http.server"), or check GitHub Pages is enabled.`;
    input.placeholder = 'Ship data unavailable';
    return;
  }

  if (!Array.isArray(data.shipDetails) || data.shipDetails.length === 0){
    errorMsg.textContent = 'ships.json loaded but shipDetails is empty.';
    return;
  }

  SHIPS = data.shipDetails.slice().sort((a,b) => a.name.localeCompare(b.name));
  COLOR_ORDER = Array.isArray(data.allColors) ? data.allColors : [];
  byNameLower = new Map(SHIPS.map(s => [s.name.toLowerCase(), s]));

  for (const ship of SHIPS){
    const opt = document.createElement('option');
    opt.value = ship.name;
    datalist.appendChild(opt);
  }

  SECRET = SHIPS[dayIndex(SHIPS.length)];

  const STORAGE_KEY = `stardle:${pacificDateString()}`;
  state = loadState(STORAGE_KEY);
  state._storageKey = STORAGE_KEY;

  // Rehydrate any guesses made earlier today
  for (const name of state.guesses){
    const ship = byNameLower.get(name.toLowerCase());
    if (ship) renderRow(ship);
  }
  refreshMeta();
  if (state.won){
    endGame(true, /*replay*/ true);
  } else {
    input.disabled = false;
    btn.disabled = false;
    input.placeholder = "Type a ship name…";
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitGuess(input.value);
  });
}

/* ---------------------------------------------------------------------
   Daily ship selection — deterministic per calendar day (local time),
   same for everyone on a given day, like Wordle.
   --------------------------------------------------------------------- */
   
function pacificDateString(){
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()); // en-CA formats as YYYY-MM-DD
}

function dayIndex(shipCount){
  const [year, month, day] = pacificDateString().split('-').map(Number);
  // Days since a fixed epoch, purely as an incrementing counter.
  const diff = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  const seed = (year * 1000 + diff) * 2654435761 % 2147483647;
  return Math.abs(seed) % shipCount;
}

/* ---------------------------------------------------------------------
   Persistence — keep today's guesses if the page is reloaded.
   --------------------------------------------------------------------- */
function loadState(key){
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : { guesses: [], won: false };
  } catch { return { guesses: [], won: false }; }
}
function saveState(){
  try { localStorage.setItem(state._storageKey, JSON.stringify({ guesses: state.guesses, won: state.won })); } catch {}
}

/* ---------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------- */
function renderRow(ship){
  const tr = document.createElement('tr');
  tr.className = 'reveal';

  tr.appendChild(nameCell(ship.name));
  tr.appendChild(compareCell(ship.class, SECRET.class));
  tr.appendChild(compareCell(ship.role, SECRET.role));
  tr.appendChild(compareCell(ship.faction, SECRET.faction));
  tr.appendChild(compareCell(ship.color, SECRET.color, orderedArrow(ship.color, SECRET.color, COLOR_ORDER)));
  tr.appendChild(compareCell(ship.rank, SECRET.rank, rankArrow(ship.rank, SECRET.rank)));

  rowsBody.appendChild(tr);
}

function nameCell(text){
  const td = document.createElement('td');
  td.className = 'name-cell';
  td.textContent = text;
  return td;
}

function compareCell(value, secretValue, arrow){
  const td = document.createElement('td');
  const span = document.createElement('span');
  const correct = value === secretValue;
  span.className = 'cell ' + (correct ? 'correct' : 'wrong');
  span.textContent = value;
  if (!correct && arrow){
    const a = document.createElement('span');
    a.className = 'arrow';
    a.textContent = arrow;
    span.appendChild(a);
  }
  td.appendChild(span);
  return td;
}

function rankArrow(guessRank, secretRank){
  if (guessRank === secretRank) return '';
  return guessRank < secretRank ? '▲' : '▼';
}

// Generic ordered-list hint, used for Color (and reusable for anything
// else in ships.json that ships in a meaningful low->high order).
function orderedArrow(guessValue, secretValue, order){
  const gi = order.indexOf(guessValue);
  const si = order.indexOf(secretValue);
  if (gi === -1 || si === -1 || gi === si) return '';
  return gi < si ? '▲' : '▼';
}

function refreshMeta(){
  guessCountEl.textContent = state.guesses.length;
  emptyState.style.display = state.guesses.length ? 'none' : 'block';
}

function endGame(won, replay = false){
  input.disabled = true;
  btn.disabled = true;
  if (won){
    winBanner.style.display = 'block';
    winBanner.textContent = `✓ Correct! Today's ship was the ${SECRET.name}.`;
    if (!replay) fireConfetti();
  }
}

/* ---------------------------------------------------------------------
   Guessing
   --------------------------------------------------------------------- */
function submitGuess(rawName){
  const name = rawName.trim();
  if (!name) return;

  const ship = byNameLower.get(name.toLowerCase());
  if (!ship){
    errorMsg.textContent = `"${name}" isn't a recognized ship — pick one from the list.`;
    return;
  }
  if (state.guesses.some(g => g.toLowerCase() === ship.name.toLowerCase())){
    errorMsg.textContent = `You already guessed ${ship.name}.`;
    return;
  }

  errorMsg.textContent = '';
  state.guesses.push(ship.name);
  const won = ship.name === SECRET.name;
  if (won) state.won = true;
  saveState();

  renderRow(ship);
  refreshMeta();
  input.value = '';

  if (won) endGame(true);
}

/* ---------------------------------------------------------------------
   Confetti — lightweight canvas particle burst, no external libs.
   --------------------------------------------------------------------- */
function fireConfetti(){
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  function resize(){
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#4fd8ff','#39e07a','#ffd166','#ff5468','#c792ff','#ffffff'];
  const count = 160;
  const particles = Array.from({length: count}, () => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.5,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 3,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI * 2,
    vr: -0.2 + Math.random() * 0.4,
  }));

  let frame = 0;
  const maxFrames = 260;

  function tick(){
    frame++;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    for (const p of particles){
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    }
    if (frame < maxFrames){
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    }
  }
  requestAnimationFrame(tick);
}
