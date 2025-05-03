let dataset = {};

// Muat data dari dataseek.json
fetch('dataseek.json')
    .then(response => response.json())
    .then(data => {
        dataset = data.ipa_smp;
        addMessage("Bot", "Halo! Saya chatbot IPA SMP. Tanyakan materi Biologi, Fisika, atau Kimia!");
    });

function sendMessage() {
    const userInput = document.getElementById('userInput').value;
    if (!userInput.trim()) return;

    addMessage("Anda", userInput);
    document.getElementById('userInput').value = '';

    // Cari jawaban
    const answer = findAnswer(userInput);
    addMessage("Bot", answer || "Maaf, saya tidak mengerti. Coba gunakan kata kunci seperti 'fotosintesis' atau 'hukum Newton'!");
}

function findAnswer(query) {
    query = query.toLowerCase().trim();
    let bestMatch = null;
    let highestScore = 0;

    // Cari di semua topik
    for (const topic in dataset.topics) {
        for (const subtopic in dataset.topics[topic].subtopics) {
            for (const item of dataset.topics[topic].subtopics[subtopic]) {
                // Hitung skor kecocokan
                let score = 0;
                for (const pattern of item.patterns) {
                    const lowerPattern = pattern.toLowerCase();
                    if (query === lowerPattern) {
                        score = 100; // Pertanyaan persis sama
                        break;
                    } else if (query.includes(lowerPattern)) {
                        score = Math.max(score, lowerPattern.length); // Semakin panjang pola yang cocok, semakin tinggi skor
                    }
                }

                // Simpan jawaban dengan skor tertinggi
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = item;
                }
            }
        }
    }

    return bestMatch ? bestMatch.responses.join('\n') : dataset.fallback_responses[0];
}

function addMessage(sender, message) {
    const chatbox = document.getElementById('chatbox');
    chatbox.innerHTML += `<p><strong>${sender}:</strong> ${message}</p>`;
    chatbox.scrollTop = chatbox.scrollHeight;
}