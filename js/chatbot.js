/* ===================================
   NovelVerse — conversational AI chatbot
   Catalog retrieval and LLM replies run through the API
   =================================== */

class NovelChatbot {
    constructor() {
        this.messagesContainer = document.getElementById('chatMessages');
        this.chatForm = document.getElementById('chatForm');
        this.chatInput = document.getElementById('chatInput');
        this.sidebar = document.getElementById('chatbotSidebar');
        this.closeBtn = document.getElementById('chatbotClose');
        this.openBtn = document.getElementById('chatbotOpen');
        this.mainContent = document.getElementById('mainContent');

        this.conversationHistory = this.restoreConversationHistory();
        this.init();
    }

    init() {
        const compact = !document.getElementById('popularGrid') && !document.getElementById('libraryGrid');
        if (!this.restoreMessages()) {
            renderWelcomeMessage(this.messagesContainer, { compact });
        }
        this.messagesContainer.addEventListener('scroll', () => {
            try {
                sessionStorage.setItem('novelverse-chat-scroll-top', String(this.messagesContainer.scrollTop));
            } catch (err) {
                // Chat remains usable when browser storage is unavailable.
            }
        }, { passive: true });

        this.messagesContainer.addEventListener('click', event => {
            const card = event.target.closest('.chat-recommendation[data-novel-id]');
            if (card) window.location.href = `novel.html?id=${encodeURIComponent(card.dataset.novelId)}`;
        });
        this.messagesContainer.addEventListener('error', event => {
            const image = event.target;
            if (image instanceof HTMLImageElement && image.closest('.chat-rec-cover')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'mini-placeholder';
                const icon = document.createElement('i');
                icon.className = 'fas fa-book';
                placeholder.appendChild(icon);
                image.replaceWith(placeholder);
            }
        }, true);

        // Form submit
        this.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const msg = this.chatInput.value.trim();
            if (msg) {
                this.handleUserMessage(msg);
                this.chatInput.value = '';
            }
        });

        // Sidebar toggle
        this.closeBtn.addEventListener('click', () => this.collapseSidebar());
        this.openBtn.addEventListener('click', () => this.expandSidebar());

        // Mobile overlay
        this.createOverlay();

        // Restore state
        const collapsed = localStorage.getItem('chatbot-collapsed');
        if (collapsed === 'true' && window.innerWidth > 768) {
            document.body.classList.add('chatbot-collapsed');
        }
    }

    createOverlay() {
        if (!document.querySelector('.chatbot-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'chatbot-overlay';
            overlay.addEventListener('click', () => this.collapseMobile());
            document.body.appendChild(overlay);
        }
    }

    collapseSidebar() {
        if (window.innerWidth <= 768) {
            this.collapseMobile();
        } else {
            document.body.classList.add('chatbot-collapsed');
            localStorage.setItem('chatbot-collapsed', 'true');
        }
    }

    expandSidebar() {
        if (window.innerWidth <= 768) {
            document.body.classList.add('chatbot-expanded');
        } else {
            document.body.classList.remove('chatbot-collapsed');
            localStorage.setItem('chatbot-collapsed', 'false');
        }
    }

    collapseMobile() {
        document.body.classList.remove('chatbot-expanded');
    }

    // Add message to chat
    addMessage(content, isUser = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;

        const avatarIcon = isUser ? 'fa-user' : 'fa-robot';
        msgDiv.innerHTML = `
            <div class="message-avatar"><i class="fas ${avatarIcon}"></i></div>
            <div class="message-content">${content}</div>
        `;

        this.messagesContainer.appendChild(msgDiv);
        this.persistMessages();
        this.scrollToBottom();
    }

    // Keep formatted replies and recommendation cards between page navigations.
    persistMessages() {
        try {
            const messages = Array.from(this.messagesContainer.querySelectorAll('.message:not(.typing-msg)'))
                .map(message => ({
                    user: message.classList.contains('user-message'),
                    html: message.querySelector('.message-content')?.innerHTML || ''
                })).slice(-30);
            sessionStorage.setItem('novelverse-chat-messages-v2', JSON.stringify(messages));
            sessionStorage.setItem('novelverse-chat-scroll-top', String(this.messagesContainer.scrollTop));
        } catch (err) {
            // Chat should remain usable when browser storage is unavailable.
        }
    }

    persistConversationHistory() {
        try {
            const recent = this.conversationHistory.slice(-12).map(item => ({
                role: item.role,
                content: String(item.content || '').slice(0, 2000)
            }));
            sessionStorage.setItem('novelverse-chat-history-v1', JSON.stringify(recent));
        } catch (err) {
            // Chat remains usable when browser storage is unavailable.
        }
    }

    restoreConversationHistory() {
        try {
            const history = JSON.parse(sessionStorage.getItem('novelverse-chat-history-v1') || '[]');
            if (!Array.isArray(history)) return [];
            return history.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
                .slice(-12).map(item => ({ role: item.role, content: item.content.slice(0, 2000) }));
        } catch (err) {
            return [];
        }
    }

    restoreMessages() {
        try {
            const saved = JSON.parse(sessionStorage.getItem('novelverse-chat-messages-v2') || 'null');
            if (!Array.isArray(saved) || !saved.length) return false;

            saved.forEach(item => {
                if (!item || typeof item.html !== 'string') return;
                const message = document.createElement('div');
                message.className = `message ${item.user ? 'user-message' : 'ai-message'}`;
                const avatar = document.createElement('div');
                avatar.className = 'message-avatar';
                const icon = document.createElement('i');
                icon.className = `fas ${item.user ? 'fa-user' : 'fa-robot'}`;
                avatar.appendChild(icon);
                const content = document.createElement('div');
                content.className = 'message-content';
                content.innerHTML = this.sanitizeSavedMarkup(item.html);
                this.upgradeSavedTables(content);
                message.append(avatar, content);
                this.messagesContainer.appendChild(message);
            });
            const savedScrollTop = Number(sessionStorage.getItem('novelverse-chat-scroll-top'));
            requestAnimationFrame(() => {
                this.messagesContainer.scrollTop = Number.isFinite(savedScrollTop) ? savedScrollTop : this.messagesContainer.scrollHeight;
            });
            return this.messagesContainer.children.length > 0;
        } catch (err) {
            return false;
        }
    }

    sanitizeSavedMarkup(markup) {
        const template = document.createElement('template');
        template.innerHTML = markup;
        const allowedTags = new Set(['A', 'BR', 'CODE', 'DIV', 'EM', 'H4', 'I', 'IMG', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'UL']);
        const allowedAttributes = new Set(['alt', 'class', 'data-novel-id', 'href', 'rel', 'src', 'target', 'title']);
        const clean = node => {
            Array.from(node.children || []).forEach(child => {
                clean(child);
                if (!allowedTags.has(child.tagName)) {
                    child.replaceWith(...child.childNodes);
                    return;
                }
                Array.from(child.attributes).forEach(attribute => {
                    if (!allowedAttributes.has(attribute.name.toLowerCase())) child.removeAttribute(attribute.name);
                });
                if (child.hasAttribute('href') || child.hasAttribute('src')) {
                    try {
                        const url = new URL(child.getAttribute(child.hasAttribute('href') ? 'href' : 'src'), window.location.href);
                        if (!['http:', 'https:'].includes(url.protocol)) child.removeAttribute(child.hasAttribute('href') ? 'href' : 'src');
                    } catch (err) {
                        child.removeAttribute(child.hasAttribute('href') ? 'href' : 'src');
                    }
                }
                if (child.tagName === 'A' && child.getAttribute('target') === '_blank') {
                    child.setAttribute('rel', 'noopener noreferrer');
                }
            });
        };
        clean(template.content);
        return template.innerHTML;
    }

    upgradeSavedTables(container) {
        container.querySelectorAll('p').forEach(paragraph => {
            const text = paragraph.innerText || paragraph.textContent || '';
            if (!/^\s*\|.+\|\s*\n\s*\|?\s*:?-{3,}/m.test(text)) return;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = this.formatChatMarkdown(text);
            paragraph.replaceWith(...wrapper.childNodes);
        });
    }

    // Show typing indicator
    showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message typing-msg';
        typingDiv.innerHTML = `
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-content">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
        return typingDiv;
    }

    removeTyping(typingDiv) {
        if (typingDiv && typingDiv.parentNode) {
            typingDiv.parentNode.removeChild(typingDiv);
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // Handle user input
    async handleUserMessage(msg) {
        this.addMessage(`<p>${this.escapeHTML(msg)}</p>`, true);
        this.conversationHistory.push({ role: 'user', content: msg });
        this.persistConversationHistory();

        const typing = this.showTyping();

        try {
            const assistantReply = await this.processQuery(msg);
            if (assistantReply) {
                this.conversationHistory.push({ role: 'assistant', content: assistantReply });
                this.conversationHistory = this.conversationHistory.slice(-12);
                this.persistConversationHistory();
            }
        } finally {
            this.removeTyping(typing);
        }
    }

    // Process user query and generate recommendations
    async processQuery(query) {
        try {
            const response = await fetch('/api/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: query, top_k: 5, history: this.conversationHistory.slice(0, -1) })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.detail || `Recommendation service returned ${response.status}.`);
            }
            if (Array.isArray(data.recommendations) && data.recommendations.length) {
                this.renderApiRecommendations(data.recommendations, data.message, data.explanation_status, data.explanation_error);
                return data.message || `I found ${data.recommendations.length} possible novel matches.`;
            }
            if (data.message) {
                this.addMessage(`<p>${this.formatChatMarkdown(data.message)}</p>`);
                return data.message;
            }
            throw new Error('The recommendation service returned an empty response.');
        } catch (apiErr) {
            console.error('Recommendation API failed:', apiErr);
            this.addMessage(`<p>I couldn’t get live recommendations right now, so I haven’t shown sample results.</p><p class="chat-api-error">${this.escapeHTML(apiErr.message || 'Check that NovelVerse is running at http://127.0.0.1:8000 and try again.')}</p>`);
            return '';
        }
    }

    // Client-side fallback search
    processLocalQuery(query) {
        const lowerQuery = query.toLowerCase();

        // Check for author search
        const authorMatch = this.extractAuthor(lowerQuery);
        if (authorMatch) {
            const results = NOVELS.filter(n => n.author.toLowerCase().includes(authorMatch));
            if (results.length > 0) {
                this.displayRecommendations(results.slice(0, 5), `I found ${results.length} novel(s) by authors matching "<strong>${this.escapeHTML(authorMatch)}</strong>":`);
            } else {
                this.addMessage(`<p>I couldn't find any novels by an author matching "${this.escapeHTML(authorMatch)}" in our collection. Try describing the kind of story you want instead!</p>`);
            }
            return;
        }

        // Search and rank novels locally
        const results = this.searchNovels(query);

        if (results.length === 0) {
            this.addMessage(`<p>I couldn't find any novels matching your description. 😔</p><p>Try different keywords, or describe the themes, tropes, or character types you're interested in.</p>`);
        } else {
            const top5 = results.slice(0, 5);
            this.displayRecommendations(top5, `I found <strong>${results.length}</strong> novels matching your description. Here are the top ${top5.length} recommendations:`);
        }
    }

    // Search and rank novels using keyword/TF-IDF-style scoring
    searchNovels(query) {
        const queryTerms = this.tokenize(query);
        const queryBigrams = this.getBigrams(queryTerms);

        const scored = NOVELS.map(novel => {
            let score = 0;

            // Build searchable text for the novel
            const titleTerms = this.tokenize(novel.title);
            const descTerms = this.tokenize(novel.description);
            const genreTerms = this.tokenize(novel.genres.join(' '));
            const tagTerms = this.tokenize(novel.tags.join(' '));
            const authorTerms = this.tokenize(novel.author);

            // Score each query term
            queryTerms.forEach(term => {
                // Title match (high weight)
                if (titleTerms.includes(term)) score += 10;

                // Genre match (high weight)
                if (genreTerms.includes(term)) score += 8;

                // Tag match (high weight — very specific)
                if (tagTerms.includes(term)) score += 9;

                // Author match
                if (authorTerms.includes(term)) score += 7;

                // Description match (medium weight)
                const descCount = descTerms.filter(t => t === term).length;
                score += Math.min(descCount * 2, 8);

                // Partial match in description
                const partialDesc = descTerms.filter(t => t.includes(term) || term.includes(t)).length;
                score += Math.min(partialDesc * 0.5, 3);
            });

            // Bigram bonus (phrase matching)
            const descText = novel.description.toLowerCase();
            queryBigrams.forEach(bigram => {
                if (descText.includes(bigram)) score += 5;
            });

            // Full-phrase bonus
            const fullQuery = query.toLowerCase();
            if (descText.includes(fullQuery)) score += 15;
            if (novel.title.toLowerCase().includes(fullQuery)) score += 20;

            // Synonym expansion
            score += this.synonymScore(query, novel);

            return { novel, score, reason: this.generateReason(query, novel, score) };
        });

        return scored
            .filter(s => s.score > 3)
            .sort((a, b) => b.score - a.score);
    }

    // Tokenize text into terms
    tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2 && !this.isStopWord(t));
    }

    // Get bigrams
    getBigrams(terms) {
        const bigrams = [];
        for (let i = 0; i < terms.length - 1; i++) {
            bigrams.push(terms[i] + ' ' + terms[i + 1]);
        }
        return bigrams;
    }

    // Stop words
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
            'had', 'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how',
            'its', 'may', 'who', 'did', 'get', 'got', 'let', 'say', 'she',
            'too', 'use', 'him', 'been', 'some', 'than', 'them', 'then',
            'this', 'that', 'with', 'have', 'from', 'they', 'will', 'what',
            'when', 'make', 'like', 'just', 'know', 'take', 'want', 'give',
            'most', 'also', 'into', 'over', 'such', 'after', 'about', 'where',
            'which', 'their', 'there', 'these', 'those', 'would', 'could',
            'should', 'novel', 'story', 'book', 'read', 'want', 'looking',
            'find', 'show', 'recommend', 'something'
        ]);
        return stopWords.has(word);
    }

    // Synonym/concept expansion scoring
    synonymScore(query, novel) {
        const lq = query.toLowerCase();
        let score = 0;

        const synonymMap = {
            'strong mc': ['strong protagonist', 'overpowered protagonist', 'powerful', 'overpowered'],
            'strong main character': ['strong protagonist', 'overpowered protagonist', 'powerful'],
            'op mc': ['overpowered protagonist', 'overpowered', 'strong protagonist'],
            'overpowered': ['overpowered protagonist', 'strong protagonist'],
            'betrayed': ['betrayal', 'revenge', 'trust', 'manipulation'],
            'betrayal': ['betrayed', 'revenge', 'trust'],
            'revenge': ['betrayal', 'betrayed', 'vengeance'],
            'time loop': ['time loop', 'regression', 'save points', 'respawn', 'repeat'],
            'reincarnation': ['reincarnation', 'reborn', 'regression', 'transmigration', 'isekai'],
            'isekai': ['isekai', 'transmigration', 'transported', 'reincarnation', 'another world'],
            'game': ['litrpg', 'system', 'levels', 'gamepad', 'virtual reality'],
            'leveling': ['system', 'litrpg', 'progression', 'levels', 'solo leveling'],
            'level up': ['system', 'litrpg', 'progression', 'levels'],
            'magic': ['magic system', 'sorcery', 'mage', 'wizard', 'cultivation'],
            'cultivation': ['cultivation', 'xianxia', 'martial arts', 'qi'],
            'dark': ['dark', 'dark fantasy', 'grim', 'psychological', 'horror'],
            'comedy': ['humor', 'funny', 'comedy', 'comedic', 'satire', 'wholesome'],
            'funny': ['humor', 'comedy', 'comedic', 'satire', 'wholesome'],
            'female lead': ['female lead', 'strong female', 'heroine'],
            'female mc': ['female lead', 'strong female', 'heroine'],
            'smart mc': ['clever protagonist', 'intelligent', 'cunning', 'strategic'],
            'clever': ['clever protagonist', 'smart', 'cunning', 'strategic'],
            'dungeon': ['dungeon', 'dungeon crawl', 'tower'],
            'crafting': ['crafting', 'alchemy', 'blacksmith', 'workshop', 'runesmith'],
            'monster': ['monster evolution', 'non-human protagonist', 'demon', 'creature'],
            'academy': ['academy', 'school', 'university', 'learning'],
            'school': ['academy', 'school', 'university'],
            'horror': ['horror', 'dark', 'nightmare', 'psychological', 'survival'],
            'survival': ['survival', 'apocalypse', 'dangerous'],
            'romance': ['romance', 'slow burn', 'relationship'],
            'slow burn': ['slow burn', 'character-driven', 'romance'],
            'kingdom building': ['kingdom building', 'base building', 'colony building', 'empire'],
            'anti-hero': ['anti-hero', 'villain protagonist', 'morally grey', 'dark', 'cunning'],
            'villain': ['villain protagonist', 'anti-hero', 'evil', 'ruthless'],
            'sci-fi': ['sci-fi', 'science fiction', 'space', 'futuristic', 'cyberpunk'],
            'political': ['political intrigue', 'politics', 'court', 'scheming'],
            'completed': ['completed', 'finished'],
        };

        const allText = (novel.description + ' ' + novel.tags.join(' ') + ' ' + novel.genres.join(' ')).toLowerCase();

        for (const [key, synonyms] of Object.entries(synonymMap)) {
            if (lq.includes(key)) {
                synonyms.forEach(syn => {
                    if (allText.includes(syn)) {
                        score += 4;
                    }
                });
            }
        }

        return score;
    }

    // Generate reason for recommendation
    generateReason(query, novel, score) {
        const lq = query.toLowerCase();
        const reasons = [];

        // Check genre matches
        novel.genres.forEach(g => {
            if (lq.includes(g.toLowerCase())) {
                reasons.push(`Matches genre: ${g}`);
            }
        });

        // Check tag matches
        novel.tags.forEach(t => {
            if (lq.includes(t.toLowerCase())) {
                reasons.push(`Has tag: ${t}`);
            }
        });

        // Common theme matches
        const themeChecks = [
            { keywords: ['betray', 'betrayal', 'betrayed'], reason: 'Features themes of betrayal' },
            { keywords: ['strong mc', 'strong main character', 'overpowered', 'op mc', 'powerful'], reason: 'Strong/overpowered protagonist' },
            { keywords: ['time loop', 'repeat', 'respawn'], reason: 'Features time loop mechanics' },
            { keywords: ['reincarnation', 'reborn', 'second chance'], reason: 'Reincarnation/rebirth theme' },
            { keywords: ['revenge', 'vengeance'], reason: 'Revenge-driven story' },
            { keywords: ['female lead', 'female mc', 'heroine'], reason: 'Strong female protagonist' },
            { keywords: ['cultivation', 'xianxia'], reason: 'Cultivation/Xianxia elements' },
            { keywords: ['dark', 'grim', 'brutal'], reason: 'Dark and intense themes' },
            { keywords: ['funny', 'comedy', 'humor', 'humorous'], reason: 'Comedy and humor' },
            { keywords: ['clever', 'smart', 'intelligent', 'cunning'], reason: 'Clever/intelligent protagonist' },
            { keywords: ['academy', 'school', 'university'], reason: 'Academy/school setting' },
            { keywords: ['system', 'litrpg', 'game', 'level'], reason: 'System/LitRPG mechanics' },
            { keywords: ['monster', 'non-human', 'creature'], reason: 'Non-human/monster protagonist' },
            { keywords: ['crafting', 'alchemy', 'building'], reason: 'Crafting and building elements' },
        ];

        const allText = (novel.description + ' ' + novel.tags.join(' ') + ' ' + novel.genres.join(' ')).toLowerCase();

        themeChecks.forEach(check => {
            if (check.keywords.some(k => lq.includes(k)) && check.keywords.some(k => allText.includes(k))) {
                if (!reasons.includes(check.reason)) {
                    reasons.push(check.reason);
                }
            }
        });

        if (reasons.length === 0) {
            reasons.push('Matches your description keywords');
        }

        return reasons.slice(0, 3).join(' · ');
    }

    // Render recommendations returned from the Backend Vector Search & LLM API
    renderApiRecommendations(recommendations, explanationText, explanationStatus, explanationError) {
        const statusNote = explanationStatus === 'unavailable'
            ? `<p class="chat-api-error">AI explanation is temporarily unavailable${explanationError ? `: ${this.escapeHTML(explanationError)}` : ''} These novels came from the live catalog search.</p>`
            : '';
        let html = `<p>${this.formatChatMarkdown(explanationText || 'These novels were retrieved from the live catalog for your request.')}</p>${statusNote}`;

        recommendations.forEach(novel => {
            const authorsStr = novel.authors ? `by ${this.escapeHTML(novel.authors)}` : '';
            const ratingStr = novel.rating ? `Rating: ${this.escapeHTML(novel.rating)}` : '';
            const targetId = novel.novel_id || novel.id;

            const coverHtml = (novel.img_url && novel.img_url.startsWith('http') && !novel.img_url.includes('noimagefound'))
                ? `<img src="${this.escapeHTML(novel.img_url)}" alt="${this.escapeHTML(novel.title)}" onerror="this.parentElement.innerHTML='<div class=\\'mini-placeholder\\'><i class=\\'fas fa-book\\'></i></div>'">`
                : `<div class="mini-placeholder"><i class="fas fa-book"></i></div>`;

            const snippet = novel.description 
                ? (novel.description.length > 120 ? novel.description.substring(0, 120) + '...' : novel.description)
                : '';

            html += `
                <div class="chat-recommendation" data-novel-id="${this.escapeHTML(targetId)}">
                    <div class="chat-rec-cover">${coverHtml}</div>
                    <div class="chat-rec-info">
                        <h4>${this.escapeHTML(novel.title)}</h4>
                        <div class="chat-rec-genres">${authorsStr}</div>
                        <div class="chat-rec-reason">${this.escapeHTML(snippet)}</div>
                    </div>
                </div>
            `;
        });

        html += `<p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">Click any novel to view full details.</p>`;
        this.addMessage(html);
    }

    // Display recommendations in chat (Local Fallback)
    displayRecommendations(results, introText) {
        let html = `<p>${introText}</p>`;

        results.forEach(({ novel, reason }) => {
            const genresStr = novel.genres.slice(0, 3).join(' · ');
            const coverHtml = novel.coverImage
                ? `<img src="${novel.coverImage}" alt="${this.escapeHTML(novel.title)}">`
                : `<div class="mini-placeholder"><i class="fas fa-book"></i></div>`;

            html += `
                <div class="chat-recommendation" data-novel-id="${this.escapeHTML(novel.id)}">
                    <div class="chat-rec-cover">${coverHtml}</div>
                    <div class="chat-rec-info">
                        <h4>${this.escapeHTML(novel.title)}</h4>
                        <div class="chat-rec-genres">${genresStr}</div>
                        <div class="chat-rec-reason">${reason}</div>
                    </div>
                </div>
            `;
        });

        html += `<p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">Click any novel to see full details.</p>`;

        this.addMessage(html);
    }

    // Helpers
    extractAuthor(text) {
        // Match patterns like: "by author_name", "author: name", "novels by name"
        const patterns = [
            /(?:by|author[:\s]+|written by|created by)\s*["""]?([^"""]+?)["""]?\s*$/i,
            /(?:by|author[:\s]+|written by|created by)\s+(.+)/i,
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1].trim().toLowerCase();
            }
        }
        return null;
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str == null ? '' : String(str)));
        return div.innerHTML;
    }

    formatChatMarkdown(markdown) {
        let safe = this.escapeHTML(markdown);
        const tableCells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
        const lines = safe.split(/\r?\n/);
        const formattedLines = [];
        for (let i = 0; i < lines.length; i++) {
            const headerLine = lines[i].trim();
            const separatorLine = lines[i + 1]?.trim() || '';
            const isTable = headerLine.startsWith('|') && /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(separatorLine);
            if (!isTable) {
                formattedLines.push(lines[i]);
                continue;
            }

            const headers = tableCells(headerLine);
            const titleIndex = Math.max(0, headers.findIndex(header => /title|novel/i.test(header)));
            const summaryIndex = headers.findIndex(header => /snapshot|summary|description|plot/i.test(header));
            const cards = [];
            i += 2;
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                const cells = tableCells(lines[i]);
                const title = cells[titleIndex] || cells[0] || 'Novel';
                const summary = summaryIndex >= 0 ? cells[summaryIndex] : '';
                const metadata = cells
                    .map((value, index) => index === titleIndex || index === summaryIndex || !value ? '' : `${headers[index] || 'Details'}: ${value}`)
                    .filter(Boolean)
                    .join(' · ');
                cards.push(`<div class="chat-table-item"><strong class="chat-table-title">${title}</strong>${metadata ? `<span class="chat-table-meta">${metadata}</span>` : ''}${summary ? `<p>${summary}</p>` : ''}</div>`);
                i++;
            }
            formattedLines.push(`<div class="chat-markdown-table">${cards.join('')}</div>`);
            i--;
        }
        safe = formattedLines.join('\n');
        // Honor escaped Markdown markers and a common spaced-bold variant: \* *Title* \*.
        safe = safe.replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1');
        safe = safe.replace(/\*\s*\*([^*\n]+)\*\s*\*/g, '<strong>$1</strong>');
        safe = safe.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi,
            '<a class="chat-markdown-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        safe = safe.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
        safe = safe.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
        safe = safe.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
        safe = safe.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        return safe.replace(/\n/g, '<br>');
    }
}

// Initialize chatbot on every page
let chatbot;
document.addEventListener('DOMContentLoaded', () => {
    chatbot = new NovelChatbot();
});

