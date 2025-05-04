// ================== [1] INITIALIZATION ================== //
let dataset = {};
const responseCache = new Map();
const priorityKeywords = {
  "sel": 10, "fotosintesis": 10, "pernapasan": 8, 
  "pencernaan": 8, "darah": 8, "saraf": 8,
  "gaya": 10, "gerak": 9, "tekanan": 9,
  "asam": 8, "basa": 8, "kimia": 7,
  "listrik": 9, "magnet": 8, "cahaya": 8,
  "bunyi": 7, "zat": 7, "reaksi": 8
};

// Analytics tracking
const usageAnalytics = {
  totalQueries: 0,
  answered: 0,
  unanswered: 0,
  topics: {},
  failedRequests: 0
};

// ================== [2] TEXT PROCESSING ================== //
function normalizeText(text) {
    const questionWords = ['apa', 'bagaimana', 'mengapa', 'jelaskan', 'sebutkan', 'bisa', 'dimaksud', 'tentang', 'fungsi'];
    return text.toLowerCase()
        .replace(/[?.,!]/g, '')
        .split(' ')
        .filter(word => word.length > 2 && !questionWords.includes(word))
        .join(' ')
        .trim();
}

function extractKeywords(text) {
    const stopWords = ['di', 'ke', 'dari', 'pada', 'adalah', 'itu', 'dan', 'yang', 'untuk'];
    const suffixes = ['nya', 'lah', 'kah'];
    
    return text.split(' ')
        .map(word => {
            // Simple stemming
            let stemmed = word;
            for (const suffix of suffixes) {
                if (word.endsWith(suffix)) {
                    stemmed = word.slice(0, -suffix.length);
                    break;
                }
            }
            return stemmed;
        })
        .filter(word => word.length > 2 && !stopWords.includes(word));
}

// ================== [3] CHAT DISPLAY ================== //
function addMessage(message, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    
    if (isBot) {
        chatbox.innerHTML += `
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>`;
    }

    setTimeout(() => {
        if (isBot) {
            document.querySelector('.typing-indicator')?.remove();
            if (message.includes('<img') || message.length > 60) {
                message = `<div class="answer-header">Berikut penjelasannya:</div>` + message;
            }
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isBot ? 'bot-message' : 'user-message'}`;
        messageDiv.innerHTML = message;
        chatbox.appendChild(messageDiv);
        
        // Apply styles to diagrams
        const diagrams = messageDiv.querySelectorAll('.diagram');
        diagrams.forEach(diagram => {
            diagram.style.maxWidth = '100%';
            diagram.style.height = 'auto';
            diagram.style.borderRadius = '8px';
            diagram.style.marginTop = '10px';
            diagram.style.display = 'block';
        });
        
        chatbox.scrollTop = chatbox.scrollHeight;
    }, isBot ? 1000 : 0);
}

// ================== [4] ANSWER MATCHING ================== //
function findAnswer(query) {
    usageAnalytics.totalQueries++;
    const cacheKey = normalizeText(query);
    
    // Check cache first
    if (responseCache.has(cacheKey)) {
        usageAnalytics.answered++;
        return responseCache.get(cacheKey);
    }

    const cleanQuery = normalizeText(query);
    const keywords = extractKeywords(cleanQuery);
    let bestMatch = null;
    let highestScore = 0;

    console.log(`Processing: "${query}" → Keywords: ${keywords.join(', ')}`);

    // Search through all topics and subtopics
    for (const [topic, topicData] of Object.entries(dataset.topics)) {
        for (const [subtopic, subtopicData] of Object.entries(topicData.subtopics)) {
            for (const qna of subtopicData.QnA) {
                let score = 0;

                // [1] Enhanced Keyword Matching
                const combinedKeywords = [
                    ...(qna.keywords || []),
                    ...qna.patterns.flatMap(p => extractKeywords(p))
                ];
                
                const uniqueKeywords = [...new Set(combinedKeywords)];
                
                uniqueKeywords.forEach(keyword => {
                    if (keywords.includes(keyword)) {
                        score += 5 + (priorityKeywords[keyword] || 0);
                    }
                });

                // [2] Intent Matching
                if (qna.intent && cleanQuery.includes(qna.intent)) {
                    score += 15;
                }

                // [3] Pattern Matching
                qna.patterns.forEach(pattern => {
                    const cleanPattern = normalizeText(pattern);
                    
                    // Exact match
                    if (cleanPattern === cleanQuery) {
                        score += 30;
                        return;
                    }
                    
                    // Partial match
                    const patternKeywords = extractKeywords(cleanPattern);
                    const matchedKeywords = patternKeywords.filter(kw => 
                        keywords.includes(kw)
                    ).length;
                    
                    score += matchedKeywords * 5;
                    
                    // Context match
                    if (cleanQuery.includes(cleanPattern) || cleanPattern.includes(cleanQuery)) {
                        score += 10;
                    }
                });

                // Update best match
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = {
                        responses: qna.responses,
                        diagram: qna.diagram,
                        topic,
                        subtopic
                    };
                }
            }
        }
    }

    // Dynamic threshold
    const threshold = Math.max(25, keywords.length * 5);
    
    if (highestScore >= threshold && bestMatch) {
        const randomResponse = bestMatch.responses[Math.floor(Math.random() * bestMatch.responses.length)];
        let response = randomResponse;
        
        if (bestMatch.diagram) {
            response += `<br><img src="${bestMatch.diagram}" alt="Diagram ${bestMatch.subtopic}" class="diagram" loading="lazy">`;
        }
        
        // Add to cache
        responseCache.set(cacheKey, response);
        usageAnalytics.answered++;
        usageAnalytics.topics[bestMatch.topic] = (usageAnalytics.topics[bestMatch.topic] || 0) + 1;
        
        return response;
    }
    
    usageAnalytics.unanswered++;
    return "Maaf, saya belum bisa menjawab pertanyaan itu. Coba tanyakan dengan cara lain atau tentang topik yang berbeda.";
}

// ================== [5] MESSAGE HANDLING ================== //
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
            console.error("Error processing answer:", error);
            addMessage("Terjadi kesalahan saat memproses pertanyaan Anda. Silakan coba lagi.");
        }
    }, 800);
}

// ================== [6] INITIAL SETUP ================== //
document.addEventListener('DOMContentLoaded', () => {
    // Load dataset with timeout
    Promise.race([
        fetch('dataseek.json'),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
        )
    ])
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        dataset = data.ipa_smp;
        addMessage("Halo! Saya asisten IPA 🤖. Anda bisa bertanya tentang:");
        addMessage("<b>Biologi</b>: Sel, Fotosintesis, Sistem Organ<br>" +
                  "<b>Fisika</b>: Gaya, Gerak, Listrik<br>" +
                  "<b>Kimia</b>: Asam-Basa, Reaksi Kimia");
        
        // Initialize MutationObserver for lazy loading
        if (window.MutationObserver) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.querySelectorAll) {
                            node.querySelectorAll('img[data-src]').forEach(img => {
                                img.src = img.dataset.src;
                            });
                        }
                    });
                });
            });
            observer.observe(document.getElementById('chatbox'), { childList: true, subtree: true });
        }
    })
    .catch(error => {
        console.error("Error loading data:", error);
        usageAnalytics.failedRequests++;
        addMessage("Maaf, sedang ada gangguan teknis. Coba lagi nanti!");
        
        // Fallback dataset
        dataset = { 
            topics: {}, 
            fallback_responses: [
                "Sistem sedang dalam perbaikan",
                "Coba tanyakan lagi nanti",
                "Saya tidak bisa mengakses data saat ini"
            ]
        };
    });

    // Event listeners with debouncing
    let inputTimeout;
    const userInput = document.getElementById('userInput');
    
    userInput.addEventListener('input', () => {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
            // Could add auto-suggestions here
        }, 300);
    });

    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    document.querySelector('button').addEventListener('click', sendMessage);
    
    // Add clear button functionality
    document.getElementById('clearChat')?.addEventListener('click', () => {
        document.getElementById('chatbox').innerHTML = '';
        if (dataset.topics) {
            addMessage("Halo! Ada yang bisa saya bantu?");
        }
    });
});

// ================== [7] UTILITY FUNCTIONS ================== //
function getAnalytics() {
    return {
        ...usageAnalytics,
        answerRate: usageAnalytics.totalQueries > 0 
            ? (usageAnalytics.answered / usageAnalytics.totalQueries * 100).toFixed(1) + '%' 
            : '0%'
    };
}

// For debugging
window.getAnalytics = getAnalytics;
window.clearCache = () => responseCache.clear();
