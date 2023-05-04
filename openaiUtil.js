require("dotenv").config()
const { Configuration, OpenAIApi } = require("openai")
const axios = require("axios")

const configuration = new Configuration({
    organization: process.env.OPENAI_ORGANIZATION,
    apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

// async function sendToOpenAI(prompt) {
//     try {
//         const response = await openai.createCompletion({
//             model: "text-davinci-003",
//             prompt: prompt,
//             max_tokens: 1000, // Max number of tokens to generate
//             temperature: 0, // Make the output deterministic
//         })
//         return response.data.choices[0].text.trim()
//     } catch (error) {
//         console.error(`OPENAI Error: ${error.message}`)
//     }
// }

async function sendToOpenAI(prompt) {
    const messages = []

    messages.push({ role: "user", content: prompt })

    try {
        const response = await openai.createChatCompletion({
            model: "gpt-4",
            messages: messages,
            temperature: 0,
        })

        console.log(response.data.choices[0].message.content)
        return response.data.choices[0].message.content
    } catch (error) {
        if (error.response) {
            console.log(error.response.status)
            console.log(error.response.data)
        } else {
            console.error(`OPENAI Error: ${error.message}`)
        }
    }
}

// async function sendToOpenAI(prompt) {
//     const headers = {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//     }

//     const data = {
//         model: "gpt-3.5-turbo",
//         messages: [{ role: "user", content: prompt }],
//         temperature: 0,
//     }

//     try {
//         const response = await axios.post(
//             "https://api.openai.com/v1/chat/completions",
//             data,
//             { headers }
//         )
//         return response.data.choices[0].message.content
//     } catch (error) {
//         if (error.response && error.response.status === 429) {
//             // Retry after a random delay between 5 and 20 seconds
//             const delay = Math.floor(Math.random() * 16) + 5
//             await new Promise((resolve) => setTimeout(resolve, delay * 1000))
//             return sendToOpenAI(prompt) // Retry the request
//         } else {
//             console.error(error)
//         }
//     }
// }

module.exports = { sendToOpenAI }
