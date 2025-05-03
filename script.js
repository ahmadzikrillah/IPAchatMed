// Inisialisasi variabel untuk menyimpan data
let dataset = {};

// Fungsi untuk menambahkan pesan ke chatbox (tanpa label "Bot" atau "Anda")
function addMessage(message) {
    const chatbox = document.getElementById('chatbox');
    chatbox.innerHTML += `<p>${message}</p>`;
    chatbox.scrollTop = chatbox.scrollHeight;
}

// Fungsi untuk mencari jawaban dari dataset
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
                        score = Math.max(score, lowerPattern.length);
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

    return bestMatch ? bestMatch.responses.join('<br>') : dataset.fallback_responses[0];
}

// Fungsi untuk menangani pengiriman pesan
function sendMessage() {
    const userInput = document.getElementById('userInput').value;
    if (!userInput.trim()) return;

    // Tampilkan pesan user
    addMessage(userInput);
    document.getElementById('userInput').value = '';

    // Cari dan tampilkan jawaban
    const answer = findAnswer(userInput);
    addMessage(answer);
}

// Load dataset dan tampilkan pesan pembuka
fetch('dataseek.json')
    .then(response => response.json())
    .then(data => {
        dataset = data.ipa_smp;
        // Pesan pembuka tanpa label "Bot:"
        addMessage("Saya Pak KIKI! Silahkan ketik pertanyaan untuk materi IPA SMP");
    })
    .catch(error => {
        console.error("Error loading dataset:", error);
        addMessage("Maaf, terjadi error saat memuat data.");
    });

// Tambahkan event listener untuk tombol Enter
document.getElementById('userInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
