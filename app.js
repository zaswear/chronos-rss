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
    theme: 'light',
    suggestions: [],
    activeTab: 'portada-ai',
    geminiApiKey: '',
    activeTagFilter: 'all',
    portadaAiContent: null
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
    articlesScroll: document.getElementById('articles-scroll-container'),
    sidebarTabMy: document.getElementById('sidebar-tab-my'),
    sidebarTabDiscover: document.getElementById('sidebar-tab-discover'),
    myFeedsWrapper: document.getElementById('my-feeds-wrapper'),
    discoverFeedsWrapper: document.getElementById('discover-feeds-wrapper'),
    discoverListContainer: document.getElementById('discover-list-container'),
    reloadDiscoverBtn: document.getElementById('reload-discover-btn'),
    
    // Nuevos Selectores
    tabPortadaBtn: document.getElementById('tab-portada-btn'),
    tabQuioscoBtn: document.getElementById('tab-quiosco-btn'),
    viewPortadaAi: document.getElementById('view-portada-ai'),
    viewQuiosco: document.getElementById('view-quiosco'),
    geminiKeyInput: document.getElementById('gemini-key-input'),
    saveGeminiKeyBtn: document.getElementById('save-gemini-key-btn'),
    generatePortadaBtn: document.getElementById('generate-portada-btn'),
    portadaSectionsContainer: document.getElementById('portada-sections-container'),
    portadaAiEmpty: document.getElementById('portada-ai-empty'),
    portadaAiLoading: document.getElementById('portada-ai-loading'),
    portadaAiContent: document.getElementById('portada-ai-content'),
    portadaNoKeyWarning: document.getElementById('portada-no-key-warning'),
    quioscoTagFilters: document.getElementById('quiosco-tag-filters'),
    readerBackdrop: document.getElementById('reader-backdrop')
  };

  // --- AYUDANTES DE SEGURIDAD (sanitización de salida) ---
  // Escapa texto para insertarlo de forma segura en HTML (evita XSS por interpolación)
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // Solo permite esquemas seguros; bloquea javascript:, data:, etc.
  function safeUrl(url) {
    try {
      const u = new URL(url, location.href);
      return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : '#';
    } catch { return '#'; }
  }
  // Higieniza HTML de feeds (terceros no confiables) antes de renderizarlo
  function sanitizeFeedHtml(html) {
    if (window.DOMPurify) {
      return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['style']
      });
    }
    // Fallback ultra-conservador si DOMPurify no cargó: solo texto
    const tmp = document.createElement('div');
    tmp.textContent = html;
    return tmp.innerHTML;
  }
  // Notificación efímera no bloqueante (sustituye alert())
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2500);
  }

  // --- INICIALIZADORES ---

  // 1. Mostrar fecha actual
  function initDate() {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    DOM.currentDateDisplay.textContent = new Date().toLocaleDateString('es-ES', opciones);
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

  // --- LÓGICA DE INICIALIZACIÓN (Sin contraseña, persistencia directa en localStorage) ---

  async function initData() {
    // 1. Cargar clave API de Gemini
    const savedKey = localStorage.getItem('chronos-gemini-key');
    if (savedKey && !savedKey.includes(':')) {
      state.geminiApiKey = savedKey;
      DOM.geminiKeyInput.value = savedKey;
    } else {
      // Si la clave anterior estaba encriptada o no encriptada en otra variable, intentar recuperarla
      const rawKey = localStorage.getItem('chronos-gemini-key-unencrypted');
      if (rawKey && !rawKey.includes(':')) {
        state.geminiApiKey = rawKey;
        DOM.geminiKeyInput.value = rawKey;
        localStorage.setItem('chronos-gemini-key', rawKey);
      }
      
      // Limpiar claves antiguas e innecesarias
      localStorage.removeItem('chronos-gemini-key-unencrypted');
      localStorage.removeItem('chronos-verifier');
      localStorage.removeItem('chronos-salt');
      sessionStorage.removeItem('chronos-session-key');
    }

    // 2. Cargar feeds
    const rawFeeds = localStorage.getItem('chronos-feeds');
    let loadedFeeds = null;
    if (rawFeeds) {
      try {
        loadedFeeds = JSON.parse(rawFeeds);
        if (!Array.isArray(loadedFeeds)) {
          loadedFeeds = null;
        }
      } catch (e) {
        console.warn('Feeds corruptos o encriptados, se cargarán por defecto.', e);
        loadedFeeds = null;
      }
    }

    if (loadedFeeds) {
      state.feeds = loadedFeeds;
    } else {
      await loadDefaultFeeds();
    }

    // 3. Cargar artículos
    const rawArticles = localStorage.getItem('chronos-articles');
    if (rawArticles) {
      try {
        state.articles = JSON.parse(rawArticles);
        if (!Array.isArray(state.articles)) {
          state.articles = [];
        }
      } catch (e) {
        console.warn('Artículos corruptos o encriptados, inicializando vacío.', e);
        state.articles = [];
      }
    } else {
      state.articles = [];
    }

    // 4. Cargar caché de portada
    const cachedPortada = sessionStorage.getItem('portada-ai-cache');
    if (cachedPortada) {
      try {
        state.portadaAiContent = JSON.parse(cachedPortada);
      } catch (e) {
        state.portadaAiContent = null;
      }
    }

    // Inicializar tab activa por defecto
    switchTab('portada-ai');

    // Renderizar y sincronizar
    renderFeeds();
    renderArticles();
    updateCategoriesDatalist();
    syncAllFeeds();
  }

  async function loadDefaultFeeds() {
    try {
      const response = await fetch('./feeds-default.json');
      state.feeds = await response.json();
      await saveFeedsToStorage();
    } catch (err) {
      console.warn('No se pudo cargar feeds-default.json, inicializando vacío.', err);
      state.feeds = [];
    }
  }

  // --- LÓGICA DE ALMACENAMIENTO (PERSISTENCIA DIRECTA EN LOCALSTORAGE) ---

  async function saveFeedsToStorage() {
    localStorage.setItem('chronos-feeds', JSON.stringify(state.feeds));
  }

  async function saveArticlesToStorage() {
    // Para no exceder la cuota de localStorage (5MB), guardamos máximo los 40 artículos más recientes por feed
    const grouped = {};
    state.articles.forEach(art => {
      if (!grouped[art.feedUrl]) grouped[art.feedUrl] = [];
      grouped[art.feedUrl].push(art);
    });

    const optimized = [];
    Object.keys(grouped).forEach(url => {
      const sorted = grouped[url].sort((a, b) => new Date(b.date) - new Date(a.date));
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
        const trimmed = (text || '').trim();
        // Si allorigins retorna JSON envoltura
        if (proxy.includes('allorigins') && trimmed.startsWith('{')) {
          const json = JSON.parse(text);
          if (json.contents) return json.contents;
        }
        if (trimmed.startsWith('<') || trimmed.includes('<rss') || trimmed.includes('<feed') || trimmed.includes('<?xml')) {
          return text; // Contenido XML válido
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
      throw err; // propagar para contabilizar fallos en syncAllFeeds
    }
  }

  // Sincronizar todos
  async function syncAllFeeds() {
    const statusEl = document.getElementById('status-indicator');
    statusEl.textContent = 'Sincronizando...';
    statusEl.style.color = 'var(--accent-purple)';

    const promesas = state.feeds.map(feed => syncFeed(feed));
    const results = await Promise.allSettled(promesas);
    const fallidos = results.filter(r => r.status === 'rejected').length;

    if (fallidos > 0) {
      statusEl.textContent = `${fallidos} fuente${fallidos !== 1 ? 's' : ''} con error`;
      statusEl.style.color = 'var(--accent-terracotta)';
    } else {
      statusEl.textContent = 'Sincronizado';
      statusEl.style.color = '';
    }
  }

  // --- LÓGICA DE RENDERIZADO UI ---

  // Renderizar columna de feeds (fuentes)
  function renderFeeds() {
    DOM.feedList.innerHTML = '';

    // Opción: Todos los artículos
    const itemAll = document.createElement('li');
    itemAll.className = `feed-item ${state.activeFeed === 'all' ? 'active' : ''}`;
    itemAll.setAttribute('role', 'button');
    itemAll.tabIndex = 0;
    itemAll.setAttribute('aria-label', 'Ver todas las lecturas');
    itemAll.innerHTML = `
      <div class="feed-item-info">
        <span class="feed-item-title">Todas las lecturas</span>
        <span class="feed-item-meta mono-text">TODAS LAS FUENTES</span>
      </div>
      ${getUnreadCountGlobal() > 0 ? `<span class="feed-unread-badge">${getUnreadCountGlobal()}</span>` : ''}
    `;
    itemAll.addEventListener('click', () => changeActiveFeed('all'));
    itemAll.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); changeActiveFeed('all'); }
    });
    DOM.feedList.appendChild(itemAll);

    // Listar categorías agrupadas de suscripciones
    state.feeds.forEach(feed => {
      const unreadCount = getUnreadCountForFeed(feed.url);
      const li = document.createElement('li');
      li.className = `feed-item ${state.activeFeed === feed.url ? 'active' : ''}`;
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.setAttribute('aria-label', `Ver fuente: ${feed.nombre}`);
      li.innerHTML = `
        <div class="feed-item-info">
          <span class="feed-item-title">${escapeHtml(feed.nombre)}</span>
          <span class="feed-item-meta mono-text">${escapeHtml((feed.categoria || '').toUpperCase())}</span>
        </div>
        ${unreadCount > 0 ? `<span class="feed-unread-badge">${unreadCount}</span>` : ''}
        <button class="feed-item-delete" aria-label="Eliminar suscripción a ${escapeHtml(feed.nombre)}" title="Eliminar suscripción">
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
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); changeActiveFeed(feed.url); }
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

    // 3. Filtrado por Tag de Quiosco (IA, Dev, Diseño, etc.)
    if (state.activeTagFilter && state.activeTagFilter !== 'all') {
      const tag = state.activeTagFilter;
      const iaKeywords = ['ia', 'ai', 'gemini', 'claude', 'gpt', 'llm', 'inteligencia artificial', 'openai', 'machine learning', 'deep learning', 'transformers', 'copilot'];
      const devKeywords = ['dev', 'javascript', 'typescript', 'react', 'web', 'rust', 'go', 'python', 'css', 'html', 'backend', 'frontend', 'node', 'software', 'programming', 'programación', 'desarrollo', 'api', 'mainframe', 'tecnología'];
      const disenoKeywords = ['diseño', 'design', 'ui', 'ux', 'css', 'layout', 'tailwind', 'styling', 'figma', 'interfaz', 'aesthetics', 'aesthetica'];
      
      filtered = filtered.filter(a => {
        const titleLower = a.title.toLowerCase();
        const excerptLower = a.excerpt.toLowerCase();
        const combined = `${titleLower} ${excerptLower}`;
        
        if (tag === 'ia') {
          return iaKeywords.some(kw => combined.includes(kw));
        } else if (tag === 'dev') {
          return devKeywords.some(kw => combined.includes(kw));
        } else if (tag === 'diseno') {
          return disenoKeywords.some(kw => combined.includes(kw));
        } else if (tag === 'otros') {
          const isIa = iaKeywords.some(kw => combined.includes(kw));
          const isDev = devKeywords.some(kw => combined.includes(kw));
          const isDiseno = disenoKeywords.some(kw => combined.includes(kw));
          return !isIa && !isDev && !isDiseno;
        }
        return true;
      });
    }

    // Ordenar artículos por fecha descendente
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    DOM.articlesCountText.textContent = `${filtered.length} artículos`;

    if (filtered.length === 0) {
      DOM.articlesContainer.innerHTML = `
        <div class="col-span-full py-16 text-center text-muted">
          <div class="text-3xl mb-2">✍</div>
          <p>No hay artículos que coincidan con los filtros seleccionados.</p>
        </div>
      `;
      return;
    }

    // Dibujar tarjetas (Bento Grid asimétrico)
    filtered.forEach(art => {
      const feedName = getFeedName(art.feedUrl);
      const card = document.createElement('article');
      
      // Determinar si es una noticia de hoy (menos de 24 horas)
      const timeDiff = Date.now() - new Date(art.date).getTime();
      const isToday = timeDiff < 24 * 60 * 60 * 1000;
      const isFeatured = isToday; 

      card.className = `article-card border-2 border-border-ink bg-card-bg p-5 flex flex-col justify-between transition-all duration-300 ${isFeatured ? 'col-span-1 md:col-span-2 md:row-span-2 border-accent-terracotta bg-accent-terracotta/5 md:p-6 shadow-editorial' : 'col-span-1 shadow-sm'} ${art.read ? 'opacity-65' : ''} ${state.activeArticleId === art.id ? 'ring-2 ring-accent-terracotta' : ''}`;
      
      const readableDate = new Date(art.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });

      card.innerHTML = `
        <div class="space-y-2.5">
          <div class="flex justify-between items-center text-[10px] font-mono text-muted uppercase">
            <span class="text-accent-terracotta font-bold">${escapeHtml(feedName)}</span>
            <span>${escapeHtml(readableDate)}</span>
          </div>
          <h3 class="${isFeatured ? 'text-lg md:text-xl font-bold font-serif leading-tight' : 'text-sm font-bold font-serif leading-snug'} text-ink hover:text-accent-terracotta transition-colors">${escapeHtml(art.title)}</h3>
          <p class="text-xs text-muted leading-relaxed line-clamp-3">${escapeHtml(art.excerpt)}</p>
        </div>
        <div class="mt-5 pt-3 border-t border-border-muted/50 flex justify-between items-center text-[10px] font-mono">
          <span class="text-muted font-semibold uppercase tracking-wider">${isToday ? '🔥 Reciente' : '📅 Anterior'}</span>
          <span class="text-accent-terracotta font-bold group-hover:underline">Leer más →</span>
        </div>
      `;

      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.setAttribute('aria-label', `Abrir artículo: ${art.title}`);
      card.addEventListener('click', () => openArticle(art.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openArticle(art.id); }
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

    DOM.externalLinkBtn.href = safeUrl(art.link);

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
            💡 Este artículo fue redactado originalmente en su idioma original (${escapeHtml(feed.lang.toUpperCase())}) y traducido en la lista. ¿Deseas traducir el cuerpo completo del artículo al español?
          </p>
          <div class="translation-alert-actions">
            <button id="translate-body-btn" class="btn-small">Traducir Cuerpo</button>
            <a href="${safeUrl(art.link)}" target="_blank" rel="noopener noreferrer" class="btn-small">Ver en la Web Original</a>
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
            <a href="${safeUrl(art.link)}" target="_blank" rel="noopener noreferrer" class="btn-small">Ver en la Web Original</a>
          </div>
        </div>
      `;
    }

    // El contenido del feed es de un tercero NO confiable: se higieniza con DOMPurify.
    let cleanHTML = art.content || '';
    // Si viene texto plano o XML escapado, asegurar saltos de línea (escapando el texto)
    if (!cleanHTML.includes('<p>') && !cleanHTML.includes('<br>')) {
      cleanHTML = cleanHTML.split('\n').map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : '').join('');
    }
    cleanHTML = sanitizeFeedHtml(cleanHTML);

    DOM.focusedArticleWrapper.innerHTML = `
      <div class="article-header">
        <div class="article-meta-info mono-text">
          <span class="article-meta-feed">${escapeHtml(feedName.toUpperCase())}</span>
          <span class="article-meta-date">${escapeHtml(readableDate)}</span>
        </div>
        <h2 class="article-title-focused serif-text">${escapeHtml(art.title)}</h2>
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
    if (state.activeTab !== 'quiosco') {
      switchTab('quiosco');
    }
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

    // Abrir lector lateral y backdrop
    DOM.articleReader.classList.add('open');
    DOM.readerBackdrop.classList.remove('hidden');
    setTimeout(() => {
      DOM.readerBackdrop.classList.remove('opacity-0');
      DOM.readerBackdrop.classList.add('opacity-100');
    }, 10);
  }

  function closeArticleReader() {
    DOM.articleReader.classList.remove('open');

    state.activeArticleId = null;
    renderArticles();

    // Ocultar backdrop
    DOM.readerBackdrop.classList.remove('opacity-100');
    DOM.readerBackdrop.classList.add('opacity-0');
    setTimeout(() => {
      DOM.readerBackdrop.classList.add('hidden');
    }, 300);
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

    const url = safeUrl(art.link);
    if (url === '#') { toast('Este artículo no tiene un enlace válido.'); return; }

    // Preferir Web Share nativo (móvil); si no, copiar al portapapeles
    if (navigator.share) {
      navigator.share({ title: art.title, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => toast('¡Enlace copiado al portapapeles!'))
        .catch(() => toast('No se pudo copiar el enlace.'));
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
          if (art) window.open(safeUrl(art.link), '_blank', 'noopener,noreferrer');
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

  // --- LÓGICA DE TABS Y PORTADA AI ---

  function switchTab(tab) {
    state.activeTab = tab;
    if (tab === 'portada-ai') {
      DOM.tabPortadaBtn.classList.add('text-accent-terracotta', 'border-b-accent-terracotta');
      DOM.tabPortadaBtn.classList.remove('text-muted', 'border-b-transparent');
      DOM.tabQuioscoBtn.classList.add('text-muted', 'border-b-transparent');
      DOM.tabQuioscoBtn.classList.remove('text-accent-terracotta', 'border-b-accent-terracotta');
      
      DOM.viewPortadaAi.classList.remove('hidden');
      DOM.viewQuiosco.classList.add('hidden');
      
      renderPortadaAi();
    } else {
      DOM.tabQuioscoBtn.classList.add('text-accent-terracotta', 'border-b-accent-terracotta');
      DOM.tabQuioscoBtn.classList.remove('text-muted', 'border-b-transparent');
      DOM.tabPortadaBtn.classList.add('text-muted', 'border-b-transparent');
      DOM.tabPortadaBtn.classList.remove('text-accent-terracotta', 'border-b-accent-terracotta');
      
      DOM.viewQuiosco.classList.remove('hidden');
      DOM.viewPortadaAi.classList.add('hidden');
      
      renderArticles();
    }
  }

  function renderPortadaAi() {
    // Verificar si hay clave
    if (!state.geminiApiKey) {
      DOM.portadaAiEmpty.classList.remove('hidden');
      DOM.portadaAiLoading.classList.add('hidden');
      DOM.portadaAiContent.classList.add('hidden');
      DOM.portadaNoKeyWarning.classList.remove('hidden');
      return;
    } else {
      DOM.portadaNoKeyWarning.classList.add('hidden');
    }

    if (state.portadaAiContent) {
      DOM.portadaAiEmpty.classList.add('hidden');
      DOM.portadaAiLoading.classList.add('hidden');
      DOM.portadaAiContent.classList.remove('hidden');
      renderPortadaContent(state.portadaAiContent);
    } else {
      DOM.portadaAiEmpty.classList.remove('hidden');
      DOM.portadaAiLoading.classList.add('hidden');
      DOM.portadaAiContent.classList.add('hidden');
    }
  }

  function renderPortadaContent(portadaData) {
    DOM.portadaSectionsContainer.innerHTML = '';
    
    portadaData.forEach((sec, idx) => {
      const col = document.createElement('div');
      col.className = "flex flex-col gap-4 p-4 md:p-6 first:pl-0 last:pr-0 border-b border-border-muted md:border-b-0 md:border-r last:border-r-0 md:first:pl-0 md:last:pr-0";
      
      let refHtml = '';
      if (sec.references && sec.references.length > 0) {
        refHtml = `<div class="mt-4 pt-3 border-t border-dashed border-border-muted">
          <span class="text-[9px] font-mono text-muted uppercase block mb-2">Fuentes y Referencias:</span>
          <div class="flex flex-wrap gap-1.5">`;
        sec.references.forEach(ref => {
          // Intentar asociar con un artículo real por id o título similar
          const match = state.articles.find(a => a.id === ref.id || a.title.toLowerCase().includes((ref.title || '').toLowerCase()));
          if (match) {
            refHtml += `<button class="ref-link-btn text-[10px] font-serif bg-sidebar hover:bg-accent-terracotta hover:text-white px-2 py-0.5 border border-border-muted transition-colors" data-art-id="${match.id}">${escapeHtml(ref.title || match.title)}</button>`;
          } else {
            refHtml += `<span class="text-[10px] font-serif bg-sidebar px-2 py-0.5 border border-border-muted text-muted">${escapeHtml(ref.title || 'Referencia')}</span>`;
          }
        });
        refHtml += `</div></div>`;
      }

      col.innerHTML = `
        <div class="space-y-2.5">
          <span class="text-[10px] font-mono font-bold tracking-widest text-accent-terracotta uppercase block">${escapeHtml(sec.category)}</span>
          <h3 class="serif-text font-bold text-xl md:text-2xl leading-tight text-ink hover:text-accent-terracotta transition-colors">${escapeHtml(sec.headline)}</h3>
        </div>
        <div class="serif-text text-sm text-ink leading-relaxed text-justify space-y-3 mt-3">
          ${(sec.editorialSummary || '').split('\n').map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : '').join('')}
        </div>
        ${refHtml}
      `;

      DOM.portadaSectionsContainer.appendChild(col);
    });

    // Agregar eventos a los botones de referencias
    DOM.portadaSectionsContainer.querySelectorAll('.ref-link-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openArticle(btn.dataset.artId);
      });
    });
  }

  async function saveGeminiKeyToStorage(key) {
    state.geminiApiKey = key;
    localStorage.setItem('chronos-gemini-key', key);
  }

  // --- GESTIÓN DE EVENTOS (LISTENERS) ---

  // Conmutador de Tabs Principales
  DOM.tabPortadaBtn.addEventListener('click', () => switchTab('portada-ai'));
  DOM.tabQuioscoBtn.addEventListener('click', () => switchTab('quiosco'));

  // Cerrar lector haciendo clic fuera
  DOM.readerBackdrop.addEventListener('click', closeArticleReader);

  // Guardar clave API de Gemini
  DOM.saveGeminiKeyBtn.addEventListener('click', async () => {
    const key = DOM.geminiKeyInput.value.trim();
    if (!key) {
      toast('Por favor, introduce una clave API válida.');
      return;
    }
    await saveGeminiKeyToStorage(key);
    toast('✓ Clave API de Gemini guardada.');
    if (state.activeTab === 'portada-ai') {
      renderPortadaAi();
    }
  });

  // Generar Portada AI
  DOM.generatePortadaBtn.addEventListener('click', async () => {
    if (!state.geminiApiKey) {
      DOM.portadaNoKeyWarning.classList.remove('hidden');
      return;
    }
    
    // Recolectar noticias recientes (últimas 48 horas o últimas 30)
    const todayArticles = state.articles.filter(art => {
      return (Date.now() - new Date(art.date).getTime()) < 48 * 60 * 60 * 1000;
    });
    const articlesToProcess = todayArticles.length > 0 ? todayArticles : state.articles.slice(0, 30);

    if (articlesToProcess.length === 0) {
      toast('Sincroniza tus fuentes primero. No hay artículos para procesar.');
      return;
    }

    DOM.portadaAiEmpty.classList.add('hidden');
    DOM.portadaAiLoading.classList.remove('hidden');
    DOM.portadaAiContent.classList.add('hidden');

    try {
      const articlesListText = articlesToProcess.map(art => {
        return `ID: "${art.id}" | Título: "${art.title}" | Categoría: "${getFeedName(art.feedUrl)}" | Extracto: "${art.excerpt}"`;
      }).join('\n');

      const systemPrompt = `
      Eres un prestigioso redactor editorial en español para un diario impreso de gran reputación.
      Tu tarea es analizar las noticias tecnológicas del día y redactar una portada de periódico real en español.
      
      Estructura el output final EXCLUSIVAMENTE como un array JSON de objetos con el siguiente formato:
      [
        {
          "category": "Inteligencia Artificial",
          "headline": "El titular principal y llamativo para esta sección",
          "editorialSummary": "Un texto fluido, bien redactado, de tono periodístico, analizando y resumiendo las noticias de esta categoría hoy. No listes las noticias una a una. En su lugar, redacta una crónica ejecutiva que conecte los distintos hechos del día con elegancia. El texto debe tener entre 2 y 4 párrafos bien construidos.",
          "references": [
            {"title": "Título corto del artículo", "id": "ID exacto del artículo"}
          ]
        }
      ]
      
      Importante:
      1. Devuelve EXCLUSIVAMENTE el JSON. Sin bloques de código markdown, sin texto aclaratorio antes o después.
      2. Redacta 100% en español.
      3. No utilices viñetas en el resumen editorial. Redáctalo como una columna de opinión o crónica real.
      4. Agrupa las noticias en las siguientes 3 o 4 secciones temáticas más relevantes hoy: 'Inteligencia Artificial', 'Desarrollo Web', 'Mainframe y Tecnología', 'Diseño y UI/UX', u otras si aplica.
      `;

      const userPrompt = `Aquí tienes las noticias de hoy:\n${articlesListText}\n\nPor favor, genera la portada en formato JSON según las instrucciones.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.geminiApiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }]
        })
      });

      if (!res.ok) throw new Error(`Google API HTTP ${res.status}`);

      const resData = await res.json();
      const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      
      let cleanJson = text.trim();
      if (cleanJson.startsWith("```")) {
        const start = cleanJson.indexOf("[");
        const end = cleanJson.lastIndexOf("]");
        if (start !== -1 && end !== -1) {
          cleanJson = cleanJson.slice(start, end + 1);
        }
      }

      const portadaData = JSON.parse(cleanJson);
      state.portadaAiContent = portadaData;
      sessionStorage.setItem('portada-ai-cache', JSON.stringify(portadaData));

      DOM.portadaAiLoading.classList.add('hidden');
      DOM.portadaAiContent.classList.remove('hidden');
      renderPortadaContent(portadaData);
      toast('¡Portada AI generada exitosamente!');
    } catch (err) {
      console.error('Error al generar portada AI:', err);
      toast('Falló la generación de la portada AI. Verifica tu clave de API y conexión.');
      renderPortadaAi();
    }
  });

  // Filtros rápidos del Quiosco
  DOM.quioscoTagFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    DOM.quioscoTagFilters.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    state.activeTagFilter = btn.dataset.tag;
    renderArticles();
  });


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
      toast('Ya estás suscrito a este feed.');
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

  // --- SECCIÓN DESCUBRIR (SUGERENCIAS) ---
  state.suggestions = [];
  state.activeSidebarTab = 'my'; // 'my' o 'discover'

  // Conmutador de pestañas de barra lateral
  DOM.sidebarTabMy.addEventListener('click', () => {
    DOM.sidebarTabMy.classList.add('active');
    DOM.sidebarTabDiscover.classList.remove('active');
    DOM.myFeedsWrapper.classList.remove('hidden');
    DOM.discoverFeedsWrapper.classList.add('hidden');
    state.activeSidebarTab = 'my';
  });

  DOM.sidebarTabDiscover.addEventListener('click', () => {
    DOM.sidebarTabDiscover.classList.add('active');
    DOM.sidebarTabMy.classList.remove('active');
    DOM.discoverFeedsWrapper.classList.remove('hidden');
    DOM.myFeedsWrapper.classList.add('hidden');
    state.activeSidebarTab = 'discover';
    if (state.suggestions.length === 0) {
      loadSuggestions();
    } else {
      renderDiscover();
    }
  });

  async function loadSuggestions() {
    try {
      const res = await fetch('./feeds-suggestions.json');
      if (!res.ok) throw new Error('Status ' + res.status);
      state.suggestions = await res.json();
      // Mezclar sugerencias inicialmente
      shuffleArray(state.suggestions);
      renderDiscover();
    } catch (err) {
      console.warn('Error al cargar sugerencias de feeds:', err);
      DOM.discoverListContainer.innerHTML = `<li class="reader-placeholder"><p>No se pudieron cargar sugerencias.</p></li>`;
    }
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  DOM.reloadDiscoverBtn.addEventListener('click', () => {
    // Mezclar y volver a renderizar
    shuffleArray(state.suggestions);
    renderDiscover();
  });

  function renderDiscover() {
    DOM.discoverListContainer.innerHTML = '';
    
    if (state.suggestions.length === 0) {
      DOM.discoverListContainer.innerHTML = `<li class="reader-placeholder"><p>No hay sugerencias disponibles.</p></li>`;
      return;
    }

    // Mostrar un subconjunto de sugerencias (máximo 6 para no saturar)
    const subset = state.suggestions.slice(0, 6);

    subset.forEach(item => {
      const li = document.createElement('li');
      li.className = 'discover-item';

      const isSubscribed = state.feeds.some(f => f.url === item.url);
      const subscribeBtnHtml = isSubscribed
        ? `<button class="btn-small" disabled style="opacity:0.6; cursor:default;">Suscrito</button>`
        : `<button class="btn-small btn-add-suggested">Añadir</button>`;

      li.innerHTML = `
        <div class="discover-item-header">
          <span class="discover-item-title">${escapeHtml(item.nombre)}</span>
          <span class="discover-item-category">${escapeHtml((item.categoria || '').toUpperCase())}</span>
        </div>
        <span class="discover-item-url">${escapeHtml(item.url)}</span>
        <div class="discover-item-actions">
          <span class="discover-status-badge unchecked" id="status-badge-${btoa(item.url).replace(/=/g, '').substring(0, 24)}">Sin verificar</span>
          <div class="discover-buttons">
            <a href="${safeUrl(item.web)}" target="_blank" rel="noopener noreferrer" class="btn-text" style="font-size:0.7rem; padding:0.2rem 0.4rem;">Visitar</a>
            <button class="btn-text btn-verify-suggested" style="font-size:0.7rem; padding:0.2rem 0.4rem;">Verificar</button>
            ${subscribeBtnHtml}
          </div>
        </div>
      `;

      // Eventos
      li.querySelector('.btn-verify-suggested')?.addEventListener('click', (e) => {
        verifySuggestedFeed(item.url);
      });

      li.querySelector('.btn-add-suggested')?.addEventListener('click', (e) => {
        subscribeSuggestedFeed(item);
      });

      DOM.discoverListContainer.appendChild(li);
    });
  }

  async function verifySuggestedFeed(feedUrl) {
    const badgeId = `status-badge-${btoa(feedUrl).replace(/=/g, '').substring(0, 24)}`;
    const badge = document.getElementById(badgeId);
    if (!badge) return;

    badge.className = 'discover-status-badge unchecked';
    badge.textContent = 'Verificando...';

    try {
      const xmlText = await fetchFeedWithFallback(feedUrl);
      // Validar si parsea correctamente
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) throw new Error('Error parseo');

      badge.className = 'discover-status-badge valid';
      badge.textContent = 'Válido ✓';
    } catch (err) {
      console.warn('Error al verificar feed:', feedUrl, err);
      badge.className = 'discover-status-badge invalid';
      badge.textContent = 'No disponible ✗';
    }
  }

  async function subscribeSuggestedFeed(item) {
    if (state.feeds.some(f => f.url === item.url)) return;

    const nuevoFeed = {
      url: item.url,
      nombre: item.nombre,
      categoria: item.categoria,
      lang: item.lang || 'es'
    };

    state.feeds.push(nuevoFeed);
    saveFeedsToStorage();
    renderFeeds();
    renderDiscover(); // Recargar discover para deshabilitar botón
    updateCategoriesDatalist();

    // Sincronizar de inmediato
    await syncFeed(nuevoFeed);
  }


  // --- EJECUCIÓN INICIAL ---
  initDate();
  initTheme();
  initData();

  // Activar pane correcto de inicio en móviles
  if (window.innerWidth <= 900) {
    switchPane('pane-articles-list');
  }

});
