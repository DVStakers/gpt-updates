const { exec } = require("child_process")

async function executeCode(generatedCode) {
    // Install any missing packages that are used in the generated code
    async function installPackage(packageName) {
        return new Promise((resolve, reject) => {
            exec(`npm install ${packageName}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error installing package: ${packageName}`)
                    reject(error)
                } else {
                    console.log(`Installed package: ${packageName}`)
                    resolve(stdout.trim())
                }
            })
        })
    }

    // Log the generated code
    if (process.env.ENV == "prod") {
        console.log("Generated code:")
        console.log(generatedCode)
        console.log()
    }

    try {
        eval(generatedCode)
        return await gptResponseCode()
    } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
            const packageName = error.message.split("'")[1]
            await installPackage(packageName)
            eval(generatedCode)
            return await gptResponseCode()
        } else {
            console.error("Error executing generated code:", error)
        }
    }
}

module.exports = { executeCode }
