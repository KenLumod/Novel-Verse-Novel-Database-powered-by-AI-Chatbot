/* ===================================
   NovelVerse — About Page
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    renderExampleQueries();
    initQueryChips();
});

function renderExampleQueries() {
    const container = document.getElementById('queryExamples');
    if (!container) return;
    container.innerHTML = (SITE.exampleQueries || SITE.welcomeExamples).map(query => `
        <div class="query-chip" data-query="${escapeHTML(query)}">
            <i class="fas fa-quote-left"></i>
            "${escapeHTML(query)}"
        </div>
    `).join('');
}

function initQueryChips() {
    document.getElementById('queryExamples')?.addEventListener('click', (event) => {
        const chip = event.target.closest('.query-chip');
        if (!chip || !chatbot) return;
        const query = chip.dataset.query;
        if (!query) return;
        if (document.body.classList.contains('chatbot-collapsed')) {
            chatbot.expandSidebar();
        }
        if (window.innerWidth <= 768) {
            document.body.classList.add('chatbot-expanded');
        }
        setTimeout(() => chatbot.handleUserMessage(query), 300);
    });
}
