const { GoogleGenerativeAI } = require("@google/generative-ai");

// Usage: node test-gemini.js <YOUR_API_KEY>
const apiKey = process.argv[2];

if (!apiKey) {
    console.error("Please provide an API key: node test-gemini.js AIzaSy...");
    process.exit(1);
}

async function testGemini() {
    console.log("Testing Gemini Connection...");
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = "Hello! Are you working? Reply with 'Yes, I am online.'";
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        console.log("SUCCESS! Gemini Response:", text);
    } catch (error) {
        console.error("FAILURE. Error:", error.message);
    }
}

testGemini();
