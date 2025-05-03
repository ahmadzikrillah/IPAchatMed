// ========== [1] INITIALIZATION ========== //
let dataset = {};

// ========== [2] TEXT PROCESSING ========== //
function normalizeText(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')         // Hapus simbol
        .replace(/\b(apa|bagaimana|jelaskan|sebutkan)\b/g, '')  // Hapus kata tanya
        .replace(/\s+/g, ' ')                 // Gabungkan spasi ganda
        .trim();
}

// ========== [3] CHAT DISPLAY ========== //
function addMessage(message, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    
    // Typing indicator (hanya untuk bot)
    if (isBot) {
        chatbox.innerHTML += `
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>`;
    }

    // Tampilkan pesan setelah delay
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

// ========== [4] ANSWER MATCHING ========== //
function findAnswer(query) {
    const cleanQuery = normalizeText(query);
    let exactMatch = null;
    let partialMatch = null;

    // Debug: Tampilkan query yang dinormalisasi
    console.log(`Mencari: "${cleanQuery}"`);

    // Cari di semua topik
    for (const topic in dataset.topics) {
        for (const subtopic in dataset.topics[topic].subtopics) {
            for (const item of dataset.topics[topic].subtopics[subtopic]) {
                
                // Cek exact match
                const isExactMatch = item.patterns.some(p => 
                    normalizeText(p) === cleanQuery
                );
                
                // Cek partial match
                const isPartialMatch = item.patterns.some(p => {
                    const normalizedPattern = normalizeText(p);
                    return (
                        cleanQuery.includes(normalizedPattern) || 
                        normalizedPattern.includes(cleanQuery)
                    );
                });

                if (isExactMatch) {
                    exactMatch = item;
                    break;
                } else if (isPartialMatch) {
                    partialMatch = item;
                }
            }
            if (exactMatch) break;
        }
        if (exactMatch) break;
    }

    return (exactMatch || partialMatch)?.responses.join('<br>') || dataset.fallback_responses[0];
}

// ========== [5] MESSAGE HANDLING ========== //
function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    if (!message) return;

    // Tampilkan pesan user
    addMessage(message, false);
    userInput.value = '';

    // Proses dan tampilkan jawaban
    setTimeout(() => {
        const answer = findAnswer(message);
        addMessage(answer);
    }, 800);
}

// ========== [6] INITIAL SETUP ========== //
document.addEventListener('DOMContentLoaded', () => {
    // Load dataset
    fetch('dataseek.json')
        .then(response => response.json())
        .then(data => {
            dataset = data.ipa_smp;
            addMessage("Halo! Saya Pak KIKI 🤖. Tanyakan materi IPA SMP:");
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
