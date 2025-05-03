// Inisialisasi dataset
let dataset = {};

// Fungsi normalisasi teks
function normalizeText(text) {
    return text.toLowerCase()
        .replace(/[?_.,]/g, '') // Hapus tanda baca
        .trim();
}

// Fungsi tambah pesan ke chatbox
function addMessage(message, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    const bubbleClass = isBot ? 'bot-message' : 'user-message';
    chatbox.innerHTML += `<div class="message ${bubbleClass}">${message}</div>`;
    chatbox.scrollTop = chatbox.scrollHeight;
}

// Fungsi pencarian jawaban yang diperbarui
function findAnswer(query) {
    const cleanQuery = normalizeText(query);
    let bestMatch = null;
    let highestScore = 0;

    // Debug: Tampilkan query yang dinormalisasi
    console.log(`Mencari: "${cleanQuery}"`);

    for (const topic in dataset.topics) {
        for (const subtopic in dataset.topics[topic].subtopics) {
            for (const item of dataset.topics[topic].subtopics[subtopic]) {
                let score = item.patterns.reduce((max, pattern) => {
                    const cleanPattern = normalizeText(pattern);
                    
                    // Exact match
                    if (cleanQuery === cleanPattern) return 100;
                    
                    // Partial match dua arah
                    if (cleanQuery.includes(cleanPattern) || cleanPattern.includes(cleanQuery)) {
                        return Math.max(max, cleanPattern.length * 2); // Bobot lebih untuk pola lebih panjang
                    }
                    
                    return max;
                }, 0);

                // Debug: Tampilkan skor pencocokan
                if (score > 0) console.log(`Pola: "${item.patterns}" | Skor: ${score}`);

                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = item;
                }
            }
        }
    }

    return bestMatch ? bestMatch.responses.join('<br>') : dataset.fallback_responses[0];
}

// Fungsi kirim pesan
function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, false);
    userInput.value = '';

    // Beri delay untuk simulasi bot "mengetik"
    setTimeout(() => {
        const answer = findAnswer(message);
        addMessage(answer);
    }, 600);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load dataset
    fetch('dataseek.json')
        .then(response => response.json())
        .then(data => {
            dataset = data.ipa_smp;
            addMessage("Saya Pak KIKI! Silakan tanyakan materi IPA SMP (contoh: fotosintesis, sistem pencernaan)");
        })
        .catch(error => {
            console.error("Error:", error);
            addMessage("Maaf, sedang ada gangguan. Coba lagi nanti.");
        });

    // Input keyboard
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Tombol kirim
    document.querySelector('button').addEventListener('click', sendMessage);
});
