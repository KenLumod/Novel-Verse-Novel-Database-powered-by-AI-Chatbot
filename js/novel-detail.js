/* ===================================
   NovelVerse — Novel Detail Page
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    loadNovelDetail();
});

async function loadNovelDetail() {
    const container = document.getElementById('novelDetail');
    const similarSection = document.getElementById('similarSection');
    const similarGrid = document.getElementById('similarGrid');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const novelId = params.get('id');

    if (!novelId) {
        container.innerHTML = notFoundMarkup('No novel selected.');
        return;
    }

    let novel = null;
    try {
        const apiNovel = await fetchJSON(`/api/novels/${encodeURIComponent(novelId)}`);
        novel = normalizeNovel(apiNovel);
    } catch (e) {
        console.warn("Could not fetch novel from API:", e);
        const localMatch = (typeof NOVELS !== 'undefined' ? NOVELS : []).find(n =>
            String(n.id) === String(novelId) || String(n.novel_id) === String(novelId)
        );
        if (localMatch) novel = normalizeNovel(localMatch);
    }

    if (!novel) {
        container.innerHTML = notFoundMarkup('Novel not found.');
        return;
    }

    document.title = `${novel.title} — ${SITE.name}`;

    const coverHtml = novel.coverImage
        ? `<img src="${escapeHTML(novel.coverImage)}" alt="${escapeHTML(novel.title)}">`
        : `<div class="cover-placeholder"><i class="fas fa-book-open"></i><span>${escapeHTML(novel.title)}</span></div>`;

    const genresHtml = novel.genres.map(g => `<span class="genre-tag">${escapeHTML(g)}</span>`).join('');
    const tagsHtml = novel.tags.map(t => `<span class="detail-tag">${escapeHTML(t)}</span>`).join('');
    const statusClass = (novel.status || '').toLowerCase();

    const metaItems = [];
    if (novel.rating != null) {
        const ratingsLabel = novel.ratingsCount != null
            ? ` <span>(${novel.ratingsCount.toLocaleString()} ratings)</span>`
            : '';
        metaItems.push(`
            <div class="meta-item">
                <i class="fas fa-star" style="color:var(--warning);"></i>
                <strong>${novel.rating.toFixed(2)}</strong>${ratingsLabel}
            </div>`);
    }
    if (typeof novel.chapters === 'number' && Number.isFinite(novel.chapters) && novel.chapters > 0) {
        const chaptersText = `${novel.chapters.toLocaleString()} chapters`;
        metaItems.push(`<div class="meta-item"><i class="fas fa-book-open"></i> ${chaptersText}</div>`);
    }
    if (novel.views != null) {
        const views = novel.views >= 1000000
            ? (novel.views / 1000000).toFixed(1) + 'M'
            : novel.views >= 1000
                ? (novel.views / 1000).toFixed(0) + 'K'
                : novel.views.toLocaleString();
        metaItems.push(`<div class="meta-item"><i class="fas fa-eye"></i> ${views} views</div>`);
    }
    if (novel.status) {
        metaItems.push(`
            <div class="meta-item">
                <i class="fas fa-circle-check"></i>
                <span class="novel-card-status ${escapeHTML(statusClass)}" style="position:static;">${escapeHTML(novel.status)}</span>
            </div>`);
    }
    if (novel.year) {
        metaItems.push(`<div class="meta-item"><i class="fas fa-calendar"></i> ${escapeHTML(novel.year)}</div>`);
    }
    if (novel.language) {
        metaItems.push(`<div class="meta-item"><i class="fas fa-globe"></i> ${escapeHTML(novel.language)}</div>`);
    }

    container.innerHTML = `
        <a href="library.html" class="back-link"><i class="fas fa-arrow-left"></i> Back to Library</a>
        <div class="detail-layout">
            <div class="detail-cover">${coverHtml}</div>
            <div class="detail-info">
                <h1>${escapeHTML(novel.title)}</h1>
                <p class="detail-author">by <strong>${escapeHTML(novel.author)}</strong></p>
                <div class="detail-meta">${metaItems.join('')}</div>
                <div class="admin-novel-actions" id="adminNovelActions" hidden>
                    <button class="edit-novel-detail" id="editNovelButton" type="button"><i class="fas fa-pen"></i> Edit novel</button>
                    <button class="delete-novel-detail" id="deleteNovelButton" type="button"><i class="fas fa-trash"></i> Delete</button>
                </div>
                <form class="novel-edit-form" id="novelEditForm" hidden>
                    <div class="novel-edit-heading"><h2>Edit novel</h2><button type="button" id="cancelNovelEdit" class="edit-cancel">Cancel</button></div>
                    <label>Title<input name="title" required maxlength="300"></label>
                    <div class="novel-edit-row"><label>Author<input name="authors"></label><label>Year<input name="year" type="number" min="0" max="2100"></label></div>
                    <label>Description<textarea name="description" rows="5" required></textarea></label>
                    <label>Cover image URL<input name="img_url" type="url"></label>
                    <div class="novel-edit-row"><label>Genres <span>comma separated</span><input name="genres"></label><label>Tags <span>comma separated</span><input name="tags"></label></div>
                    <div class="novel-edit-row"><label>Status<input name="status_coo" placeholder="Ongoing"></label><label>Chapters<input name="chapters" placeholder="Number of chapters"></label></div>
                    <div class="novel-edit-row"><label>Rating<input name="rating"></label><label>Language<input name="language"></label></div>
                    <p class="novel-edit-feedback" id="novelEditFeedback" role="status"></p>
                    <button class="edit-novel-detail save-novel-detail" type="submit"><i class="fas fa-check"></i> Save changes</button>
                </form>
                <div class="detail-genres">${genresHtml}</div>
                <div class="detail-tags">${tagsHtml}</div>
                <div class="detail-description">
                    <h3>Synopsis</h3>
                    <p>${escapeHTML(novel.description)}</p>
                </div>
            </div>
        </div>
    `;

    const coverImage = container.querySelector('.detail-cover img');
    if (coverImage) {
        coverImage.addEventListener('error', () => {
            coverImage.replaceWith(createDetailCoverPlaceholder(novel.title));
        }, { once: true });
    }

    loadSimilarNovels(novel, similarSection, similarGrid);
    setupAdminNovelActions(novel);
}

function createDetailCoverPlaceholder(title) {
    const placeholder = document.createElement('div');
    placeholder.className = 'cover-placeholder';
    const icon = document.createElement('i');
    icon.className = 'fas fa-book-open';
    const label = document.createElement('span');
    label.textContent = title || 'Cover unavailable';
    placeholder.append(icon, label);
    return placeholder;
}

async function setupAdminNovelActions(novel) {
    const actions = document.getElementById('adminNovelActions');
    const form = document.getElementById('novelEditForm');
    try {
        const response = await fetch('/api/admin/me', { credentials: 'same-origin' });
        if (!response.ok) return;
        actions.hidden = false;

        const editFields = {
            title: novel.title, authors: novel.author, year: novel.year || '', description: novel.description,
            img_url: novel.coverImage || '', genres: novel.genres.join(', '), tags: novel.tags.join(', '),
            status_coo: novel.status || 'Ongoing', chapters: typeof novel.chapters === 'number' ? novel.chapters : '',
            rating: novel.rating ?? '', language: novel.language || ''
        };
        document.getElementById('editNovelButton').addEventListener('click', () => {
            for (const [name, value] of Object.entries(editFields)) form.elements[name].value = value;
            form.hidden = false;
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        document.getElementById('cancelNovelEdit').addEventListener('click', () => { form.hidden = true; });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const feedback = document.getElementById('novelEditFeedback');
            const submit = form.querySelector('[type="submit"]');
            const data = new FormData(form);
            const payload = Object.fromEntries(data.entries());
            payload.title = payload.title.trim();
            payload.description = payload.description.trim();
            payload.year = payload.year ? Number(payload.year) : null;
            for (const key of ['authors', 'img_url', 'genres', 'tags', 'chapters', 'rating', 'language']) payload[key] = payload[key].trim() || null;
            submit.disabled = true;
            feedback.textContent = 'Saving changes…';
            try {
                const saved = await fetch(`/api/admin/novels/${encodeURIComponent(novel.id)}`, {
                    method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const result = await saved.json().catch(() => ({}));
                if (!saved.ok) throw new Error(result.detail || 'Could not save changes.');
                window.location.reload();
            } catch (error) {
                feedback.textContent = error.message;
            } finally {
                submit.disabled = false;
            }
        });
        document.getElementById('deleteNovelButton').addEventListener('click', async event => {
            if (!window.confirm(`Delete “${novel.title}” from the catalog? This cannot be undone.`)) return;
            const button = event.currentTarget;
            button.disabled = true;
            try {
                const response = await fetch(`/api/admin/novels/${encodeURIComponent(novel.id)}`, { method: 'DELETE', credentials: 'same-origin' });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.detail || 'Could not delete novel.');
                window.location.href = 'library.html';
            } catch (error) {
                window.alert(error.message);
                button.disabled = false;
            }
        });
    } catch (error) {
        console.warn('Could not check admin access:', error);
    }
}

function notFoundMarkup(message) {
    return `
        <a href="library.html" class="back-link"><i class="fas fa-arrow-left"></i> Back to Library</a>
        <div class="loading-state">
            <i class="fas fa-exclamation-triangle" style="animation:none; color:var(--warning);"></i>
            <p>${escapeHTML(message)} <a href="library.html">Browse the library</a> to find a novel.</p>
        </div>
    `;
}

async function loadSimilarNovels(novel, section, grid) {
    if (!section || !grid) return;

    let similar = [];
    const seedGenre = novel.genres[0];
    if (seedGenre) {
        try {
            const { data } = await fetchNovels({ genre: seedGenre, limit: 8, sort: 'rating' });
            similar = data.filter(item => String(item.id) !== String(novel.id)).slice(0, 5);
        } catch (e) {
            console.warn("Could not load similar novels from API:", e);
        }
    }

    if (!similar.length && typeof NOVELS !== 'undefined') {
        similar = NOVELS
            .map(normalizeNovel)
            .filter(item => String(item.id) !== String(novel.id))
            .map(item => {
                let score = 0;
                novel.genres.forEach(g => { if (item.genres.includes(g)) score += 3; });
                novel.tags.forEach(t => { if (item.tags.includes(t)) score += 2; });
                return { item, score };
            })
            .filter(entry => entry.score > 2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(entry => entry.item);
    }

    if (similar.length) {
        section.style.display = 'block';
        grid.innerHTML = similar.map(createNovelCard).join('');
        addCardClickHandlers(grid);
    }
}
