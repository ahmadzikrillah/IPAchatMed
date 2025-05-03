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
    query = query.toLowerCase();

    // Cari di semua topik
    for (const topic in dataset.topics) {
        for (const subtopic in dataset.topics[topic].subtopics) {
            for (const item of dataset.topics[topic].subtopics[subtopic]) {
                // Cocokkan pertanyaan
                if (item.patterns.some(pattern => query.includes(pattern.toLowerCase()))) {
                    return item.responses.join('\n');
                }
            }
        }
    }
    return null;
}

function addMessage(sender, message) {
    const chatbox = document.getElementById('chatbox');
    chatbox.innerHTML += `<p><strong>${sender}:</strong> ${message}</p>`;
    chatbox.scrollTop = chatbox.scrollHeight;
}