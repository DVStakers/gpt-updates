require("dotenv").config()
const { Configuration, OpenAIApi } = require("openai")

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

async function sendToOpenAI(prompt) {
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 50,
        })
        return response.data.choices[0].text.trim()
    } catch (error) {
        console.error(`Error: ${error.message}`)
    }
}

module.exports = { sendToOpenAI }
