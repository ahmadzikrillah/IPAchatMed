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
        .replace(/\b(apa|bagaimana|mengapa|tolong|jelaskan|sebutkan|definisi|pengertian|proses|mekanisme)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function enhancedStemming(word) {
    if (!word) return '';

    const specialTerms = {
        "pernapasan": "napas",
        "mekanisme": "mekanik",
        "diafragma": "diafragma",
        "fotosintesis": "fotosintesis",
        "respirasi": "napas"
    };

    if (specialTerms[word]) return specialTerms[word];

    const suffixes = ['nya', 'lah', 'kah', 'pun', 'kan'];
    const prefixes = ['ber', 'ter', 'me', 'pe', 'di'];
    
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

function calculateKeywordsSimilarity(query, keywords) {
    const queryKeywords = new Set(extractKeywords(query));
    const matched = keywords.filter(kw => queryKeywords.has(normalizeText(kw)));
    return matched.length / Math.max(keywords.length, 1);
}

// ================== [4] CORE MATCHING FUNCTIONS ================== //
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
                        confidence: 1.0,
                        patterns: qna.patterns
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
        intent: null,
        patterns: []
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
                        intent: qna.intent,
                        patterns: qna.patterns
                    };
                }
            }
        }
    }
    return bestMatch;
}

function findKeywordMatch(query) {
    const keywords = extractKeywords(query);
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
                        diagram: qna.diagram,
                        intent: qna.intent
                    };
                }
            }
        }
    }
    return bestMatch;
}

// ================== [5] MAIN ANSWER FINDING ================== //
function findAnswer(userQuery) {
    const normalizedQuery = normalizeText(userQuery);
    
    // 1. Check cache first
    if (responseCache.has(normalizedQuery)) {
        return responseCache.get(normalizedQuery);
    }

    // 2. Phase 1: Exact Pattern Matching
    const exactMatch = findExactPatternMatch(normalizedQuery);
    if (exactMatch) {
        sessionContext.lastTopic = exactMatch.topic;
        sessionContext.lastSubtopic = exactMatch.subtopic;
        sessionContext.followUpQuestions = exactMatch.patterns
            .filter(p => normalizeText(p) !== normalizedQuery)
            .slice(0, 3);
        
        const response = formatResponse(exactMatch);
        responseCache.set(normalizedQuery, response);
        return response;
    }

    // 3. Phase 2: Semantic Search
    const semanticMatch = findSemanticMatch(normalizedQuery);
    if (semanticMatch.confidence >= MATCH_CONFIG.SIMILARITY_THRESHOLD) {
        sessionContext.lastTopic = semanticMatch.topic;
        sessionContext.lastSubtopic = semanticMatch.subtopic;
        sessionContext.followUpQuestions = semanticMatch.patterns
            .filter(p => {
                const patternNorm = normalizeText(p);
                return patternNorm !== normalizedQuery && 
                       calculateSimilarity(normalizedQuery, patternNorm) < 0.7;
            })
            .slice(0, 3);
        
        const response = formatResponse(semanticMatch);
        responseCache.set(normalizedQuery, response);
        return response;
    }

    // 4. Phase 3: Keyword-based Fallback
    const keywordMatch = findKeywordMatch(normalizedQuery);
    if (keywordMatch.confidence >= MATCH_CONFIG.MIN_KEYWORD_MATCH) {
        const response = formatResponse(keywordMatch);
        responseCache.set(normalizedQuery, response);
        return response;
    }

    // 5. Final Fallback
    return getFallbackResponse(extractKeywords(userQuery));
}

function getFallbackResponse(keywords) {
    const relatedTopics = [];
    const topicScores = {};
    
    for (const [topic, topicData] of Object.entries(dataset.topics)) {
        for (const [subtopic, subtopicData] of Object.entries(topicData.subtopics)) {
            for (const qna of subtopicData.QnA) {
                const matchedKeywords = qna.keywords.filter(kw => 
                    keywords.some(userKw => normalizeText(kw) === userKw)
                ).length;
                
                if (matchedKeywords > 0) {
                    const topicKey = `${topic} > ${subtopic}`;
                    topicScores[topicKey] = (topicScores[topicKey] || 0) + matchedKeywords;
                }
            }
        }
    }
    
    const sortedTopics = Object.entries(topicScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic]) => topic);
    
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

// ================== [6] RESPONSE FORMATTING ================== //
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
    
    // Debug info (hanya di development)
    if (process.env.NODE_ENV === 'development' && match.confidence) {
        response += `<div class="debug-info">Kecocokan: ${Math.round(match.confidence * 100)}%</div>`;
    }
    
    response += `</div>`;
    return response;
}

// ================== [7] UI MANAGEMENT ================== //
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
            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) typingIndicator.remove();
        }
        
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

// ================== [8] INITIALIZATION & EVENT HANDLERS ================== //
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

    document.getElementById('clearChat').addEventListener('click', () => {
        document.getElementById('chatbox').innerHTML = '';
        sessionContext.lastTopic = null;
        sessionContext.lastSubtopic = null;
        sessionContext.followUpQuestions = [];
        addMessage("Halo! Ada yang bisa saya bantu?");
    });
});

// ================== [9] DEBUGGING UTILITIES ================== //
function debugAnalytics() {
    return {
        cacheSize: responseCache.size,
        lastContext: sessionContext,
        datasetTopics: Object.keys(dataset.topics || {})
    };
}

// Expose for debugging
window.debug = debugAnalytics;
window.clearCache = () => responseCache.clear();
window.findAnswer = findAnswer;  // Untuk testing langsung dari console
