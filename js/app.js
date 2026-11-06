/* ===================================
   NovelVerse — Home Page (app.js)
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    renderPopularNovels();
    renderGenreGrid();
    renderRecentNovels();
    initHeroSearch();
    loadHeroStats();
    createParticles();
});

async function renderPopularNovels() {
    const grid = document.getElementById('popularGrid');
    if (!grid) return;

    try {
        const { data } = await fetchNovels({ limit: 50, sort: 'rating' });
        if (data.length) {
            clearCatalogSourceNotice(grid);
            grid.innerHTML = data.slice(0, 10).map(createNovelCard).join('');
            addCardClickHandlers(grid);
            populateHeroArtwork(data);
            return;
        }
    } catch (e) {
        console.warn("Could not load popular novels from API:", e);
    }

    showCatalogSourceNotice(grid, 'The live catalog is unavailable here; these are bundled sample novels.');
    const popular = [...NOVELS]
        .sort((a, b) => (b.rating * Math.log(b.ratingsCount || 1)) - (a.rating * Math.log(a.ratingsCount || 1)))
        .slice(0, 50)
        .map(normalizeNovel);

    grid.innerHTML = popular.slice(0, 10).map(createNovelCard).join('');
    addCardClickHandlers(grid);
    populateHeroArtwork(popular);
}

async function renderRecentNovels() {
    const grid = document.getElementById('recentGrid');
    if (!grid) return;

    try {
        const { data } = await fetchNovels({ limit: 10, sort: 'recent' });
        if (data.length) {
            clearCatalogSourceNotice(grid);
            grid.innerHTML = data.map(createNovelCard).join('');
            addCardClickHandlers(grid);
            return;
        }
    } catch (e) {
        console.warn("Could not load recent novels from API:", e);
    }

    showCatalogSourceNotice(grid, 'The live catalog is unavailable here; these are bundled sample novels.');
    const recent = [...NOVELS]
        .sort((a, b) => (b.year || 0) - (a.year || 0))
        .slice(0, 10)
        .map(normalizeNovel);

    grid.innerHTML = recent.map(createNovelCard).join('');
    addCardClickHandlers(grid);
}

async function renderGenreGrid() {
    const grid = document.getElementById('genreGrid');
    if (!grid) return;

    const filters = await fetchCatalogFilters();
    const genres = (filters.genres || []).slice(0, 12);

    grid.innerHTML = genres.map(({ name, count }) => {
        const icon = (typeof GENRE_ICONS !== 'undefined' && GENRE_ICONS[name]) ? GENRE_ICONS[name] : 'fa-book';
        return `
            <div class="genre-card" data-genre="${escapeHTML(name)}">
                <i class="fas ${icon}"></i>
                <h3>${escapeHTML(name)}</h3>
                <span>${count} novels</span>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.genre-card').forEach(card => {
        card.addEventListener('click', () => {
            window.location.href = `library.html?genre=${encodeURIComponent(card.dataset.genre)}`;
        });
    });
}

function initHeroSearch() {
    const input = document.getElementById('heroSearch');
    const form = document.getElementById('heroSearchForm');
    if (!input || !form) return;

    form.addEventListener('submit', event => {
        event.preventDefault();
        const query = input.value.trim();
        if (!query) return;
        window.location.href = `library.html?search=${encodeURIComponent(query)}`;
    });
}

async function populateHeroArtwork(novels) {
    const artwork = document.getElementById('heroArtwork');
    if (!artwork || !Array.isArray(novels)) return;
    const slots = Array.from(artwork.querySelectorAll('.hero-art-cover'));
    if (window.heroArtworkTimer) clearInterval(window.heroArtworkTimer);

    const seen = new Set();
    const candidates = novels.filter(novel => {
        const url = novel.coverImage;
        if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return false;
        seen.add(url);
        return true;
    }).slice(0, 12);

    // Only show covers that the browser successfully loads; ignore missing or broken URLs.
    const loadedCovers = await Promise.all(candidates.map(novel => new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve({ novel, url: image.src });
        image.onerror = () => resolve(null);
        image.src = novel.coverImage;
    })));
    const available = loadedCovers.filter(Boolean);
    if (!available.length) return;

    let startIndex = 0;
    const renderCovers = () => {
        slots.forEach(slot => {
            slot.classList.remove('has-cover');
            slot.style.display = 'none';
            slot.style.opacity = '0';
            slot.style.backgroundImage = 'none';
        });

        // Restore the layered two-cover hero, filling each card only with a verified image.
        const visibleSlots = available.length === 1 ? [slots[1]] : slots;
        visibleSlots.forEach((slot, slotIndex) => {
            const item = available[(startIndex + slotIndex) % available.length];
            slot.style.backgroundImage = `linear-gradient(180deg, transparent 55%, rgba(22, 20, 48, .2)), url("${item.url.replace(/["\\]/g, '')}")`;
            slot.title = item.novel.title || '';
            slot.style.display = 'block';
            slot.classList.add('has-cover');
            requestAnimationFrame(() => { slot.style.opacity = '1'; });
        });
    };

    renderCovers();
    if (available.length > 1) {
        window.heroArtworkTimer = setInterval(() => {
            startIndex = (startIndex + 1) % available.length;
            renderCovers();
        }, 10000);
    }
}

async function loadHeroStats() {
    const stats = await fetchCatalogStats();
    const mapping = {
        novels: stats.novels,
        genres: stats.genres,
        authors: stats.authors
    };

    Object.entries(mapping).forEach(([key, value]) => {
        const el = document.querySelector(`.stat-number[data-stat="${key}"]`);
        if (el) el.dataset.count = value || 0;
    });

    animateStats();
}

function animateStats() {
    const stats = document.querySelectorAll('.stat-number');
    if (!stats.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.count, 10) || 0;
                animateNumber(el, 0, target, 1500);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => observer.observe(stat));
}

function animateNumber(el, start, end, duration) {
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (end - start) * eased);
        el.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

function createParticles() {
    const container = document.getElementById('heroParticles');
    if (!container) return;

    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: absolute;
            width: ${2 + Math.random() * 3}px;
            height: ${2 + Math.random() * 3}px;
            background: var(--accent);
            border-radius: 50%;
            opacity: ${0.1 + Math.random() * 0.3};
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: float ${5 + Math.random() * 10}s ease-in-out infinite;
            animation-delay: ${Math.random() * 5}s;
        `;
        container.appendChild(particle);
    }

    if (!document.getElementById('particleStyle')) {
        const style = document.createElement('style');
        style.id = 'particleStyle';
        style.textContent = `
            @keyframes float {
                0%, 100% { transform: translate(0, 0); }
                25% { transform: translate(${10 + Math.random() * 20}px, -${10 + Math.random() * 20}px); }
                50% { transform: translate(-${5 + Math.random() * 15}px, ${5 + Math.random() * 15}px); }
                75% { transform: translate(${5 + Math.random() * 10}px, ${10 + Math.random() * 10}px); }
            }
        `;
        document.head.appendChild(style);
    }
}
