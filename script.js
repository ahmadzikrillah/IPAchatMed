// ================== [1] INITIALIZATION ================== //
let dataset = {};

// ================== [2] TEXT PROCESSING ================== //
// Fungsi normalisasi teks terbaru (support kata tanya & tanda baca)
function normalizeText(text) {
    const questionWords = ['apa', 'bagaimana', 'mengapa', 'jelaskan', 'sebutkan', 'bisa', 'dimaksud', 'sebutkan', 'fungsi', 'dengan', 'bisakah'];
    return text.toLowerCase()
        .replace(/[?.,!]/g, '')
        .split(' ')
        .filter(word => !questionWords.includes(word))
        .join(' ')
        .trim();
}

// Fungsi ekstraksi kata kunci baru
function extractKeywords(text) {
    const stopWords = ['di', 'ke', 'dari', 'pada', 'adalah', 'itu', 'dan', 'yang', 'untuk'];
    return text.split(' ')
        .filter(word => word.length > 3 && !stopWords.includes(word));
}

// ================== [3] CHAT DISPLAY (TIDAK BERUBAH) ================== //
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
        }
        chatbox.innerHTML += `
            <div class="message ${isBot ? 'bot-message' : 'user-message'}">
                ${message}
            </div>`;
        chatbox.scrollTop = chatbox.scrollHeight;
    }, isBot ? 1000 : 0);
}

// ================== [4] ANSWER MATCHING (UPDATED) ================== //
function findAnswer(query) {
    const cleanQuery = normalizeText(query);
    const keywords = extractKeywords(cleanQuery);
    let bestMatch = null;
    let highestScore = 0;

    console.log(`Keywords detected: ${keywords.join(', ')}`); // Debug

    // Priority keywords (bisa ditambah di dataseek.json)
    const priorityKeywords = {
        "fotosintesis": 10,
        "sel": 8,
        "energi": 6
    };

    // Cari di semua topik
    for (const topic in dataset.topics) {
        for (const subtopic in dataset.topics[topic].subtopics) {
            for (const item of dataset.topics[topic].subtopics[subtopic]) {
                let score = 0;

                // [A] Skor berdasarkan kata kunci
                keywords.forEach(keyword => {
                    if (item.keywords?.includes(keyword)) {
                        score += priorityKeywords[keyword] || 5;
                    }
                });

                // [B] Skor berdasarkan pola
                item.patterns.forEach(pattern => {
                    const cleanPattern = normalizeText(pattern);
                    if (cleanPattern === cleanQuery) {
                        score += 20; // Exact match
                    } else if (cleanQuery.includes(cleanPattern) || cleanPattern.includes(cleanQuery)) {
                        score += 10; // Partial match
                    }
                });

                // [C] Simpan yang terbaik
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = item;
                }
            }
        }
    }

    return bestMatch?.responses.join('<br>') || dataset.fallback_responses[0];
}

// ================== [5] MESSAGE HANDLING (TIDAK BERUBAH) ================== //
function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, false);
    userInput.value = '';

    setTimeout(() => {
        const answer = findAnswer(message);
        addMessage(answer);
    }, 800);
}

// ================== [6] INITIAL SETUP (TIDAK BERUBAH) ================== //
document.addEventListener('DOMContentLoaded', () => {
    // Load dataset
    fetch('dataseek.json')
        .then(response => response.json())
        .then(data => {
            dataset = data.ipa_smp;
            addMessage("Halo! Saya Pak KIKI 🤖.Silahkan ketik pertanyaanmu tentang materi IPA:");
        })
        .catch(error => {
            console.error("Error:", error);
            addMessage("Maaf, sedang ada gangguan teknis. Coba lagi nanti!");
        });

    // Event listeners
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    document.querySelector('button').addEventListener('click', sendMessage);
});
