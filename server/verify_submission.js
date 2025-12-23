const axios = require('axios');

async function verifySubmission() {
    console.log("Submitting mock job to server...");
    try {
        const response = await axios.post('http://localhost:3000/api/queue', {
            "url": "https://docs.google.com/forms/d/e/1FAIpQLSfoAyr5s-BgsjO6o4Fr90_4PLL07jLpNzRoQ9hvabZypOq2dA/viewform",
            formData: {
                "Email": "test@example.com",
                "Name": "Verification Test"
            }
        });
        console.log("SUCCESS! Task created:", response.data);

        console.log("\nChecking queue status...");
        const queueResponse = await axios.get('http://localhost:3000/api/queue');
        console.log("Queue Status:", JSON.stringify(queueResponse.data, null, 2));
    } catch (error) {
        console.error("FAILURE. Error:", error.message);
        if (error.response) {
            console.error("Response data:", error.response.data);
        }
    }
}

verifySubmission();
