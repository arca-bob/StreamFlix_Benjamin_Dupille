//definition des options nécessaire pour appeler l'api
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    Authorization: 'Bearer   eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlNGI5MDMyNzIyN2M4OGRhYWMxNGMwYmQwYzFmOTNjZCIsIm5iZiI6MTc1ODY0ODMyMS43NDg5OTk4LCJzdWIiOiI2OGQyZDgwMTJhNWU3YzBhNDVjZWNmZWUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.aylEitwtAH0w4XRk8izJNNkF_bet8sxiC9iI-zSdHbU'
  }
};

const TMDB_OPTIONS = typeof options !== 'undefined' ? options : {};
// creer un cache pour eviter de reappeler l'api pour les memes requetes
const TMDB_CACHE = new Map();

// fonction pour faire les appels a l'api avec gestion du cache et du timeout
async function tmdbFetch(url, opts = TMDB_OPTIONS, timeout = 10000) {
  if (TMDB_CACHE.has(url)) return TMDB_CACHE.get(url);

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const json = await res.json();
    TMDB_CACHE.set(url, json);
    return json;
  } finally {
    clearTimeout(id);
  }
}

// function pour gerer l'ouverture et la fermeture de la modale
function createModalController(modalSelector = '#hero-modal') {
  const modal = document.querySelector(modalSelector);
  if (!modal) throw new Error('Modal element not found');

  const overlay = modal.querySelector('.hero-modal__overlay');
  const closeBtn = modal.querySelector('.hero-modal__close');
  const contentSelectors = {
    title: modal.querySelector('#hero-modal-title'),
    date: modal.querySelector('#hero-modal-date'),
    desc: modal.querySelector('#hero-modal-desc'),
    img: modal.querySelector('#hero-modal-img')
  };

  const mainRoots = [...document.querySelectorAll('header, main, footer')];
  let lastFocused = null;
  let releaseTrap = null;

  // fonction pour gerer l'accessibilité en cachant le contenu principal quand la modale est ouverte
  const setPageHidden = (hidden) => {
    mainRoots.forEach(el => el.setAttribute('aria-hidden', hidden ? 'true' : 'false'));
    modal.setAttribute('aria-hidden', hidden ? 'false' : 'true');
    if (hidden) modal.setAttribute('aria-modal', 'true');
    else modal.removeAttribute('aria-modal');
  };
// Permet de garder le focus dans la modale quand elle est ouverte
  const trapFocus = () => {
    const focusable = modal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return () => { };
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  };

  function open() {
    lastFocused = document.activeElement;
    setPageHidden(true);
    releaseTrap = trapFocus();
    const firstFocus = modal.querySelector('button, [tabindex], a, input') || modal;
    firstFocus.focus();
    document.body.style.overflow = 'hidden';
  }

  function close() {
    setPageHidden(false);
    releaseTrap?.();
    lastFocused?.focus();
    document.body.style.overflow = '';
  }

  overlay?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);

  //Permet de remplir dynamiquement le modale
  return {
    setContent: (item = {}) => {
      const path = item?.backdrop_path ?? item?.poster_path;
      contentSelectors.title.textContent = item?.title ?? item?.name ?? 'Titre non disponible';
      contentSelectors.date.textContent = item?.release_date ? `Date de parution: ${item.release_date}` : 'Date de parution: N/A';
      contentSelectors.desc.textContent = item?.overview ?? 'Description non disponible.';
      contentSelectors.img.src = path ? `https://image.tmdb.org/t/p/original${path}` : './image/black.jpg';
      contentSelectors.img.alt = item?.title ?? item?.name ?? 'Affiche';
    },
    open,
    close
  };
}
// Permet de creer dynamiquement les articles pour chaque film
function createPosterArticle({ src, alt, titleText, item, onClick, onTrailer }) {
  const article = document.createElement('article');
  article.className = 'card';
  article.setAttribute('role', 'article');
  article.setAttribute('aria-label', titleText ?? 'Film');
  // Permet de creer l'image uniquement si elle existe
  if (src) {
    const img = document.createElement('img');
    img.className = 'poster';
    img.src = src;
    img.alt = alt ?? titleText ?? 'Affiche';
    article.appendChild(img);
  } else {
    article.classList.add('no-poster');
  }

  const titleOverlay = document.createElement('div');
  titleOverlay.className = 'card-title-overlay';
  titleOverlay.textContent = titleText ?? 'Titre non disponible';
  article.appendChild(titleOverlay);

  //Permet de gerer le click sur le film et ouvre la modale trailer
  if (onTrailer && typeof onTrailer === 'function') {
    article.addEventListener('click', () => onTrailer(item));
  }

  return article;
}

// Permet de charger les films dans les sections correspondantes
async function loadList({ url, containerSelector, sliceRange = [0, 10], imgBase = 'https://image.tmdb.org/t/p/w342', modalController, trailerController }) {
  try {
    const data = await tmdbFetch(url);
    const items = data.results ?? [];
    if (!items.length) return;

    const container = document.querySelector(containerSelector);
    if (!container) return;
    const frag = document.createDocumentFragment();
    //Pour chaque film recupère le titre et l'image
    items.slice(...sliceRange).forEach(item => {
      const poster = item.poster_path ?? item.backdrop_path;
      const src = poster ? `${imgBase}${poster}` : null;
      const title = item.title ?? item.name ?? 'Titre non disponible';
    // Permet de récupérer la bande annonce du film
      const onTrailer = async (film) => {
        const type = film.media_type || (film.title ? 'movie' : 'tv');
        const videoUrl = `https://api.themoviedb.org/3/${type}/${film.id}/videos?language=en-US`;
        const videoData = await tmdbFetch(videoUrl);
        const trailer = (videoData.results ?? []).find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.key);
        trailerController.open(trailer?.key || null, film); 
      };
    //Creer la carte du film
      const article = createPosterArticle({
        src,
        alt: `${title} - poster`,
        titleText: title,
        item,
        onTrailer
      });
      frag.appendChild(article);
    });

    container.appendChild(frag);
  } catch (err) {
    console.error(`Erreur loadList [${containerSelector}] :`, err);
  }
}
  //Permet d'afficher l'image et le titre du film dans la section hero
function buildHero({ item, imgId, titleId, infoBtnSelector, modalController, pathBase = 'https://image.tmdb.org/t/p/original', playBtnSelector, trailerController }) {
  if (!item) return;
  const path = item.backdrop_path ?? item.poster_path;
  const imgEl = document.getElementById(imgId);
  if (imgEl && path) {
    imgEl.src = `${pathBase}${path}`;
    imgEl.alt = item.title ?? item.name ?? 'Hero image';
  }
  const titleEl = document.getElementById(titleId);
  if (titleEl) titleEl.textContent = item.title ?? item.name ?? 'Titre non disponible';
  // Permet de faire en sorte que le bouton renvoie le modale avec les infos du film
  const infoBtn = document.querySelector(infoBtnSelector);
  if (modalController && infoBtn) {
    infoBtn.onclick = () => {
      modalController.setContent(item);
      modalController.open();
    };
  }
}
//Fonction principale qui creer les controleurs de modale et charge les listes de films.
//selectionne les films a afficher dans la section hero
//affiche les héros et charge les differentes sections de films
async function initApp() {
  const modalController = createModalController('#hero-modal');
  const trailerController = createTrailerModalController('#trailer-modal');

  try {
    const [popularJson, topRatedJson, tvTopJson] = await Promise.all([
      tmdbFetch('https://api.themoviedb.org/3/movie/popular?language=en-US&page=1'),
      tmdbFetch('https://api.themoviedb.org/3/movie/top_rated?language=en-US&page=1'),
      tmdbFetch('https://api.themoviedb.org/3/tv/top_rated?language=en-US&page=1')
    ]);

    const popularFirst = (popularJson.results ?? [])[0];
    const topRatedItem = (topRatedJson.results ?? [])[15] ?? (topRatedJson.results ?? [])[0];
    const tvFirst = (tvTopJson.results ?? [])[0];

    buildHero({
      item: popularFirst,
      imgId: 'heroImg',
      titleId: 'first-film',
      infoBtnSelector: '#Info_button_hero',
      playBtnSelector: '#Play_button_hero',
      modalController,
      trailerController
    });
    buildHero({
      item: topRatedItem,
      imgId: 'top-img',
      titleId: 'Rated_movie',
      infoBtnSelector: '#Info_button_top',
      playBtnSelector: '#Play_button_top',
      modalController,
      trailerController
    });
    buildHero({
      item: tvFirst,
      imgId: 'serie-img',
      titleId: 'first-serie',
      infoBtnSelector: '#Info_button_serie',
      playBtnSelector: '#Play_button_serie',
      modalController,
      trailerController
    });

  } catch (err) {
    console.error('Erreur lors du chargement des héros:', err);
  }
  loadList({ url: 'https://api.themoviedb.org/3/movie/popular?language=en-US&page=1', containerSelector: '.films-section', sliceRange: [1, 11], modalController, trailerController });
  loadList({ url: 'https://api.themoviedb.org/3/trending/tv/day?language=en-US', containerSelector: '.TV_Show', sliceRange: [1, 11], modalController, trailerController });
  loadList({ url: 'https://api.themoviedb.org/3/movie/upcoming?language=en-US&page=1', containerSelector: '.To_Come', sliceRange: [2, 12], modalController, trailerController });
  loadList({ url: 'https://api.themoviedb.org/3/movie/top_rated?language=en-US&page=1', containerSelector: '.top_rated', sliceRange: [0, 14], modalController, trailerController });
  loadList({ url: 'https://api.themoviedb.org/3/tv/top_rated?language=en-US&page=1', containerSelector: '.serie', sliceRange: [1, 33], modalController, trailerController });
}



//lance l'application une fois le DOM chargé
document.addEventListener('DOMContentLoaded', () => {
  initApp();
//recherche dynamique des films
  const searchInput = document.getElementById('search');
  //ecoute les entrées dans la barre de recherche
  if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
      const query = e.target.value.trim();

      const containers = [
        '.films-section',
        '.TV_Show',
        '.To_Come',
        '.top_rated',
        '.serie'
      ];
      containers.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.innerHTML = '';
      });
    //Recharge les films si la recherche est trop courte
      if (query.length < 2) {
        initApp();
        return;
      }
    //charge les films, serie correspondant à la recherche et leurs modales
      const modalController = createModalController('#hero-modal');
      const trailerController = createTrailerModalController('#trailer-modal');
    
      const filmUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`;
      await loadList({ url: filmUrl, containerSelector: '.films-section', sliceRange: [0, 10], modalController, trailerController });
      await loadList({ url: filmUrl, containerSelector: '.To_Come', sliceRange: [0, 10], modalController, trailerController });
      await loadList({ url: filmUrl, containerSelector: '.top_rated', sliceRange: [0, 10], modalController, trailerController });

      const serieUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}&language=en-US&page=1`;
      await loadList({ url: serieUrl, containerSelector: '.TV_Show', sliceRange: [0, 10], modalController, trailerController });
      await loadList({ url: serieUrl, containerSelector: '.serie', sliceRange: [0, 10], modalController, trailerController });
    });
  }
});

//Gère le scroll de la nav barre, permet de changer le style
const nav = document.querySelector('nav');
const THRESHOLD = 60;
let ticking = false;

function update() {
  const y = window.scrollY || window.pageYOffset;
  if (y > THRESHOLD) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
  ticking = false;
}

requestAnimationFrame(update);

window.addEventListener('scroll', () => {
  if (!ticking) {
    window.requestAnimationFrame(update);
    ticking = true;
  }
}, { passive: true });

window.addEventListener('resize', () => requestAnimationFrame(update), { passive: true });

//Creer et gere le modale pour le trailer
//fonctionne de la meme manière que le modale info mais renvoie une vidéo au lieu de l'image
function createTrailerModalController(modalSelector = '#trailer-modal') {
  const modal = document.querySelector(modalSelector);
  if (!modal) throw new Error('Trailer modal not found');
  const backdrop = modal.querySelector('.trailer-modal__backdrop');
  const closeBtn = modal.querySelector('.trailer-modal__close');
  const content = modal.querySelector('.trailer-modal__content');
  const titleEl = modal.querySelector('#trailer-modal-title');
  const dateEl = modal.querySelector('#trailer-modal-date');
  const descEl = modal.querySelector('#trailer-modal-desc');

  function open(youtubeKey, item) {
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    titleEl.textContent = item?.title ?? item?.name ?? 'Titre non disponible';
    dateEl.textContent = item?.release_date
      ? `Date de parution: ${item.release_date}`
      : 'Date de parution: N/A';
    descEl.textContent = item?.overview ?? 'Description non disponible.';
    // recupère la clé youtube et lance la vidéo
    content.innerHTML = youtubeKey
      ? `<iframe src="https://www.youtube.com/embed/${youtubeKey}?autoplay=1" allowfullscreen></iframe>
         <p style="color:#fff;text-align:center;font-size:0.9em;">Si la vidéo ne s'affiche pas ou affiche une erreur, la bande-annonce n'est pas disponible.</p>`
      : `<p style="color:#fff;text-align:center;">Bande-annonce non disponible.</p>`;
    closeBtn.focus();
  }
  function close() {
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    content.innerHTML = '';
    titleEl.textContent = '';
    dateEl.textContent = '';
    descEl.textContent = '';
  }
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  return { open, close };
}
