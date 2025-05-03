// Initialize dataset variable
let dataset = {};

// Function to add message to chatbox
function addMessage(message, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    const bubbleClass = isBot ? 'bot-message' : 'user-message';
    chatbox.innerHTML += `<div class="message ${bubbleClass}">${message}</div>`;
    chatbox.scrollTop = chatbox.scrollHeight;
}

// Function to find the best matching answer
function findAnswer(query) {
    query = query.toLowerCase().trim();
    let bestMatch = null;
    let highestScore = 0;

    // Search through all topics
    for (const topic in dataset.topics) {
        for (const subtopic in dataset.topics[topic].subtopics) {
            for (const item of dataset.topics[topic].subtopics[subtopic]) {
                // Calculate matching score
                let score = item.patterns.reduce((max, pattern) => {
                    const lowerPattern = pattern.toLowerCase();
                    if (query === lowerPattern) return 100; // Exact match
                    if (query.includes(lowerPattern)) {
                        return Math.max(max, lowerPattern.length); // Partial match
                    }
                    return max;
                }, 0);

                // Keep track of best match
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = item;
                }
            }
        }
    }

    return bestMatch ? bestMatch.responses.join('<br>') : dataset.fallback_responses[0];
}

// Function to handle message sending
function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    if (!message) return;

    // Display user message
    addMessage(message, false);
    userInput.value = '';

    // Process and display bot response
    setTimeout(() => {
        const answer = findAnswer(message);
        addMessage(answer);
    }, 500); // Small delay for better UX
}

// Load dataset and initialize chat
document.addEventListener('DOMContentLoaded', () => {
    fetch('dataseek.json')
        .then(response => response.json())
        .then(data => {
            dataset = data.ipa_smp;
            // Initial bot message
            addMessage("Saya Pak KIKI! Silahkan ketik pertanyaan untuk materi IPA SMP");
        })
        .catch(error => {
            console.error("Error loading dataset:", error);
            addMessage("Maaf, terjadi kesalahan saat memuat data.");
        });

    // Add event listeners
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.querySelector('button').addEventListener('click', sendMessage);
});
