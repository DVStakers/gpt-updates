require("dotenv").config()
const axios = require("axios")
const { sendToOpenAI } = require("./openaiUtil")
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const devVariables = require("./devVariables")

// **************************************
// Clone a repository if it doesn't exist
// **************************************
function cloneRepo(repoUrl, mainRepoPath) {
    console.log("Checking if repository exists...")
    if (fs.existsSync(mainRepoPath)) {
        console.log("Repository already exists. Pulling latest changes...")
        execSync(`cd ${mainRepoPath} && git checkout --quiet main && git pull --quiet`, {
            stdio: "inherit",
        })
        console.log()
    } else {
        console.log("Cloning repository...")
        execSync(`git clone ${repoUrl} ${mainRepoPath}`, { stdio: "inherit" })
        console.log()
    }
}

// ****************************
// Get a file from a local repo
// ****************************
async function getFileFromRepo(repoPath, fileName) {
    try {
        return fs.readFileSync(path.join(repoPath, fileName), "utf-8")
    } catch (error) {
        console.error(`Error reading ${fileName}:`, error)
    }
}

// **********************************************************
// Send a file to OpenAI for parsing of current image versions
// **********************************************************
async function getCurrentImageVersions(fileContents) {
    const prompt = `Read this docker-compose.yml file and find all the images used and the default versions that have been set. Don't include any results that aren't directly images. Only respond with the result in a json object format. Provide no text other than the direct json object result so that I can parse your response directly in my node.js script.\n\n${fileContents}`

    // TODO: This is the step only works with gpt-4, so I'm using a dev variable for now on prod
    return process.env.ENV == "dev" ? devVariables.getCurrentImageVersions : devVariables.getCurrentImageVersions //await sendToOpenAI(prompt)
}

// ***********************************************
// Find GitHub repo URL from DockerHub image name
// ***********************************************
async function getGitHubRepoURL(repoName) {
    prompt = `What is the GitHub repo name for the DockerHub image ${repoName}? Only respond with the GitHub URL, no other text.`

    return process.env.ENV == "dev" ? devVariables.getGitHubRepoURL[repoName] : await sendToOpenAI(prompt)
}

// ***************************************
// Find latest version on GitHub releases
// ***************************************
async function getLatestImageVersion(repoName, currentImageVersion) {
    try {
        gitHubURL = await getGitHubRepoURL(repoName)
        process.env.ENV == "prod" && console.log(`gitHubURL: ${gitHubURL}`)

        const response = await axios.get(`${gitHubURL}/releases/latest`, {
            maxRedirects: 0,
            validateStatus: function (status) {
                return (status >= 200 && status < 400) || status === 302
            },
        })

        const redirectedUrl = response.headers.location

        // Ask ChatGPT to compare the current version with that URL to see which is newer
        const prompt = `This is the version of ${repoName} found from GitHub:\n\n${redirectedUrl}\n\nThis is the version I found in the docker-compose.yml file:\n\n${currentImageVersion}\n\nWhich version is newer? The version found on GitHub might be in a slightly different format from the one in the docker-compose.yml file, so make sure your response is in the format found in the docker-compose.yml file. Don't provide any text other than the version number. If both are the same version, respond with the version found in the docker-compose.yml file.\n\n`

        if (process.env.ENV == "dev") {
            return devVariables.getLatestImageVersion[repoName]
        } else {
            // Works fine with model: "text-davinci-003"
            const result = await sendToOpenAI(prompt)
            console.log(`getLatestImageVersion: ${repoName}: ${result}`)
            return result
        }
    } catch (error) {
        console.error(`Error: ${error.message}`)
    }
}

// ************************************************
// Check if a branch with the specified name exists
// ************************************************
function checkIfBranchExists(mainRepoPath, branchName) {
    try {
        const branches = execSync(`cd ${mainRepoPath} && git branch`, {
            encoding: "utf-8",
        })

        const branchList = branches.split("\n").map((branch) => branch.trim())

        return branchList.includes(branchName)
    } catch (error) {
        console.error(`Error checking for branch existence: ${error.message}`)
        return false
    }
}

// ******************************************
// Checkout a new branch for the image update
// ******************************************
async function checkoutNewBranch(mainRepoPath, branchName) {
    // Create and checkout a new branch for the update
    execSync(`cd ${mainRepoPath} && git checkout --quiet main && git checkout --quiet -b ${branchName}`, {
        stdio: "inherit",
    })
}

// *********************************************************
// Update the docker-compose.yml file with new image versions
// *********************************************************
async function updateDockerComposeFile(repo, latestImageVersion, currentImageVersion, composeFilePath, composeFileContents) {
    // Make changes to the docker-compose.yml file
    // This is simple line replacement for now to avoid returning the whole file
    const prompt = `Change the default version of the image ${repo} from ${currentImageVersion} to ${latestImageVersion}. Keep all the other content of the line identical, only change the version, ensure that all the other content remains the same. I don't want you to return the entire file, because it's too big. Only respond with the number of spaces to indent the line and the contents of the changed line. Don't provide any text other than the number of spaces to indent (as a string e.g. "4") the line and the contents of the changed line in the format:\n\n{"indentation": "<NUMBER_OF_SPACES>", "updatedLine": "{CHANGED_LINE_CONTENT"}\n\n${composeFileContents}`

    // TODO: This is the step only works with gpt-4, so I'm using a dev variable for now on prod
    const result = process.env.ENV == "dev" ? JSON.stringify(devVariables.updateDockerComposeFile[repo]) : JSON.stringify(devVariables.updateDockerComposeFile[repo]) //await sendToOpenAI(prompt)

    process.env.ENV == "prod" && console.log(`updateDockerComposeFile: ${result}`)

    const resultObject = JSON.parse(result)
    const indentationSpaces = " ".repeat(Number(resultObject.indentation))
    const updatedLine = indentationSpaces + resultObject.updatedLine

    const lines = composeFileContents.split("\n")
    const targetLine = `image: ${repo}:`
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(targetLine) && lines[i].includes(currentImageVersion)) {
            lines[i] = updatedLine
            break
        }
    }

    const updatedData = lines.join("\n")
    fs.writeFileSync(composeFilePath, updatedData)
}

// ********************************************************
// Commit and push the changes to the new branch on GitHub
// ********************************************************
async function commitAndPushChanges(mainRepoPath, repo, latestImageVersion, branchName) {
    // Commit the changes
    execSync(`cd ${mainRepoPath} && git add . && git commit --quiet -m "Update ${repo} to ${latestImageVersion}"`, { stdio: "inherit" })

    // Push the branch
    try {
        console.log(`Pushing branch ${branchName} to GitHub`)
        execSync(`cd ${mainRepoPath} && git push --quiet -u origin ${branchName} > /dev/null 2>&1`)
    } catch (error) {
        console.error(error)
    }
}

// ******************************************************
// Create a pull request on GitHub to merge the new branch
// ******************************************************
async function createPullRequest(repo, branchName) {
    const owner = process.env.GITHUB_USERNAME
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`
    const prTitle = "Title test"
    const prBody = "Description test"
    const data = {
        title: prTitle,
        body: prBody,
        head: branchName,
        base: "main",
    }

    console.log("apiUrl:", apiUrl)

    try {
        const response = await axios.post(apiUrl, data, {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
        })
        console.log("Pull request created:", response.data.html_url)
    } catch (error) {
        console.error("Error creating pull request:", error.response.data)
    }
}

async function main() {
    // Set constants
    const mainRepoPath = path.resolve(__dirname, process.env.MAIN_REPO_PATH)
    const mainRepoURL = process.env.MAIN_REPO_URL

    const composeFilePath = path.join(mainRepoPath, "docker-compose.yml")

    // Clone the main repo from GitHub
    cloneRepo(mainRepoURL, mainRepoPath)

    // Read the docker-compose.yml file
    const composeFileContents = await getFileFromRepo(mainRepoPath, "docker-compose.yml")

    // Get the current image versions
    const imageVersions = JSON.parse(await getCurrentImageVersions(composeFileContents))

    // For each image, check if there is a newer version
    // and if there is, update the docker-compose.yml file
    for (const repo in imageVersions) {
        const currentImageVersion = imageVersions[repo]
        const latestImageVersion = await getLatestImageVersion(repo, currentImageVersion)
        const branchName = `update-${repo}-${latestImageVersion}`
        const prExists = checkIfBranchExists(mainRepoPath, branchName)

        if (latestImageVersion != currentImageVersion && !prExists) {
            console.log(`Updating ${repo} from ${currentImageVersion} to ${latestImageVersion}`)

            await checkoutNewBranch(mainRepoPath, branchName)
            await updateDockerComposeFile(repo, latestImageVersion, currentImageVersion, composeFilePath, composeFileContents)
            await commitAndPushChanges(mainRepoPath, repo, latestImageVersion, branchName)
            await createPullRequest(process.env.MAIN_REPO_PATH, branchName)

            // Return to main branch
            execSync(`cd ${mainRepoPath} && git checkout --quiet main`, {
                stdio: "inherit",
            })
        }
    }
}

main()
