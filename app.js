/* ══════════════════════════════════════════════════
   CHRONOS RSS - MAIN CONTROLLER (JavaScript Engine)
   ══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // --- CONFIGURACIÓN Y ESTADO ---
  const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://thingproxy.freeboard.io/fetch/'
  ];

  let state = {
    feeds: [],           // Suscripciones: {url, nombre, categoria}
    articles: [],        // Artículos en caché: {id, title, link, excerpt, content, date, feedUrl, read, starred}
    activeFeed: 'all',   // 'all', 'unread', 'starred', o una URL de feed específica
    activeArticleId: null,
    searchQuery: '',
    theme: 'light'
  };

  // --- SELECTORES DOM ---
  const DOM = {
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    currentDateDisplay: document.getElementById('current-date-display'),
    feedList: document.getElementById('feed-list-container'),
    articlesContainer: document.getElementById('articles-container'),
    articlesCountText: document.getElementById('articles-count-text'),
    articleReader: document.getElementById('pane-article-reader'),
    focusedArticleWrapper: document.getElementById('focused-article-wrapper'),
    readerScroll: document.getElementById('reader-content-scroll'),
    closeReaderBtn: document.getElementById('close-reader-btn'),
    starArticleBtn: document.getElementById('star-article-btn'),
    shareArticleBtn: document.getElementById('share-article-btn'),
    externalLinkBtn: document.getElementById('external-link-btn'),
    searchInput: document.getElementById('search-input'),
    markAllReadBtn: document.getElementById('mark-all-read-btn'),
    addFeedTrigger: document.getElementById('add-feed-trigger'),
    addFeedPopover: document.getElementById('add-feed-popover'),
    addFeedForm: document.getElementById('add-feed-form'),
    addFeedCancel: document.getElementById('add-feed-cancel'),
    feedUrlInput: document.getElementById('feed-url-input'),
    feedNameInput: document.getElementById('feed-name-input'),
    feedCatInput: document.getElementById('feed-cat-input'),
    categoriesDatalist: document.getElementById('categories-datalist'),
    categoryFilters: document.getElementById('category-filters'),
    mobileNavItems: document.querySelectorAll('.mobile-nav-item'),
    mobileAddFeedBtn: document.getElementById('mobile-add-feed-btn'),
    panes: document.querySelectorAll('.pane'),
    articlesScroll: document.getElementById('articles-scroll-container')
  };

  // --- INICIALIZADORES ---

  // 1. Mostrar fecha actual
  function initDate() {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    DOM.currentDateDisplay.textContent = new Date().toLocaleDateString('es-ES', opciones);
  }

  // 2. Lenis Smooth Scroll
  let lenis;
  function initLenis() {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      infinite: false
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  // 3. Cargar Tema (Claro/Oscuro)
  function initTheme() {
    const savedTheme = localStorage.getItem('chronos-theme') || 'light';
    setTheme(savedTheme);

    DOM.themeToggleBtn.addEventListener('click', () => {
      const targetTheme = state.theme === 'light' ? 'dark' : 'light';
      setTheme(targetTheme);
    });
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chronos-theme', theme);
  }

  // 4. Cargar Fuentes por defecto y caché local
  async function initData() {
    // Cargar feeds de localStorage o de feeds-default.json
    const savedFeeds = localStorage.getItem('chronos-feeds');
    if (savedFeeds) {
      state.feeds = JSON.parse(savedFeeds);
    } else {
      try {
        const response = await fetch('./feeds-default.json');
        state.feeds = await response.json();
        saveFeedsToStorage();
      } catch (err) {
        console.warn('No se pudo cargar feeds-default.json, inicializando vacío.', err);
        state.feeds = [];
      }
    }

    // Cargar artículos e historial
    const savedArticles = localStorage.getItem('chronos-articles');
    if (savedArticles) {
      state.articles = JSON.parse(savedArticles);
    }

    // Renderizar fuentes y artículos cacheados inmediatamente
    renderFeeds();
    renderArticles();
    updateCategoriesDatalist();

    // Sincronizar con la red de forma asíncrona
    syncAllFeeds();
  }

  // --- LÓGICA DE ALMACENAMIENTO ---

  function saveFeedsToStorage() {
    localStorage.setItem('chronos-feeds', JSON.stringify(state.feeds));
  }

  function saveArticlesToStorage() {
    // Para no exceder la cuota de localStorage (5MB), guardamos máximo los 40 artículos más recientes por feed
    const grouped = {};
    state.articles.forEach(art => {
      if (!grouped[art.feedUrl]) grouped[art.feedUrl] = [];
      grouped[art.feedUrl].push(art);
    });

    const optimized = [];
    Object.keys(grouped).forEach(url => {
      // Ordenar por fecha descendente
      const sorted = grouped[url].sort((a, b) => new Date(b.date) - new Date(a.date));
      // Guardar los primeros 40 de este feed, y mantener cualquiera que esté guardado (starred)
      sorted.forEach((art, index) => {
        if (index < 40 || art.starred) {
          optimized.push(art);
        }
      });
    });

    state.articles = optimized;
    localStorage.setItem('chronos-articles', JSON.stringify(state.articles));
  }

  // --- ADQUISICIÓN Y PARSEO RSS (RED) ---

  async function fetchFeedWithFallback(feedUrl) {
    let error;
    // Intentar proxies secuencialmente
    for (const proxy of PROXIES) {
      try {
        const targetUrl = proxy + encodeURIComponent(feedUrl);
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const text = await res.text();
        if (text && text.trim().startsWith('<') || text.includes('rss') || text.includes('xml')) {
          return text; // Contenido XML válido
        }
        // Si allorigins retorna JSON envoltura
        if (proxy.includes('allorigins') && text.startsWith('{')) {
          const json = JSON.parse(text);
          if (json.contents) return json.contents;
        }
      } catch (err) {
        error = err;
        console.warn(`Falló proxy ${proxy} para URL: ${feedUrl}. Intentando el siguiente...`, err);
      }
    }
    throw error || new Error('Todos los proxies CORS fallaron.');
  }

  function parseRSS(xmlText, feedUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    
    // Validar error de parseo
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Error al parsear el XML del feed.');
    }

    const items = [];
    
    // Soporte RSS
    const rssItems = doc.querySelectorAll('item');
    if (rssItems.length > 0) {
      rssItems.forEach(item => {
        const title = item.querySelector('title')?.textContent || 'Sin título';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const content = item.querySelector('encoded')?.textContent || description;
        const pubDateStr = item.querySelector('pubDate')?.textContent || '';
        const guid = item.querySelector('guid')?.textContent || link;

        items.push({
          id: guid,
          title,
          link,
          excerpt: cleanSnippet(description),
          content: content,
          originalContent: content,
          date: pubDateStr ? new Date(pubDateStr).toISOString() : new Date().toISOString(),
          feedUrl,
          read: false,
          starred: false
        });
      });
    } else {
      // Soporte Atom
      const atomEntries = doc.querySelectorAll('entry');
      atomEntries.forEach(entry => {
        const title = entry.querySelector('title')?.textContent || 'Sin título';
        
        let link = '';
        const linkElem = entry.querySelector('link[rel="alternate"]') || entry.querySelector('link');
        if (linkElem) {
          link = linkElem.getAttribute('href') || linkElem.textContent || '';
        }

        const summary = entry.querySelector('summary')?.textContent || '';
        const content = entry.querySelector('content')?.textContent || summary;
        const updatedStr = entry.querySelector('updated')?.textContent || entry.querySelector('published')?.textContent || '';
        const id = entry.querySelector('id')?.textContent || link;

        items.push({
          id,
          title,
          link,
          excerpt: cleanSnippet(summary),
          content: content,
          originalContent: content,
          date: updatedStr ? new Date(updatedStr).toISOString() : new Date().toISOString(),
          feedUrl,
          read: false,
          starred: false
        });
      });
    }

    return items;
  }

  function cleanSnippet(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || '';
    return text.substring(0, 160).trim() + (text.length > 160 ? '...' : '');
  }

  // --- MOTOR DE TRADUCCIÓN ---
  async function translateText(text, sourceLang = 'auto', targetLang = 'es') {
    if (!text || text.trim() === '') return '';
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data && data[0]) {
        return data[0].map(segment => segment[0] || '').join('');
      }
      return text;
    } catch (err) {
      console.warn('Error en la traducción automática:', err);
      return text;
    }
  }

  async function translateArticleBody(container, originalHtml, articleId) {
    // Seleccionar todos los elementos de texto legibles
    const elements = container.querySelectorAll('p, h1, h2, h3, h4, li');
    if (elements.length === 0) return;

    // Agregar barra de progreso
    const statusBar = document.createElement('div');
    statusBar.className = 'translation-status-bar';
    statusBar.innerHTML = `<span class="spinner"></span> Traduciendo párrafos... (0/${elements.length})`;
    container.prepend(statusBar);

    let translatedCount = 0;
    for (const elem of elements) {
      const originalText = elem.innerText.trim();
      if (originalText.length > 0) {
        elem.classList.add('translation-shimmer');
        const translation = await translateText(originalText, 'auto', 'es');
        elem.innerText = translation;
        elem.classList.remove('translation-shimmer');
        elem.classList.add('fade-in');
      }
      translatedCount++;
      statusBar.innerHTML = `<span class="spinner"></span> Traduciendo párrafos... (${translatedCount}/${elements.length})`;
    }

    statusBar.innerHTML = `✓ Traducido al español exitosamente.`;
    setTimeout(() => {
      if (statusBar.parentNode) statusBar.remove();
    }, 3000);

    // Guardar en la caché del artículo para que no tenga que re-traducirse al abrirse de nuevo
    const art = state.articles.find(a => a.id === articleId);
    if (art) {
      art.content = container.innerHTML;
      art.contentTranslated = true;
      saveArticlesToStorage();
    }
  }

  // Sincronizar un feed específico
  async function syncFeed(feed) {
    try {
      const xmlText = await fetchFeedWithFallback(feed.url);

      // Detectar idioma si no está definido (para nuevos feeds)
      if (!feed.lang) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(xmlText, 'text/xml');
          let detectedLang = 'en'; // por defecto
          const langElem = doc.querySelector('channel > language') || doc.querySelector('feed > language') || doc.querySelector('language');
          if (langElem && langElem.textContent) {
            detectedLang = langElem.textContent.trim().split('-')[0].toLowerCase();
          } else {
            const feedElem = doc.querySelector('feed');
            if (feedElem && feedElem.getAttribute('xml:lang')) {
              detectedLang = feedElem.getAttribute('xml:lang').trim().split('-')[0].toLowerCase();
            }
          }
          feed.lang = detectedLang;
          saveFeedsToStorage();
          renderFeeds();
        } catch (e) {
          feed.lang = 'en';
        }
      }

      const parsedItems = parseRSS(xmlText, feed.url);
      const isForeign = feed.lang && feed.lang !== 'es';
      
      // Combinar con artículos existentes sin sobreescribir el estado leído/guardado
      let nuevosContador = 0;
      
      for (const item of parsedItems) {
        const index = state.articles.findIndex(a => a.id === item.id);
        if (index === -1) {
          if (isForeign) {
            item.title = await translateText(item.title, feed.lang, 'es');
            item.excerpt = await translateText(item.excerpt, feed.lang, 'es');
            item.translated = true;
          }
          state.articles.push(item);
          nuevosContador++;
        } else {
          // Si ya existe pero no se ha traducido
          const current = state.articles[index];
          if (isForeign && !current.translated) {
            item.title = await translateText(item.title, feed.lang, 'es');
            item.excerpt = await translateText(item.excerpt, feed.lang, 'es');
            item.translated = true;
          } else if (isForeign && current.translated) {
            // Mantener traducción existente
            item.title = current.title;
            item.excerpt = current.excerpt;
            item.translated = true;
          }
          state.articles[index] = { 
            ...item, 
            read: current.read, 
            starred: current.starred,
            contentTranslated: current.contentTranslated,
            originalContent: current.originalContent || item.originalContent
          };
        }
      }

      console.log(`Feed "${feed.nombre}" sincronizado. +${nuevosContador} nuevos.`);
      saveArticlesToStorage();
      renderArticles();
      renderFeeds();
    } catch (err) {
      console.error(`Error al sincronizar feed: ${feed.nombre}`, err);
    }
  }

  // Sincronizar todos
  async function syncAllFeeds() {
    document.getElementById('status-indicator').textContent = 'Sincronizando...';
    document.getElementById('status-indicator').style.color = 'var(--accent-purple)';

    const promesas = state.feeds.map(feed => syncFeed(feed));
    await Promise.allSettled(promesas);

    document.getElementById('status-indicator').textContent = 'Sincronizado';
    document.getElementById('status-indicator').style.color = '';
  }

  // --- LÓGICA DE RENDERIZADO UI ---

  // Renderizar columna de feeds (fuentes)
  function renderFeeds() {
    DOM.feedList.innerHTML = '';

    // Opción: Todos los artículos
    const itemAll = document.createElement('li');
    itemAll.className = `feed-item ${state.activeFeed === 'all' ? 'active' : ''}`;
    itemAll.innerHTML = `
      <div class="feed-item-info">
        <span class="feed-item-title">Todas las lecturas</span>
        <span class="feed-item-meta mono-text">TODAS LAS FUENTES</span>
      </div>
      ${getUnreadCountGlobal() > 0 ? `<span class="feed-unread-badge">${getUnreadCountGlobal()}</span>` : ''}
    `;
    itemAll.addEventListener('click', () => changeActiveFeed('all'));
    DOM.feedList.appendChild(itemAll);

    // Listar categorías agrupadas de suscripciones
    state.feeds.forEach(feed => {
      const unreadCount = getUnreadCountForFeed(feed.url);
      const li = document.createElement('li');
      li.className = `feed-item ${state.activeFeed === feed.url ? 'active' : ''}`;
      li.innerHTML = `
        <div class="feed-item-info">
          <span class="feed-item-title">${feed.nombre}</span>
          <span class="feed-item-meta mono-text">${feed.categoria.toUpperCase()}</span>
        </div>
        ${unreadCount > 0 ? `<span class="feed-unread-badge">${unreadCount}</span>` : ''}
        <button class="feed-item-delete" title="Eliminar suscripción">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      `;

      // Evento de selección de feed
      li.addEventListener('click', (e) => {
        if (e.target.closest('.feed-item-delete')) {
          e.stopPropagation();
          eliminarFeed(feed.url);
        } else {
          changeActiveFeed(feed.url);
        }
      });

      DOM.feedList.appendChild(li);
    });
  }

  // Renderizar columna central (artículos)
  function renderArticles() {
    DOM.articlesContainer.innerHTML = '';

    // Filtrado de artículos
    let filtered = [...state.articles];

    // 1. Filtrado por Pestaña/Feed
    if (state.activeFeed === 'unread') {
      filtered = filtered.filter(a => !a.read);
    } else if (state.activeFeed === 'starred') {
      filtered = filtered.filter(a => a.starred);
    } else if (state.activeFeed !== 'all') {
      filtered = filtered.filter(a => a.feedUrl === state.activeFeed);
    }

    // 2. Filtrado por barra de búsqueda
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.title.toLowerCase().includes(q) || 
        a.excerpt.toLowerCase().includes(q) ||
        (getFeedName(a.feedUrl) || '').toLowerCase().includes(q)
      );
    }

    // Ordenar artículos por fecha descendente
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    DOM.articlesCountText.textContent = `${filtered.length} artículos`;

    if (filtered.length === 0) {
      DOM.articlesContainer.innerHTML = `
        <div class="reader-placeholder">
          <div class="placeholder-crest serif-text">✍</div>
          <p>No hay artículos que coincidan con los filtros seleccionados.</p>
        </div>
      `;
      return;
    }

    // Dibujar tarjetas
    filtered.forEach(art => {
      const feedName = getFeedName(art.feedUrl);
      const card = document.createElement('article');
      card.className = `article-card ${art.read ? 'read' : ''} ${state.activeArticleId === art.id ? 'active' : ''}`;
      
      const readableDate = new Date(art.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });

      card.innerHTML = `
        <div class="article-card-header">
          <span class="article-card-source mono-text">${feedName.toUpperCase()}</span>
          <span class="article-card-date mono-text">${readableDate}</span>
        </div>
        <h3 class="article-card-title serif-text">${art.title}</h3>
        <p class="article-card-excerpt">${art.excerpt}</p>
      `;

      card.addEventListener('click', () => {
        openArticle(art.id);
      });

      DOM.articlesContainer.appendChild(card);
    });
  }

  // Renderizar columna derecha (Focus Reader)
  function renderReader() {
    if (!state.activeArticleId) {
      // Estado de placeholder inicial
      DOM.focusedArticleWrapper.innerHTML = `
        <div class="reader-placeholder">
          <div class="placeholder-crest serif-text">⚔</div>
          <h2 class="serif-text">El arte de la lectura pausada</h2>
          <p>Chronos RSS filtra el ruido de los titulares redundantes y agrupa tus fuentes favoritas.</p>
          <div class="shortcut-legend mono-text">
            <p><strong>Navegación:</strong></p>
            <ul>
              <li><span class="key">J</span> / <span class="key">K</span> : Siguiente / Anterior artículo</li>
              <li><span class="key">S</span> : Guardar en favoritos</li>
              <li><span class="key">O</span> : Abrir enlace original</li>
              <li><span class="key">Esc</span> : Cerrar artículo</li>
            </ul>
          </div>
        </div>
      `;
      DOM.starArticleBtn.style.visibility = 'hidden';
      DOM.shareArticleBtn.style.visibility = 'hidden';
      DOM.externalLinkBtn.style.visibility = 'hidden';
      return;
    }

    const art = state.articles.find(a => a.id === state.activeArticleId);
    if (!art) return;

    // Hacer visibles los botones de herramientas
    DOM.starArticleBtn.style.visibility = 'visible';
    DOM.shareArticleBtn.style.visibility = 'visible';
    DOM.externalLinkBtn.style.visibility = 'visible';

    // Sincronizar estado estrella
    const starIcon = DOM.starArticleBtn.querySelector('svg');
    if (art.starred) {
      starIcon.classList.add('filled');
    } else {
      starIcon.classList.remove('filled');
    }

    DOM.externalLinkBtn.href = art.link;

    const readableDate = new Date(art.date).toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const feedName = getFeedName(art.feedUrl);
    const feed = state.feeds.find(f => f.url === art.feedUrl);
    const isForeign = feed && feed.lang && feed.lang !== 'es';

    let translationBanner = '';
    if (isForeign && !art.contentTranslated) {
      translationBanner = `
        <div class="translation-alert">
          <p class="translation-alert-text">
            💡 Este artículo fue redactado originalmente en su idioma original (${feed.lang.toUpperCase()}) y traducido en la lista. ¿Deseas traducir el cuerpo completo del artículo al español?
          </p>
          <div class="translation-alert-actions">
            <button id="translate-body-btn" class="btn-small">Traducir Cuerpo</button>
            <a href="${art.link}" target="_blank" rel="noopener" class="btn-small">Ver en la Web Original</a>
          </div>
        </div>
      `;
    } else if (isForeign && art.contentTranslated) {
      translationBanner = `
        <div class="translation-alert" style="border-style: solid; border-color: var(--border-muted);">
          <p class="translation-alert-text">
            ✓ Este artículo ha sido traducido al español.
          </p>
          <div class="translation-alert-actions">
            <button id="restore-body-btn" class="btn-small">Ver texto original</button>
            <a href="${art.link}" target="_blank" rel="noopener" class="btn-small">Ver en la Web Original</a>
          </div>
        </div>
      `;
    }

    // Sanitización muy básica para no romper nuestro layout de flex y grids
    let cleanHTML = art.content;
    // Si viene texto plano o XML escapado, asegurar saltos de línea
    if (!cleanHTML.includes('<p>') && !cleanHTML.includes('<br>')) {
      cleanHTML = cleanHTML.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('');
    }

    DOM.focusedArticleWrapper.innerHTML = `
      <div class="article-header">
        <div class="article-meta-info mono-text">
          <span class="article-meta-feed">${feedName.toUpperCase()}</span>
          <span class="article-meta-date">${readableDate}</span>
        </div>
        <h2 class="article-title-focused serif-text">${art.title}</h2>
        ${translationBanner}
      </div>
      <div class="article-content serif-text">
        ${cleanHTML}
      </div>
    `;

    // Asignar listeners del banner
    const translateBtn = DOM.focusedArticleWrapper.querySelector('#translate-body-btn');
    if (translateBtn) {
      translateBtn.addEventListener('click', async () => {
        translateBtn.disabled = true;
        const contentDiv = DOM.focusedArticleWrapper.querySelector('.article-content');
        await translateArticleBody(contentDiv, art.originalContent || art.content, art.id);
        renderReader();
      });
    }

    const restoreBtn = DOM.focusedArticleWrapper.querySelector('#restore-body-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        art.content = art.originalContent;
        art.contentTranslated = false;
        saveArticlesToStorage();
        renderReader();
      });
    }

    // Hacer scroll de lectura al tope
    DOM.readerScroll.scrollTop = 0;
  }

  // --- COMPORTAMIENTOS E INTERACCIONES ---

  function changeActiveFeed(feedUrl) {
    // Si soporta View Transitions nativas, animar transición de feeds
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        state.activeFeed = feedUrl;
        renderFeeds();
        renderArticles();
      });
    } else {
      state.activeFeed = feedUrl;
      renderFeeds();
      renderArticles();
    }

    // En móviles, volver a la vista de artículos al cambiar de feed
    if (window.innerWidth <= 900) {
      switchPane('pane-articles-list');
    }
  }

  function openArticle(id) {
    const art = state.articles.find(a => a.id === id);
    if (!art) return;

    // Marcar como leído
    art.read = true;
    state.activeArticleId = id;
    
    saveArticlesToStorage();
    renderFeeds();
    renderArticles();
    renderReader();

    // En móvil, deslizar panel del lector hacia arriba
    if (window.innerWidth <= 900) {
      DOM.articleReader.classList.add('open');
      if (lenis) lenis.stop(); // Detener smooth scroll de fondo
    }
  }

  function closeArticleReader() {
    DOM.articleReader.classList.remove('open');
    if (lenis) lenis.start(); // Reactivar smooth scroll de fondo
    state.activeArticleId = null;
    renderArticles();
  }

  function toggleStarArticle() {
    if (!state.activeArticleId) return;
    const art = state.articles.find(a => a.id === state.activeArticleId);
    if (!art) return;

    art.starred = !art.starred;
    saveArticlesToStorage();
    renderReader();
    renderArticles();
  }

  function shareArticleLink() {
    if (!state.activeArticleId) return;
    const art = state.articles.find(a => a.id === state.activeArticleId);
    if (!art) return;

    // Intentar API Web Share o copiar al portapapeles
    if (navigator.clipboard) {
      navigator.clipboard.writeText(art.link)
        .then(() => alert('¡Enlace copiado al portapapeles!'))
        .catch(() => alert('No se pudo copiar el enlace.'));
    }
  }

  function eliminarFeed(feedUrl) {
    if (confirm('¿Seguro que deseas eliminar esta suscripción?')) {
      // Eliminar de feeds
      state.feeds = state.feeds.filter(f => f.url !== feedUrl);
      saveFeedsToStorage();

      // Eliminar sus artículos
      state.articles = state.articles.filter(a => a.feedUrl !== feedUrl || a.starred); // Conservar guardados de ese feed
      saveArticlesToStorage();

      if (state.activeFeed === feedUrl) {
        state.activeFeed = 'all';
      }
      
      renderFeeds();
      renderArticles();
      updateCategoriesDatalist();
    }
  }

  function markAllAsRead() {
    let unreadCount = 0;
    state.articles.forEach(art => {
      // Si cumple el filtro del feed activo y no está leído
      if (state.activeFeed === 'all' || art.feedUrl === state.activeFeed) {
        if (!art.read) {
          art.read = true;
          unreadCount++;
        }
      }
    });

    if (unreadCount > 0) {
      saveArticlesToStorage();
      renderFeeds();
      renderArticles();
      console.log(`${unreadCount} artículos marcados como leídos.`);
    }
  }

  // --- MÓVILES: CONMUTACIÓN DE PESTAÑAS (PANES) ---
  function switchPane(targetPaneId) {
    DOM.panes.forEach(pane => {
      if (pane.id === targetPaneId) {
        pane.classList.add('active-pane');
      } else {
        pane.classList.remove('active-pane');
      }
    });

    // Sincronizar botones de barra móvil
    DOM.mobileNavItems.forEach(item => {
      if (item.dataset.target === targetPaneId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // --- ATAJOS DE TECLADO ---
  function handleKeyboardShortcuts(e) {
    // Desactivar atajos si está escribiendo en campos de texto
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const visibleCards = Array.from(DOM.articlesContainer.querySelectorAll('.article-card'));
    if (visibleCards.length === 0) return;

    // Obtener artículos visibles
    let filtered = [...state.articles];
    if (state.activeFeed === 'unread') filtered = filtered.filter(a => !a.read);
    else if (state.activeFeed === 'starred') filtered = filtered.filter(a => a.starred);
    else if (state.activeFeed !== 'all') filtered = filtered.filter(a => a.feedUrl === state.activeFeed);
    
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(a => a.title.toLowerCase().includes(q));
    }
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    const currentIndex = filtered.findIndex(a => a.id === state.activeArticleId);

    switch (e.key.toLowerCase()) {
      case 'j': // Siguiente artículo
        if (currentIndex < filtered.length - 1) {
          openArticle(filtered[currentIndex + 1].id);
        } else if (currentIndex === -1 && filtered.length > 0) {
          openArticle(filtered[0].id);
        }
        break;
      case 'k': // Artículo anterior
        if (currentIndex > 0) {
          openArticle(filtered[currentIndex - 1].id);
        }
        break;
      case 's': // Guardar/estrella
        toggleStarArticle();
        break;
      case 'o': // Abrir original
        if (state.activeArticleId) {
          const art = state.articles.find(a => a.id === state.activeArticleId);
          if (art) window.open(art.link, '_blank');
        }
        break;
      case 'escape': // Cerrar lector móvil / popovers
        closeArticleReader();
        DOM.addFeedPopover.classList.add('hidden');
        break;
    }
  }

  // --- UTILERÍAS ---

  function getFeedName(url) {
    const feed = state.feeds.find(f => f.url === url);
    return feed ? feed.nombre : 'Feed externo';
  }

  function getUnreadCountGlobal() {
    return state.articles.filter(a => !a.read).length;
  }

  function getUnreadCountForFeed(url) {
    return state.articles.filter(a => a.feedUrl === url && !a.read).length;
  }

  function updateCategoriesDatalist() {
    const categories = [...new Set(state.feeds.map(f => f.categoria))];
    DOM.categoriesDatalist.innerHTML = '';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      DOM.categoriesDatalist.appendChild(opt);
    });
  }

  // --- GESTIÓN DE EVENTOS (LISTENERS) ---

  // Búsqueda
  DOM.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderArticles();
  });

  // Marcar todos leídos
  DOM.markAllReadBtn.addEventListener('click', markAllAsRead);

  // Estrella en lector
  DOM.starArticleBtn.addEventListener('click', toggleStarArticle);

  // Compartir en lector
  DOM.shareArticleBtn.addEventListener('click', shareArticleLink);

  // Cerrar lector móvil
  DOM.closeReaderBtn.addEventListener('click', closeArticleReader);

  // Mostrar Popover Añadir Feed
  const togglePopover = () => DOM.addFeedPopover.classList.toggle('hidden');
  DOM.addFeedTrigger.addEventListener('click', togglePopover);
  DOM.mobileAddFeedBtn.addEventListener('click', togglePopover);
  DOM.addFeedCancel.addEventListener('click', () => DOM.addFeedPopover.classList.add('hidden'));

  // Procesar nuevo feed formulario
  DOM.addFeedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = DOM.feedUrlInput.value.trim();
    const nombre = DOM.feedNameInput.value.trim() || 'Nuevo Feed';
    const categoria = DOM.feedCatInput.value.trim() || 'General';

    if (state.feeds.some(f => f.url === url)) {
      alert('Ya estás suscrito a este feed.');
      return;
    }

    const nuevoFeed = { url, nombre, categoria };
    state.feeds.push(nuevoFeed);
    saveFeedsToStorage();
    renderFeeds();
    updateCategoriesDatalist();

    DOM.addFeedPopover.classList.add('hidden');
    DOM.addFeedForm.reset();

    // Sincronizar de inmediato
    await syncFeed(nuevoFeed);
  });

  // Conmutador de categorías (chips de arriba en móvil)
  DOM.categoryFilters.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;

    DOM.categoryFilters.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const cat = chip.dataset.category;
    changeActiveFeed(cat);
  });

  // Conmutación de pestañas móvil
  DOM.mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      // Ignorar si es el botón central de Añadir
      if (item.id === 'mobile-add-feed-btn') return;

      const target = item.dataset.target;
      switchPane(target);
    });
  });

  // Teclado
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // --- EJECUCIÓN INICIAL ---
  initDate();
  initLenis();
  initTheme();
  initData();

  // Activar pane correcto de inicio en móviles
  if (window.innerWidth <= 900) {
    switchPane('pane-articles-list');
  }

});
