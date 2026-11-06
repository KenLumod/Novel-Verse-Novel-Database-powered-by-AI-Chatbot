/* ===================================
   NovelVerse — Library Page
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initLibrary();
});

function initLibrary() {
    const grid = document.getElementById('libraryGrid');
    const searchInput = document.getElementById('librarySearch');
    const genreFilter = document.getElementById('genreFilter');
    const statusFilter = document.getElementById('statusFilter');
    const sortFilter = document.getElementById('sortFilter');
    const resultCount = document.getElementById('resultCount');
    const paginationContainer = document.getElementById('pagination');

    if (!grid) return;

    const ITEMS_PER_PAGE = 20;
    let currentPage = 1;
    let filteredNovels = [];
    let usingApi = false;
    let apiTotal = 0;

    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get('search');
    const initialGenre = params.get('genre');
    if (initialSearch) searchInput.value = initialSearch;

    populateFilters().then(() => {
        if (initialGenre && [...genreFilter.options].some(opt => opt.value === initialGenre)) {
            genreFilter.value = initialGenre;
        }
        applyFilters();
    });

    async function populateFilters() {
        const filters = await fetchCatalogFilters();
        (filters.genres || []).forEach(({ name }) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            genreFilter.appendChild(option);
        });
        (filters.statuses || []).forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            statusFilter.appendChild(option);
        });
    }

    async function applyFilters() {
        const search = searchInput.value.trim();
        const genre = genreFilter.value;
        const status = statusFilter.value;
        const sort = sortFilter.value;

        try {
            const apiData = await fetchNovels({
                limit: ITEMS_PER_PAGE,
                offset: (currentPage - 1) * ITEMS_PER_PAGE,
                search,
                genre,
                status,
                sort
            });
            usingApi = true;
            clearCatalogSourceNotice(grid);
            apiTotal = apiData.count;
            resultCount.textContent = apiTotal;
            renderCards(apiData.data);
            renderPaginationFromCount(apiTotal);
            return;
        } catch (e) {
            console.warn("Library API fetch failed, falling back to local:", e);
        }

        showCatalogSourceNotice(grid, 'The live catalog is unavailable here; the titles below are bundled sample novels.');
        usingApi = false;
        filteredNovels = NOVELS.filter(novel => {
            const item = normalizeNovel(novel);
            if (search) {
                const q = search.toLowerCase();
                const searchable = [item.title, item.author, item.description, item.genres.join(' '), item.tags.join(' ')].join(' ').toLowerCase();
                if (!searchable.includes(q)) return false;
            }
            if (genre !== 'all' && !item.genres.includes(genre)) return false;
            if (status !== 'all' && item.status !== status) return false;
            return true;
        }).map(normalizeNovel);

        switch (sort) {
            case 'title':
                filteredNovels.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'rating':
                filteredNovels.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'chapters':
                filteredNovels.sort((a, b) => (Number(b.chapters) || 0) - (Number(a.chapters) || 0));
                break;
            case 'recent':
                filteredNovels.sort((a, b) => (b.year || 0) - (a.year || 0));
                break;
        }

        renderPage();
    }

    function renderCards(novels) {
        if (!novels.length) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="fas fa-search" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>
                    <p>No novels found matching your filters.</p>
                    <p style="font-size:0.85rem; margin-top:0.5rem;">Try different search terms or filters.</p>
                </div>
            `;
            return;
        }
        grid.innerHTML = novels.map(createNovelCard).join('');
        addCardClickHandlers(grid);
    }

    function renderPaginationFromCount(totalItems) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }
        let html = `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}"><i class="fas fa-chevron-left"></i></button>`;
        const windowSize = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + windowSize - 1);
        start = Math.max(1, end - windowSize + 1);
        for (let i = start; i <= end; i++) {
            html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}"><i class="fas fa-chevron-right"></i></button>`;
        paginationContainer.innerHTML = html;
        bindPagination();
    }

    function renderPage() {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageNovels = filteredNovels.slice(start, start + ITEMS_PER_PAGE);
        resultCount.textContent = filteredNovels.length;
        renderCards(pageNovels);
        renderPaginationFromCount(filteredNovels.length);
    }

    function bindPagination() {
        paginationContainer.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPage = parseInt(btn.dataset.page, 10);
                if (usingApi) applyFilters();
                else renderPage();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentPage = 1;
            applyFilters();
        }, 300);
    });

    [genreFilter, statusFilter, sortFilter].forEach(el => {
        el.addEventListener('change', () => {
            currentPage = 1;
            applyFilters();
        });
    });
}
