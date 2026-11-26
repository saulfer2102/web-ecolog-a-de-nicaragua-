// Mi Primera Enciclopedia de la Naturaleza: temas, fichas, juegos, diccionario y promesa.
import { $, $$, esc, layout, url, loadData, storage, photoUrl, photoCredit, norm } from './common.js';
import { db, taxaParaEspecies } from './datos.js';

layout('ninos');

const vista = $('#vista');
let N = null;          // contenido de ninos.json
const fotos = new Map(); // especie_id -> foto iNaturalist

/* ---------------- Voz ---------------- */
let vozES = null;
function elegirVoz() {
  const voces = speechSynthesis.getVoices();
  vozES = voces.find((v) => /es[-_](419|MX|US|NI|CR|CO)/i.test(v.lang)) || voces.find((v) => /^es/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }
function leer(texto, boton) {
  if (!('speechSynthesis' in window)) return alert('Tu navegador no puede leer en voz alta.');
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); if (boton) boton.textContent = '🔊 Escuchar'; return; }
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = vozES?.lang || 'es-MX';
  if (vozES) u.voice = vozES;
  u.rate = 0.92;
  u.onend = () => { if (boton) boton.textContent = '🔊 Escuchar'; };
  if (boton) boton.textContent = '⏹️ Detener';
  speechSynthesis.speak(u);
}
const botonLeer = (id) => `<button class="k-btn alt" type="button" data-leer="${id}">🔊 Escuchar</button>`;
vista.addEventListener('click', (e) => {
  const b = e.target.closest('[data-leer]');
  if (!b) return;
  const fuente = document.getElementById(b.dataset.leer);
  if (fuente) leer(fuente.innerText, b);
});

/* ---------------- Utilidades ---------------- */
const barajar = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const fotoHTML = (especieId, emoji, size = 'medium') => {
  const p = fotos.get(especieId);
  const img = photoUrl(p, size);
  return img ? `<img src="${esc(img)}" alt="" loading="lazy" title="Foto: ${esc(photoCredit(p))}">` : `<span aria-hidden="true">${emoji || '🌿'}</span>`;
};
function pintarFotosPendientes() {
  $$('[data-k-foto]').forEach((el) => {
    const p = fotos.get(el.dataset.kFoto);
    if (p && !el.querySelector('img')) el.innerHTML = `<img src="${esc(photoUrl(p, el.dataset.size || 'medium'))}" alt="" loading="lazy" title="Foto: ${esc(photoCredit(p))}">`;
  });
}
function seleccionarTab(s) {
  $$('.k-nav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.s === s)));
}
$('.k-nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-s]'); if (!b) return;
  location.hash = b.dataset.s;
});

/* ---------------- Vistas ---------------- */
function vTemas() {
  seleccionarTab('temas');
  vista.innerHTML = `
    <h2>¿Qué quieres aprender hoy?</h2>
    <div class="k-grid">${N.temas.map((t) => `
      <button class="k-tema" style="background-color:${esc(t.color || '#2E9E5B')}" data-tema="${esc(t.id)}">
        <span class="k-emoji" aria-hidden="true">${esc(t.emoji || '🌿')}</span>
        <span><h3>${esc(t.titulo)}</h3><p>${esc(t.resumen || '')}</p></span>
      </button>`).join('')}</div>`;
  vista.querySelectorAll('[data-tema]').forEach((b) => b.addEventListener('click', () => { location.hash = `tema/${b.dataset.tema}`; }));
}

function vTema(id) {
  seleccionarTab('temas');
  const t = N.temas.find((x) => x.id === id);
  if (!t) return vTemas();
  const i = N.temas.indexOf(t);
  const sig = N.temas[(i + 1) % N.temas.length];
  vista.innerHTML = `
    <a class="k-back" href="#temas">← Todos los temas</a>
    <article class="k-panel" style="border-color:${esc(t.color)}">
      <div class="k-row" style="justify-content:space-between">
        <span style="font-size:3.4rem" aria-hidden="true">${esc(t.emoji)}</span>
        ${botonLeer('texto-tema')}
      </div>
      <div id="texto-tema">
        <h2 style="color:${esc(t.color)}">${esc(t.titulo)}</h2>
        <p><strong>${esc(t.resumen || '')}</strong></p>
        ${(t.secciones || []).map((s) => `<h3>${esc(s.titulo)}</h3><p>${esc(s.texto)}</p>`).join('')}
      </div>
      ${(t.sabias_que || []).length ? `<h3>¿Sabías que…?</h3><div class="k-bubbles">${t.sabias_que.map((x) => `<div class="k-bubble">${esc(x)}</div>`).join('')}</div>` : ''}
      ${t.actividad ? `<div class="k-actividad">${esc(t.actividad)}</div>` : ''}
    </article>
    <div class="k-row" style="margin-top:20px;justify-content:space-between">
      <a class="k-btn gris" href="#temas">← Volver</a>
      <a class="k-btn" href="#tema/${esc(sig.id)}">Siguiente: ${esc(sig.emoji)} ${esc(sig.titulo)} →</a>
    </div>`;
  scrollTo({ top: 0, behavior: 'smooth' });
}

function vFichas() {
  seleccionarTab('fichas');
  const tipos = [...new Set(N.fichas.map((f) => f.tipo))];
  vista.innerHTML = `
    <h2>Animales y plantas de Nicaragua</h2>
    <div class="k-row" style="margin-bottom:16px" id="filtro-tipo">
      <button class="k-btn sol" data-t="">Todos</button>
      ${tipos.map((t) => `<button class="k-btn gris" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
    <div class="k-grid" id="k-fichas"></div>`;
  const pintar = (tipo) => {
    $('#k-fichas').innerHTML = N.fichas.filter((f) => !tipo || f.tipo === tipo).map((f) => `
      <button class="k-ficha" data-ficha="${esc(f.id)}">
        <div class="k-foto" data-k-foto="${esc(f.especie_id)}">${fotoHTML(f.especie_id, f.emoji)}</div>
        <div class="k-nombre"><b>${esc(f.emoji)} ${esc(f.nombre)}</b><span>${esc(f.tipo)}</span></div>
      </button>`).join('');
  };
  pintar('');
  $('#filtro-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#filtro-tipo button').forEach((x) => { x.className = `k-btn ${x === b ? 'sol' : 'gris'}`; });
    pintar(b.dataset.t);
  });
}
vista.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ficha]');
  if (b) location.hash = `ficha/${b.dataset.ficha}`;
});

function vFicha(id) {
  seleccionarTab('fichas');
  const f = N.fichas.find((x) => x.id === id);
  if (!f) return vFichas();
  const p = fotos.get(f.especie_id);
  vista.innerHTML = `
    <a class="k-back" href="#fichas">← Todos los animales y plantas</a>
    <article class="k-panel">
      <div class="k-ficha-det">
        <div>
          <div class="k-big" data-k-foto="${esc(f.especie_id)}" data-size="large">${fotoHTML(f.especie_id, f.emoji, 'large')}</div>
          <div class="k-credito">${p ? `Foto: ${esc(photoCredit(p))}` : ''}</div>
        </div>
        <div>
          <div class="k-row" style="justify-content:space-between">
            <span style="font-size:.95rem;font-weight:800;color:var(--k-soft)">${esc(f.tipo)}</span>
            ${botonLeer('texto-ficha')}
          </div>
          <div id="texto-ficha">
            <h2>${esc(f.emoji)} ${esc(f.nombre)}</h2>
            <p>${esc(f.texto)}</p>
            <div class="k-datos">
              <div class="k-dato d1"><b>🏡 ¿Dónde vive?</b>${esc(f.donde_vive)}</div>
              <div class="k-dato d2"><b>🍽️ ${f.tipo === 'Planta' ? '¿Qué necesita?' : '¿Qué come?'}</b>${esc(f.que_come)}</div>
              <div class="k-dato d3"><b>💡 ¿Sabías que…?</b>${esc(f.sabias_que)}</div>
              <div class="k-dato d4"><b>🤝 ¿Cómo puedo ayudar?</b>${esc(f.como_ayudar)}</div>
            </div>
          </div>
          <p style="margin-top:16px"><a href="${url(`especie.html?id=${encodeURIComponent(f.especie_id)}`)}" style="font-size:.95rem">Ver la ficha científica completa →</a></p>
        </div>
      </div>
    </article>`;
  scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Juegos ---------------- */
function vJuegos() {
  seleccionarTab('juegos');
  const mejor = storage('ninos-quiz-mejor');
  vista.innerHTML = `
    <h2>¡A jugar y aprender!</h2>
    <div class="k-grid">
      <button class="k-tema" style="background-color:#3A86FF" data-j="quiz"><span class="k-emoji">❓</span><span><h3>Trivia de la naturaleza</h3><p>10 preguntas. ${mejor ? `Tu mejor puntaje: ${esc(mejor)}/10` : '¿Cuántas aciertas?'}</p></span></button>
      <button class="k-tema" style="background-color:#8E6CEF" data-j="adivinanzas"><span class="k-emoji">🕵️</span><span><h3>¿Quién soy?</h3><p>Adivina el animal o la planta con pistas.</p></span></button>
    </div>`;
  vista.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => { location.hash = `juegos/${b.dataset.j}`; }));
}

function vQuiz() {
  seleccionarTab('juegos');
  const preguntas = barajar(N.quiz).slice(0, 10);
  let i = 0;
  let puntos = 0;
  const paso = () => {
    if (i >= preguntas.length) return final();
    const q = preguntas[i];
    const orden = barajar(q.opciones.map((o, k) => ({ o, k })));
    vista.innerHTML = `
      <a class="k-back" href="#juegos">← Juegos</a>
      <div class="k-panel">
        <div class="k-row" style="justify-content:space-between"><b>Pregunta ${i + 1} de ${preguntas.length}</b><b>⭐ ${puntos}</b></div>
        <div class="k-progreso"><span style="width:${(i / preguntas.length) * 100}%"></span></div>
        <h2 style="font-size:1.6rem">${esc(q.pregunta)}</h2>
        <div id="ops">${orden.map(({ o, k }) => `<button class="k-quiz-op" data-k="${k}">${esc(o)}</button>`).join('')}</div>
        <div id="fb"></div>
      </div>`;
    $('#ops').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      const ok = Number(b.dataset.k) === q.correcta;
      if (ok) puntos++;
      $$('#ops button').forEach((x) => { x.disabled = true; if (Number(x.dataset.k) === q.correcta) x.classList.add('ok'); });
      if (!ok) b.classList.add('mal');
      $('#fb').innerHTML = `
        <p style="margin-top:14px;font-size:1.15rem"><b>${ok ? '¡Muy bien! 🎉' : '¡Casi! 💪'}</b> ${esc(q.explicacion || '')}</p>
        <button class="k-btn" id="sig">${i + 1 < preguntas.length ? 'Siguiente →' : 'Ver resultado 🏆'}</button>`;
      $('#sig').addEventListener('click', () => { i++; paso(); });
      $('#sig').focus();
    }, { once: true });
  };
  const final = () => {
    const prev = Number(storage('ninos-quiz-mejor') || 0);
    if (puntos > prev) storage('ninos-quiz-mejor', String(puntos));
    const estrellas = puntos >= 9 ? 3 : puntos >= 6 ? 2 : puntos >= 3 ? 1 : 0;
    const msg = ['¡Sigue explorando, cada día aprendes más!', '¡Buen trabajo, exploradora o explorador!', '¡Excelente! Sabes mucho de nuestra naturaleza.', '¡Increíble! Eres una guardiana o guardián experto.'][estrellas];
    vista.innerHTML = `
      <a class="k-back" href="#juegos">← Juegos</a>
      <div class="k-panel" style="text-align:center">
        <div class="k-estrellas">${'⭐'.repeat(estrellas)}${'☆'.repeat(3 - estrellas)}</div>
        <h2>¡Acertaste ${puntos} de ${preguntas.length}!</h2>
        <p>${msg}</p>
        <div class="k-row" style="justify-content:center"><button class="k-btn" id="otra">Jugar otra vez 🔁</button><a class="k-btn alt" href="#temas">Leer más temas 📚</a></div>
      </div>`;
    $('#otra').addEventListener('click', vQuiz);
  };
  paso();
}

function vAdivinanzas() {
  seleccionarTab('juegos');
  const lista = barajar(N.adivinanzas.filter((a) => N.fichas.some((f) => f.especie_id === a.respuesta || f.id === a.respuesta)));
  let i = 0;
  let aciertos = 0;
  const ronda = () => {
    if (i >= lista.length) {
      vista.innerHTML = `<a class="k-back" href="#juegos">← Juegos</a><div class="k-panel" style="text-align:center"><h2>¡Adivinaste ${aciertos} de ${lista.length}! 🕵️</h2>
        <div class="k-row" style="justify-content:center"><button class="k-btn" id="otra">Jugar otra vez</button></div></div>`;
      $('#otra').addEventListener('click', vAdivinanzas);
      return;
    }
    const a = lista[i];
    const correcta = N.fichas.find((f) => f.especie_id === a.respuesta || f.id === a.respuesta);
    const opciones = barajar([correcta, ...barajar(N.fichas.filter((f) => f !== correcta)).slice(0, 2)]);
    let pistas = 1;
    const pintar = () => {
      vista.innerHTML = `
        <a class="k-back" href="#juegos">← Juegos</a>
        <div class="k-panel">
          <div class="k-row" style="justify-content:space-between"><b>Adivinanza ${i + 1} de ${lista.length}</b><b>🕵️ ${aciertos}</b></div>
          <h2 style="font-size:1.6rem">¿Quién soy?</h2>
          ${a.pistas.slice(0, pistas).map((p, k) => `<div class="k-pista">${['1️⃣', '2️⃣', '3️⃣'][k] || '•'} ${esc(p)}</div>`).join('')}
          ${pistas < a.pistas.length ? '<button class="k-btn sol" id="mas" style="margin-top:8px">Dame otra pista 🔎</button>' : ''}
          <div class="k-opciones-fotos" id="ops">${opciones.map((f) => `
            <button data-id="${esc(f.id)}"><div class="k-foto" data-k-foto="${esc(f.especie_id)}" data-size="small">${fotoHTML(f.especie_id, f.emoji, 'small')}</div><span>${esc(f.nombre)}</span></button>`).join('')}</div>
          <div id="fb"></div>
        </div>`;
      $('#mas')?.addEventListener('click', () => { pistas++; pintar(); });
      $('#ops').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-id]'); if (!b) return;
        const ok = b.dataset.id === correcta.id;
        if (ok) aciertos++;
        $$('#ops button').forEach((x) => { x.disabled = true; x.classList.add(x.dataset.id === correcta.id ? 'ok' : 'mal'); });
        $('#mas')?.remove();
        $('#fb').innerHTML = `<p style="margin-top:14px;font-size:1.15rem"><b>${ok ? '¡Adivinaste! 🎉' : '¡Era…!'}</b> Soy ${esc(correcta.emoji)} <b>${esc(correcta.nombre)}</b>. ${esc(correcta.sabias_que || '')}</p>
          <button class="k-btn" id="sig">Siguiente →</button>`;
        $('#sig').addEventListener('click', () => { i++; ronda(); });
      }, { once: true });
    };
    pintar();
  };
  ronda();
}

/* ---------------- Diccionario ---------------- */
function vDiccionario() {
  seleccionarTab('diccionario');
  const palabras = [...N.glosario].sort((a, b) => a.palabra.localeCompare(b.palabra, 'es'));
  const letras = [...new Set(palabras.map((p) => norm(p.palabra)[0].toUpperCase()))];
  vista.innerHTML = `
    <h2>Mi diccionario de la naturaleza</h2>
    <input class="k-input" id="dq" type="search" placeholder="Busca una palabra…" aria-label="Buscar palabra">
    <div class="k-letras" id="letras"><button aria-pressed="true" data-l="">Todas</button>${letras.map((l) => `<button aria-pressed="false" data-l="${l}">${l}</button>`).join('')}</div>
    <div class="k-glos" id="glos"></div>`;
  let letra = '';
  const pintar = () => {
    const q = norm($('#dq').value);
    $('#glos').innerHTML = palabras.filter((p) => (!letra || norm(p.palabra)[0].toUpperCase() === letra) && (!q || norm(p.palabra + ' ' + p.definicion).includes(q)))
      .map((p) => `<div><b>${esc(p.palabra)}</b>${esc(p.definicion)}</div>`).join('') || '<p>No encontramos esa palabra.</p>';
  };
  pintar();
  $('#dq').addEventListener('input', pintar);
  $('#letras').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    letra = b.dataset.l; $$('#letras button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); pintar();
  });
}

/* ---------------- Promesa ---------------- */
function vPromesa() {
  seleccionarTab('promesa');
  let marcadas = [];
  try { marcadas = JSON.parse(storage('ninos-promesas') || '[]'); } catch { marcadas = []; }
  vista.innerHTML = `
    <h2>Mi promesa de Pequeña Guardiana o Pequeño Guardián de la Naturaleza</h2>
    <p>Marca las promesas que quieres cumplir. ¡Cuando tengas al menos cinco, podrás imprimir tu certificado!</p>
    <div id="promesas">${N.promesas.map((p, i) => `<label class="k-promesa"><input type="checkbox" data-i="${i}" ${marcadas.includes(i) ? 'checked' : ''}> <span>${esc(p)}</span></label>`).join('')}</div>
    <div class="k-panel k-no-print" style="margin-top:20px">
      <label for="nombre-cert"><b>Escribe tu nombre:</b></label><br>
      <input class="k-input" id="nombre-cert" maxlength="40" value="${esc(storage('ninos-nombre') || '')}" placeholder="Tu nombre">
      <div class="k-row" style="margin-top:12px"><button class="k-btn" id="ver-cert">Ver mi certificado 🏅</button></div>
    </div>
    <div id="cert"></div>`;
  $('#promesas').addEventListener('change', (e) => {
    const i = Number(e.target.dataset.i);
    marcadas = e.target.checked ? [...new Set([...marcadas, i])] : marcadas.filter((x) => x !== i);
    storage('ninos-promesas', JSON.stringify(marcadas));
  });
  $('#ver-cert').addEventListener('click', () => {
    const nombre = $('#nombre-cert').value.trim();
    storage('ninos-nombre', nombre);
    if (marcadas.length < 5) { $('#cert').innerHTML = `<p class="k-pista">Te faltan ${5 - marcadas.length} promesas para tu certificado. ¡Tú puedes! 💪</p>`; return; }
    const hoy = new Date().toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#cert').innerHTML = `
      <div class="k-cert">
        <div style="font-size:3rem">🌳🐢🦜</div>
        <h2>Certificado de Guardián de la Naturaleza</h2>
        <p>Se otorga con orgullo a</p>
        <div class="k-cert-nombre">${esc(nombre || '________________')}</div>
        <p>por prometer cuidar los animales, las plantas, el agua y los bosques de Nicaragua.</p>
        <ul style="text-align:left;display:inline-block;font-size:1rem">${marcadas.sort((a, b) => a - b).map((i) => `<li>${esc(N.promesas[i])}</li>`).join('')}</ul>
        <p style="font-size:.95rem;margin-top:10px">${hoy}</p>
      </div>
      <div class="k-row k-no-print" style="justify-content:center;margin-top:14px"><button class="k-btn sol" onclick="window.print()">🖨️ Imprimir</button></div>`;
    $('#cert').scrollIntoView({ behavior: 'smooth' });
  });
}

/* ---------------- Enrutador ---------------- */
function ruta() {
  if (!N) return;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const [s, id] = (location.hash.replace(/^#/, '') || 'temas').split('/');
  if (s === 'tema' && id) vTema(id);
  else if (s === 'fichas') vFichas();
  else if (s === 'ficha' && id) vFicha(id);
  else if (s === 'juegos' && id === 'quiz') vQuiz();
  else if (s === 'juegos' && id === 'adivinanzas') vAdivinanzas();
  else if (s === 'juegos') vJuegos();
  else if (s === 'diccionario') vDiccionario();
  else if (s === 'promesa') vPromesa();
  else vTemas();
  pintarFotosPendientes();
}
addEventListener('hashchange', ruta);

vista.innerHTML = '<p>Cargando… 🌱</p>';
loadData('ninos.json').then(async (d) => {
  N = { temas: [], fichas: [], glosario: [], quiz: [], adivinanzas: [], promesas: [], ...d };
  ruta();
  try {
    const D = await db();
    const especies = N.fichas.map((f) => D.especie(f.especie_id)).filter(Boolean);
    await taxaParaEspecies(especies, (sid, t) => {
      if (t?.default_photo) { fotos.set(sid, t.default_photo); pintarFotosPendientes(); }
    });
  } catch (e) { console.warn(e); }
}).catch(() => { vista.innerHTML = '<p>No se pudo cargar la enciclopedia. 😢</p>'; });
