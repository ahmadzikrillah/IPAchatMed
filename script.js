// ================== [1] INITIALIZATION ================== //
let dataset = {};
const responseCache = new Map();
const sessionContext = {
    lastTopic: null,
    lastSubtopic: null,
    followUpQuestions: []
};

const priorityKeywords = {
    // Biologi
    "sel": 15, "fotosintesis": 15, "mitokondria": 12, 
    "kloroplas": 12, "membran": 10, "nukleus": 10,
    "glukosa": 10, "oksigen": 9, "karbon": 9,
    "dna": 12, "rna": 11, "enzim": 10,
    
    // Fisika
    "gaya": 14, "energi": 13, "listrik": 12,
    "magnet": 11, "cahaya": 11, "gerak": 10,
    
    // Kimia
    "asam": 12, "basa": 12, "reaksi": 11,
    "unsur": 10, "senyawa": 10, "periodik": 9
};

// ================== [2] TEXT PROCESSING ================== //
function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, '')
        .replace(/\b(apa|bagaimana|mengapa|jelaskan|sebutkan|bisa|dimaksud|tentang|fungsi|dari|pada|yang|dan|untuk|di|ke|dari|adalah|itu)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function indonesianStemming(word) {
    if (!word) return '';
    
    const suffixes = ['nya', 'lah', 'kah', 'pun', 'kan', 'an'];
    const prefixes = ['ber', 'ter', 'me', 'pe', 'di', 'se'];
    
    let stemmed = word;
    
    // Hapus suffix
    for (const suffix of suffixes) {
        if (stemmed.endsWith(suffix) && stemmed.length > suffix.length + 2) {
            stemmed = stemmed.slice(0, -suffix.length);
            break;
        }
    }
    
    // Hapus prefix
    for (const prefix of prefixes) {
        if (stemmed.startsWith(prefix) && stemmed.length > prefix.length + 2) {
            stemmed = stemmed.slice(prefix.length);
            break;
        }
    }
    
    return stemmed.length > 2 ? stemmed : word;
}

function extractKeywords(text) {
    if (!text) return [];
    return normalizeText(text).split(' ')
        .map(indonesianStemming)
        .filter(word => word.length > 2);
}

// ================== [3] FUZZY MATCHING & SIMILARITY ================== //
function calculateSimilarity(str1, str2) {
    const set1 = new Set(str1.split(' '));
    const set2 = new Set(str2.split(' '));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
}

function findBestPatternMatch(query, patterns) {
    let bestScore = 0;
    let bestPattern = null;
    
    const normalizedQuery = normalizeText(query);
    
    patterns.forEach(pattern => {
        const normalizedPattern = normalizeText(pattern);
        const similarity = calculateSimilarity(normalizedQuery, normalizedPattern);
        
        // Bonus untuk exact match atau urutan kata yang sama
        if (normalizedQuery === normalizedPattern) {
            bestScore = 1.5;
            bestPattern = pattern;
            return;
        }
        
        // Bonus untuk pola yang mengandung seluruh kata query
        const queryWords = normalizedQuery.split(' ');
        if (queryWords.every(word => normalizedPattern.includes(word))) {
            similarity += 0.3;
        }
        
        if (similarity > bestScore) {
            bestScore = similarity;
            bestPattern = pattern;
        }
    });
    
    return { score: bestScore, pattern: bestPattern };
}

// ================== [4] CORE ANSWER FINDING LOGIC ================== //
function evaluateQuestion(qna, query, keywords, isContextSearch = false) {
    let score = 0;
    
    // 1. Pattern Matching
    const { score: patternScore, pattern } = findBestPatternMatch(query, qna.patterns);
    score += patternScore * 100;
    
    // 2. Keyword Matching
    const matchedKeywords = qna.keywords.filter(kw => 
        keywords.some(userKw => {
            const stemmedKw = indonesianStemming(kw);
            const stemmedUserKw = indonesianStemming(userKw);
            return stemmedKw === stemmedUserKw;
        })
    ).length;
    
    score += matchedKeywords * (15 + matchedKeywords * 0.5);
    
    // 3. Priority Keywords Bonus
    matchedKeywords.forEach(kw => {
        if (priorityKeywords[kw]) {
            score += priorityKeywords[kw];
        }
    });
    
    // 4. Context Bonus
    if (isContextSearch) {
        score *= 1.5;
    }
    
    // 5. Intent Matching
    if (qna.intent && normalizeText(query).includes(normalizeText(qna.intent))) {
        score += 30;
    }
    
    return { score, pattern };
}

function findAnswer(query) {
    const cacheKey = normalizeText(query);
    if (responseCache.has(cacheKey)) {
        return responseCache.get(cacheKey);
    }

    const keywords = extractKeywords(query);
    let bestMatch = null;
    let highestScore = 0;
    let usedPattern = null;

    // [1] Check last context first
    if (sessionContext.lastTopic && sessionContext.lastSubtopic) {
        const lastTopicData = dataset.topics[sessionContext.lastTopic]?.subtopics[sessionContext.lastSubtopic];
        if (lastTopicData) {
            for (const qna of lastTopicData.QnA) {
                const { score, pattern } = evaluateQuestion(qna, query, keywords, true);
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = qna;
                    usedPattern = pattern;
                    bestMatch.topic = sessionContext.lastTopic;
                    bestMatch.subtopic = sessionContext.lastSubtopic;
                }
            }
        }
    }

    // [2] Search all topics
    for (const [topic, topicData] of Object.entries(dataset.topics)) {
        for (const [subtopic, subtopicData] of Object.entries(topicData.subtopics)) {
            // Skip if already checked in context
            if (topic === sessionContext.lastTopic && subtopic === sessionContext.lastSubtopic) continue;
            
            for (const qna of subtopicData.QnA) {
                const { score, pattern } = evaluateQuestion(qna, query, keywords);
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = qna;
                    usedPattern = pattern;
                    bestMatch.topic = topic;
                    bestMatch.subtopic = subtopic;
                }
            }
        }
    }

    // [3] Prepare response
    if (highestScore > 40) { // Dynamic threshold
        sessionContext.lastTopic = bestMatch.topic;
        sessionContext.lastSubtopic = bestMatch.subtopic;
        
        // Generate follow-up questions
        sessionContext.followUpQuestions = bestMatch.patterns
            .filter(p => p !== usedPattern)
            .slice(0, 3);
        
        const response = formatResponse(bestMatch);
        responseCache.set(cacheKey, response);
        return response;
    }
    
    return getFallbackResponse(keywords);
}

// ================== [5] RESPONSE FORMATTING ================== //
function formatResponse(match) {
    const mainResponse = match.responses[0];
    let response = `
        <div class="answer-box">
            <div class="topic-header">
                <span class="topic-badge">${match.topic}</span>
                <span class="subtopic-badge">${match.subtopic}</span>
            </div>
            <div class="answer-content">${mainResponse}</div>
    `;
    
    // Add diagram if available
    if (match.diagram) {
        response += `
            <div class="diagram-container">
                <img src="${match.diagram}" alt="${match.subtopic}" 
                     loading="lazy" class="diagram-img"
                     onerror="this.style.display='none'">
                <div class="diagram-caption">Diagram ${match.subtopic}</div>
            </div>
        `;
    }
    
    // Add related responses
    if (match.responses.length > 1) {
        response += `
            <div class="related-answers">
                <div class="related-title">Informasi terkait:</div>
                <ul>${match.responses.slice(1, 3).map(r => `<li>${r}</li>`).join('')}</ul>
            </div>
        `;
    }
    
    // Add follow-up suggestions
    if (sessionContext.followUpQuestions.length > 0) {
        response += `
            <div class="follow-up">
                <div class="followup-title">Pertanyaan lanjutan:</div>
                <ul>${sessionContext.followUpQuestions.map(q => 
                    `<li><a href="#" onclick="document.getElementById('userInput').value='${q}';sendMessage();">${q}</a></li>`
                ).join('')}</ul>
            </div>
        `;
    }
    
    response += `</div>`;
    return response;
}

function getFallbackResponse(keywords) {
    // Find related topics based on keywords
    const relatedTopics = [];
    const topicScores = {};
    
    for (const [topic, topicData] of Object.entries(dataset.topics)) {
        for (const [subtopic, subtopicData] of Object.entries(topicData.subtopics)) {
            for (const qna of subtopicData.QnA) {
                const keywordMatches = qna.keywords.filter(kw => 
                    keywords.some(userKw => 
                        indonesianStemming(kw) === indonesianStemming(userKw)
                    )
                ).length;
                
                if (keywordMatches > 0) {
                    const topicKey = `${topic} > ${subtopic}`;
                    topicScores[topicKey] = (topicScores[topicKey] || 0) + keywordMatches;
                }
            }
        }
    }
    
    // Sort by relevance
    const sortedTopics = Object.entries(topicScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic]) => topic);
    
    // Prepare suggestion
    let suggestion = '';
    if (sortedTopics.length > 0) {
        suggestion = `Mungkin Anda maksud tentang: ${sortedTopics.join(', ')}`;
    } else {
        suggestion = 'Coba tanyakan tentang: sel, fotosintesis, sistem organ, gaya, energi, atau reaksi kimia';
    }
    
    return `
        <div class="not-found">
            <div class="not-found-icon">❓</div>
            <div class="not-found-text">
                <p>Saya belum memahami pertanyaan Anda.</p>
                <p>${suggestion}</p>
            </div>
        </div>
    `;
}

// ================== [6] UI MANAGEMENT ================== //
function addMessage(message, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    
    if (isBot) {
        // Add typing indicator
        chatbox.innerHTML += `
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>`;
        
        // Scroll to bottom
        chatbox.scrollTop = chatbox.scrollHeight;
    }

    setTimeout(() => {
        if (isBot) {
            // Remove typing indicator
            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) typingIndicator.remove();
        }
        
        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isBot ? 'bot-message' : 'user-message'}`;
        messageDiv.innerHTML = message;
        chatbox.appendChild(messageDiv);
        
        // Apply special styles for answer boxes
        const answerBoxes = messageDiv.querySelectorAll('.answer-box');
        answerBoxes.forEach(box => {
            box.style.borderLeft = '3px solid #4CAF50';
            box.style.padding = '12px';
            box.style.margin = '10px 0';
            box.style.backgroundColor = '#f9f9f9';
            box.style.borderRadius = '8px';
        });
        
        // Scroll to bottom
        chatbox.scrollTop = chatbox.scrollHeight;
    }, isBot ? 1000 : 0);
}

function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, false);
    userInput.value = '';

    setTimeout(() => {
        try {
            const answer = findAnswer(message);
            addMessage(answer);
        } catch (error) {
            console.error("Error:", error);
            addMessage("<div class='error-message'>Terjadi kesalahan saat memproses pertanyaan Anda. Silakan coba lagi.</div>");
        }
    }, 800);
}

// ================== [7] INITIAL SETUP ================== //
document.addEventListener('DOMContentLoaded', () => {
    // Load dataset
    fetch('dataseek.json')
        .then(response => {
            if (!response.ok) throw new Error('Network error');
            return response.json();
        })
        .then(data => {
            dataset = data.ipa_smp || {};
            addMessage("Halo! Saya asisten IPA. Anda bisa bertanya tentang:");
            addMessage(`
                <div class="welcome-message">
                    <div><b>Biologi</b>: Sel, Fotosintesis, Sistem Organ</div>
                    <div><b>Fisika</b>: Gaya, Energi, Listrik</div>
                    <div><b>Kimia</b>: Asam-Basa, Reaksi Kimia</div>
                </div>
            `);
        })
        .catch(error => {
            console.error("Error loading data:", error);
            addMessage("<div class='error-message'>Sistem sedang dalam pemeliharaan. Silakan coba lagi nanti.</div>");
        });

    // Event listeners
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    document.querySelector('.send-button').addEventListener('click', sendMessage);

    // Clear chat button
    document.getElementById('clearChat').addEventListener('click', () => {
        document.getElementById('chatbox').innerHTML = '';
        sessionContext.lastTopic = null;
        sessionContext.lastSubtopic = null;
        if (dataset.topics) {
            addMessage("Halo! Ada yang bisa saya bantu?");
        }
    });
});

// ================== [8] UTILITY FUNCTIONS ================== //
function debugAnalytics() {
    return {
        cacheSize: responseCache.size,
        lastContext: sessionContext,
        datasetTopics: Object.keys(dataset.topics || {})
    };
}

// For debugging
window.debug = debugAnalytics;
window.clearCache = () => responseCache.clear();
