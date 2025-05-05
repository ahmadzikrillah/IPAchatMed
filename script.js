// ================== [1] INITIALIZATION ================== //
let dataset = {};
const responseCache = new Map();
const sessionContext = {
    lastTopic: null,
    lastSubtopic: null,
    followUpQuestions: []
};

const MATCH_CONFIG = {
    EXACT_MATCH_SCORE: 500,
    SIMILARITY_THRESHOLD: 0.85,
    MIN_KEYWORD_MATCH: 2,
    PATTERN_WEIGHT: 0.6,
    INTENT_WEIGHT: 0.3,
    KEYWORD_WEIGHT: 0.1
};

const priorityKeywords = {
    // Biologi
    "sel": 15, "fotosintesis": 15, "mitokondria": 12, 
    "kloroplas": 12, "membran": 10, "nukleus": 10,
    "glukosa": 10, "oksigen": 9, "karbon": 9,
    // Fisika
    "gaya": 14, "energi": 13, "listrik": 12,
    // Kimia
    "asam": 12, "basa": 12, "reaksi": 11
};

// ================== [2] TEXT PROCESSING ================== //
function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, '')
        .replace(/\b(apa|bagaimana|mengapa|tolong|jelaskan|sebutkan|definisi)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function enhancedStemming(word) {
    if (!word) return '';

    const specialTerms = {
        "pernapasan": "napas", "mekanisme": "mekanik",
        "diafragma": "diafragma", "fotosintesis": "fotosintesis"
    };

    if (specialTerms[word]) return specialTerms[word];

    const suffixes = ['nya', 'lah', 'kah', 'pun', 'kan'];
    const prefixes = ['ber', 'ter', 'me', 'pe'];
    
    let stemmed = word;
    
    for (const suffix of suffixes) {
        if (stemmed.endsWith(suffix)) {
            stemmed = stemmed.slice(0, -suffix.length);
            break;
        }
    }
    
    for (const prefix of prefixes) {
        if (stemmed.startsWith(prefix)) {
            stemmed = stemmed.slice(prefix.length);
            break;
        }
    }
    
    return stemmed.length > 2 ? stemmed : word;
}

function extractKeywords(text) {
    return normalizeText(text).split(' ')
        .map(enhancedStemming)
        .filter(word => word.length > 2);
}

// ================== [3] SIMILARITY CALCULATION ================== //
function calculateSimilarity(str1, str2) {
    const tokens1 = new Set(str1.split(' '));
    const tokens2 = new Set(str2.split(' '));
    
    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);
    
    const orderBonus = str1.includes(str2) || str2.includes(str1) ? 0.2 : 0;
    return (union.size > 0 ? intersection.size / union.size : 0) + orderBonus;
}

function calculateBestSimilarity(query, patterns) {
    return Math.max(...patterns.map(p => 
        calculateSimilarity(query, normalizeText(p))
    ));
}

function getBestPatternIndex(query, patterns) {
    let maxScore = 0;
    let bestIndex = -1;
    
    patterns.forEach((pattern, index) => {
        const score = calculateSimilarity(query, normalizeText(pattern));
        if (score > maxScore) {
            maxScore = score;
            bestIndex = index;
        }
    });
    
    return bestIndex;
}

// ================== [4] MATCHING FUNCTIONS ================== //
function findExactPatternMatch(query) {
    for (const [topic, topicData] of Object.entries(dataset.topics)) {
        for (const [subtopic, subtopicData] of Object.entries(topicData.subtopics)) {
            for (const qna of subtopicData.QnA) {
                const patternIndex = qna.patterns.findIndex(p => 
                    normalizeText(p) === query
                );
                if (patternIndex !== -1) {
                    return {
                        topic,
                        subtopic,
                        response: qna.responses[Math.min(patternIndex, qna.responses.length - 1)],
                        diagram: qna.diagram,
                        intent: qna.intent,
                        confidence: 1.0
                    };
                }
            }
        }
    }
    return null;
}

function findSemanticMatch(query) {
    let bestMatch = {
        confidence: 0,
        response: null,
        topic: null,
        subtopic: null,
        diagram: null,
        intent: null
    };

    for (const [topic, topicData] of Object.entries(dataset.topics)) {
        for (const [subtopic, subtopicData] of Object.entries(topicData.subtopics)) {
            for (const qna of subtopicData.QnA) {
                const patternScore = calculateBestSimilarity(query, qna.patterns);
                const intentScore = qna.intent ? calculateSimilarity(query, normalizeText(qna.intent)) : 0;
                const keywordScore = calculateKeywordsSimilarity(query, qna.keywords);
                
                const totalScore = (patternScore * MATCH_CONFIG.PATTERN_WEIGHT) + 
                                 (intentScore * MATCH_CONFIG.INTENT_WEIGHT) + 
                                 (keywordScore * MATCH_CONFIG.KEYWORD_WEIGHT);
                
                if (totalScore > bestMatch.confidence) {
                    const bestPatternIndex = getBestPatternIndex(query, qna.patterns);
                    const responseIndex = bestPatternIndex !== -1 ? 
                        Math.min(bestPatternIndex, qna.responses.length - 1) : 0;
                    
                    bestMatch = {
                        confidence: totalScore,
                        topic,
                        subtopic,
                        response: qna.responses[responseIndex],
                        diagram: qna.diagram,
                        intent: qna.intent
                    };
                }
            }
        }
    }
    return bestMatch;
}

function calculateKeywordsSimilarity(query, keywords) {
    const queryKeywords = new Set(extractKeywords(query));
    const matched = keywords.filter(kw => queryKeywords.has(normalizeText(kw)));
    return matched.length / Math.max(keywords.length, 1);
}

function findKeywordMatch(query) {
    const keywords = extractKeywords(query);
    let bestMatch = {
        confidence: 0,
        response: null,
        topic: null,
        subtopic: null,
        diagram: null
    };

    for (const [topic, topicData] of Object.entries(dataset.topics)) {
        for (const [subtopic, subtopicData] of Object.entries(topicData.subtopics)) {
            for (const qna of subtopicData.QnA) {
                const matchedKeywords = qna.keywords.filter(kw => 
                    keywords.includes(normalizeText(kw))
                ).length;
                
                const confidence = matchedKeywords / Math.max(qna.keywords.length, 1);
                
                if (confidence > bestMatch.confidence) {
                    bestMatch = {
                        confidence,
                        topic,
                        subtopic,
                        response: qna.responses[0],
                        diagram: qna.diagram
                    };
                }
            }
        }
    }
    return bestMatch;
}

// ================== [5] RESPONSE MANAGEMENT ================== //
function formatResponse(match) {
    let response = `
        <div class="answer-box">
            <div class="topic-header">
                <span class="topic-badge">${match.topic}</span>
                <span class="subtopic-badge">${match.subtopic}</span>
            </div>
            <div class="answer-content">${match.response}</div>
    `;
    
    if (match.diagram) {
        response += `
            <div class="diagram-container">
                <img src="${match.diagram}" alt="${match.subtopic}" loading="lazy">
            </div>
        `;
    }
    
    // Debug info
    if (process.env.NODE_ENV === 'development') {
        response += `<div class="debug-info">Confidence: ${Math.round(match.confidence * 100)}%</div>`;
    }
    
    response += `</div>`;
    return response;
}

function getFallbackResponse(keywords) {
    const suggestions = [
        'Coba tanyakan tentang: sel, fotosintesis, sistem organ',
        'Atau tentang: gaya, energi, listrik',
        'Bisa juga tentang: asam-basa, reaksi kimia'
    ];
    
    return `
        <div class="not-found">
            <p>Maaf, saya tidak menemukan jawaban yang tepat.</p>
            <p>${suggestions.join('<br>')}</p>
        </div>
    `;
}

// ================== [6] CHAT INTERFACE ================== //
function addMessage(message, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    
    if (isBot) {
        chatbox.innerHTML += `
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>`;
        chatbox.scrollTop = chatbox.scrollHeight;
    }

    setTimeout(() => {
        if (isBot) {
            document.querySelector('.typing-indicator')?.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isBot ? 'bot-message' : 'user-message'}`;
        messageDiv.innerHTML = message;
        chatbox.appendChild(messageDiv);
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
            addMessage(`
                <div class="error-message">
                    Terjadi kesalahan. Silakan coba lagi atau refresh halaman.
                </div>
            `);
        }
    }, 800);
}

// ================== [7] SETUP & UTILITIES ================== //
function loadDataset() {
    return fetch('dataseek.json')
        .then(response => {
            if (!response.ok) throw new Error('Network error');
            return response.json();
        })
        .then(data => {
            dataset = data.ipa_smp || {};
            return true;
        })
        .catch(error => {
            console.error("Error loading dataset:", error);
            return false;
        });
}

function initializeChat() {
    addMessage(`
        <div class="welcome-message">
            <strong>Asisten IPA SMP/MTs</strong><br>
            Silakan bertanya tentang:<br>
            • Biologi: Sel, Fotosintesis, Sistem Organ<br>
            • Fisika: Gaya, Energi, Listrik<br>
            • Kimia: Asam-Basa, Reaksi Kimia
        </div>
    `);
}

function setupEventListeners() {
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    document.querySelector('.send-button').addEventListener('click', sendMessage);

    document.getElementById('clearChat').addEventListener('click', () => {
        document.getElementById('chatbox').innerHTML = '';
        sessionContext.lastTopic = null;
        sessionContext.lastSubtopic = null;
        initializeChat();
    });
}

// ================== [8] MAIN INITIALIZATION ================== //
document.addEventListener('DOMContentLoaded', () => {
    loadDataset().then(success => {
        if (success) {
            initializeChat();
        } else {
            addMessage(`
                <div class="error-message">
                    Gagal memuat data. Silakan refresh halaman.
                </div>
            `);
        }
    });
    
    setupEventListeners();
});

// Debug utilities
window.debug = {
    clearCache: () => responseCache.clear(),
    getSession: () => sessionContext,
    testQuery: (query) => findAnswer(query)
};
