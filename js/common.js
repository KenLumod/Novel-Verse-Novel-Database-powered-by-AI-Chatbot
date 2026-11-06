/* ===================================
   NovelVerse — Shared frontend helpers
   =================================== */

const SITE = {
    name: 'NovelVerse',
    welcomeExamples: [
        'I want a strong MC who gets betrayed',
        'Fantasy novel with magic systems',
        'Romance with a slow burn'
    ],
    exampleQueries: [
        'I want a novel where the MC is overpowered from the start',
        'Fantasy with a dark magic system and political intrigue',
        'Reincarnation into a game world with leveling system',
        'Strong female lead in a cultivation novel'
    ]
};

function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str == null ? '' : String(str)));
    return div.innerHTML;
}

function showCatalogSourceNotice(container, message) {
    if (!container?.parentElement) return;
    let notice = container.parentElement.querySelector('.catalog-source-notice');
    if (!notice) {
        notice = document.createElement('p');
        notice.className = 'catalog-source-notice';
        container.before(notice);
    }
    notice.textContent = message;
}

function clearCatalogSourceNotice(container) {
    container?.parentElement?.querySelector('.catalog-source-notice')?.remove();
}

function parseListField(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(Boolean);
    }
    const text = String(value).trim();
    if (!text) return [];
    const quoted = [...text.matchAll(/'([^']*)'|"([^"]*)"/g)]
        .map(match => (match[1] || match[2] || '').trim())
        .filter(Boolean);
    if (quoted.length) return quoted;
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text.replace(/'/g, '"'));
            if (Array.isArray(parsed)) {
                return parsed.map(item => String(item).trim()).filter(Boolean);
            }
        } catch (err) {
            /* fall through */
        }
    }
    return text.split(/[,;/|]+/).map(part => part.replace(/^[\s'"]+|[\s'"]+$/g, '')).filter(Boolean);
}

function parseRating(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const match = String(value).match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

function parseStatus(value) {
    if (!value) return '';
    const text = String(value);
    const lower = text.toLowerCase();
    if (lower.includes('ongoing')) return 'Ongoing';
    if (lower.includes('hiatus')) return 'Hiatus';
    if (lower.includes('complete')) return 'Completed';
    return text.trim();
}

function normalizeNovel(raw) {
    if (!raw) return null;
    const cover = raw.img_url || raw.coverImage || '';
    const genres = parseListField(raw.genres);
    const chaptersRaw = raw.chapters;
    let chapters = chaptersRaw;
    if (chaptersRaw != null && /^\d+$/.test(String(chaptersRaw).trim())) {
        chapters = parseInt(chaptersRaw, 10);
    }

    return {
        id: raw.novel_id ?? raw.id,
        title: raw.title || 'Untitled',
        author: raw.authors || raw.author || 'Unknown',
        description: raw.description || '',
        coverImage: (cover.startsWith('http') && !cover.includes('noimagefound')) ? cover : '',
        genres: genres.length ? genres : [],
        tags: parseListField(raw.tags),
        rating: parseRating(raw.rating),
        ratingsCount: Number.isFinite(raw.ratingsCount) ? raw.ratingsCount : null,
        chapters,
        views: Number.isFinite(raw.views) ? raw.views : null,
        status: parseStatus(raw.status_coo || raw.status),
        language: raw.language || '',
        year: raw.year || null
    };
}

function localCatalogStats() {
    const authors = new Set((typeof NOVELS !== 'undefined' ? NOVELS : []).map(novel => novel.author).filter(Boolean));
    return {
        novels: typeof NOVELS !== 'undefined' ? NOVELS.length : 0,
        genres: typeof getAllGenres === 'function' ? getAllGenres().length : 0,
        authors: authors.size,
        genre_counts: typeof getGenreCounts === 'function'
            ? Object.entries(getGenreCounts())
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count }))
            : [],
        statuses: [...new Set((typeof NOVELS !== 'undefined' ? NOVELS : []).map(novel => novel.status).filter(Boolean))].sort()
    };
}

async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
}

async function fetchNovels(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '' && value !== 'all') {
            query.set(key, value);
        }
    });
    const json = await fetchJSON(`/api/novels?${query.toString()}`);
    return {
        data: (json.data || []).map(normalizeNovel),
        count: json.count || 0
    };
}

async function fetchCatalogStats() {
    try {
        const stats = await fetchJSON('/api/stats');
        if (stats && (stats.novels || stats.genres || stats.authors)) return stats;
    } catch (err) {
        /* use local catalog */
    }
    return localCatalogStats();
}

async function fetchCatalogFilters() {
    try {
        const json = await fetchJSON('/api/filters');
        if ((json.genres && json.genres.length) || (json.statuses && json.statuses.length)) {
            return json;
        }
    } catch (err) {
        /* use local catalog */
    }
    const local = localCatalogStats();
    return { genres: local.genre_counts, statuses: local.statuses };
}

async function refreshAuthNav() {
    const link = document.getElementById('navLogin');
    if (!link) return;
    try {
        const response = await fetch('/api/admin/me', { credentials: 'same-origin' });
        if (!response.ok) return;
        link.textContent = 'Admin';
        link.href = 'admin.html';
    } catch (err) {
        /* stay on the Log In link */
    }
}

document.addEventListener('DOMContentLoaded', refreshAuthNav);

function initNavigation() {
    const hamburger = document.getElementById('navHamburger');
    const navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }
}

function createNovelCard(novel) {
    const item = novel.genres ? novel : normalizeNovel(novel);
    const genresHtml = (item.genres || []).slice(0, 2).map(genre =>
        `<span class="genre-tag">${escapeHTML(genre)}</span>`
    ).join('');
    const status = item.status || '';
    const statusClass = status.toLowerCase();
    const ratingHtml = item.rating != null
        ? `<div class="novel-card-rating"><i class="fas fa-star"></i> ${item.rating.toFixed(1)}</div>`
        : '';
    const statusHtml = status
        ? `<div class="novel-card-status ${escapeHTML(statusClass)}">${escapeHTML(status)}</div>`
        : '';
    const coverHtml = item.coverImage
        ? `<img src="${escapeHTML(item.coverImage)}" alt="${escapeHTML(item.title)}" loading="lazy" onerror="this.outerHTML='<div class=\\'cover-placeholder\\'><i class=\\'fas fa-book-open\\'></i><span>${escapeHTML(item.title)}</span></div>'">`
        : `<div class="cover-placeholder">
                <i class="fas fa-book-open"></i>
                <span>${escapeHTML(item.title)}</span>
           </div>`;

    return `
        <div class="novel-card" data-id="${escapeHTML(item.id)}">
            <div class="novel-card-cover">
                ${coverHtml}
                ${ratingHtml}
                ${statusHtml}
            </div>
            <div class="novel-card-info">
                <div class="novel-card-title">${escapeHTML(item.title)}</div>
                <div class="novel-card-genres">${genresHtml}</div>
                <div class="novel-card-author">by ${escapeHTML(item.author)}</div>
            </div>
        </div>
    `;
}

function addCardClickHandlers(container) {
    container.querySelectorAll('.novel-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            window.location.href = `novel.html?id=${encodeURIComponent(id)}`;
        });
    });
}

function renderWelcomeMessage(container, { compact = false } = {}) {
    if (!container || container.children.length) return;
    const examples = compact
        ? ''
        : `<p>Tell me what kind of novel you're looking for. For example:</p>
           <ul>${SITE.welcomeExamples.map(example => `<li>"${escapeHTML(example)}"</li>`).join('')}</ul>`;
    container.innerHTML = `
        <div class="message ai-message">
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-content">
                <p>Welcome to <strong>${escapeHTML(SITE.name)}</strong>! 👋</p>
                ${examples || `<p>Tell me what kind of novel you're looking for.</p>`}
                <p>I'll search our collection and recommend the best matches!</p>
            </div>
        </div>
    `;
}
