require("dotenv").config()
const fs = require("fs")
const path = require("path")
const axios = require("axios")
const cheerio = require("cheerio")
const { execSync } = require("child_process")

const { sendToOpenAI } = require("./openaiUtil")
const devVariables = require("./devVariables")

// **************************************
// Clone a repository if it doesn't exist
// **************************************
function cloneRepo(repoUrl, mainRepoPath) {
    console.log(`Checking if ${process.env.MAIN_REPO_NAME} repository exists in local environment...`)
    if (fs.existsSync(mainRepoPath)) {
        console.log("Repository already exists. Pulling latest changes...")
        execSync(`cd ${mainRepoPath} && git checkout --quiet main && git pull --quiet`, {
            stdio: "inherit",
        })
        console.log("Repo up-to-date.")
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

// ******************************************
// Checkout a new branch for the image update
// ******************************************
async function checkoutNewBranch(mainRepoPath, branchName) {
    console.log(`Creating new branch ${branchName}...`)
    execSync(`cd ${mainRepoPath} && git checkout --quiet main && git checkout --quiet -b ${branchName}`, { stdio: "inherit" })
}

// *********************************************************
// Update the docker-compose.yml file with new image versions
// *********************************************************
async function updateDockerComposeFile(repo, latestImageVersion, currentImageVersion, composeFilePath, composeFileContents) {
    console.log(`Updating docker-compose.yml image for ${repo}...`)

    // Make changes to the docker-compose.yml file
    // This is simple line replacement for now to avoid returning the whole file
    // TODO: Simplify this step by asking return the whole file (I think that will require gpt-4)
    const prompt = `Change the default version of the image ${repo} from ${currentImageVersion} to ${latestImageVersion}. Keep all the other content of the line identical, only change the version, ensure that all the other content remains the same. I don't want you to return the entire file, because it's too big. Only respond with the number of spaces to indent the line and the contents of the changed line. Don't provide any text other than the number of spaces to indent (as a string e.g. "4") the line and the contents of the changed line in the format:\n\n{"indentation": "<NUMBER_OF_SPACES>", "updatedLine": "{CHANGED_LINE_CONTENT"}\n\n${composeFileContents}`

    // TODO: This is the step only works with gpt-4, so I'm using a dev variable for now on prod
    const result = process.env.ENV == "dev" ? JSON.stringify(devVariables.updateDockerComposeFile[repo]) : JSON.stringify(devVariables.updateDockerComposeFile[repo]) //await sendToOpenAI(prompt)

    process.env.ENV == "prod" && console.log(`updateDockerComposeFile: ${result}`)

    const resultObject = JSON.parse(result)
    const indentationSpaces = " ".repeat(Number(resultObject.indentation))
    const updatedLine = indentationSpaces + resultObject.updatedLine

    const lines = composeFileContents.split("\n")
    // TODO: This shouldn't be hardcoded as I should ask ChatGPT to find the line
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

// ***************
// Commit changes
// ***************
async function commitChanges(mainRepoPath, repo, latestImageVersion) {
    console.log(`Committing changes to local branch...`)
    execSync(`cd ${mainRepoPath} && git add . && git commit --quiet -m "Update ${repo} to ${latestImageVersion}"`, { stdio: "inherit" })
}

// *********************************************
// Push the changes to the new branch on GitHub
// *********************************************
async function pushChanges(mainRepoPath, branchName) {
    try {
        console.log(`Pushing branch ${branchName} to GitHub...`)
        execSync(`cd ${mainRepoPath} && git push --quiet -u origin ${branchName} > /dev/null 2>&1`)
    } catch (error) {
        console.error(error)
    }
}

// ********************
// Delete local branch
// ********************
async function deleteLocalBranch(mainRepoPath, branchName) {
    const branchExists = await checkIfLocalBranchExists(mainRepoPath, branchName)

    if (branchExists) {
        console.log(`Deleting local branch ${branchName}...`)
        execSync(`cd ${mainRepoPath} && git checkout --quiet main && git branch --quiet -D ${branchName} 2>/dev/null`, { stdio: "inherit" })
    }
}

// ******************************************************
// Create a summary of the release notes for the PR body
// ******************************************************
async function getReleaseNoteSummary(composeFileContents, repo, releaseNotes) {
    //TODO: This is the prompt I want to use, but it's too long for the current model (text-davinci-003)
    // const prompt = `Here is a docker-compose.yml file:\n\n${composeFileContents}\n\nAnd here are the release notes for a new version of ${repo}: \n\n${releaseNotes}\n\nWrite a summary of the release notes for a PR description for updating that docker-compose.yml file with this new version of ${repo} from the release notes. Specifically mention any changes that would impact the current usage (e.g. flags changed or deprecated, etc.). Only provide the body of the PR update, no other text or acknowledgment. Write your output using markdown syntax (specifically bullet points and headings to make it easier to read), as it will be used in the body of a GitHub PR so can be formatted. Any flags, paths or code references should be wrapped in backticks \` so they are formatted in the PR body.`

    // This is the prompt I'm using for now, but it's not as good as it doesn't include the docker-compose.yml file contents so is less specific
    const prompt = `Here are the release notes for a new version of ${repo}: \n\n${releaseNotes}\n\nWrite a summary of the important release notes for a PR description for updating a docker-compose.yml file with this new version of ${repo} from the release notes. Specifically mention any changes that would impact current usage (e.g. flags changed or deprecated, etc.). Only provide the body of the PR update, no other text or acknowledgment. Write your output using markdown syntax (specifically bullet points and headings to make it easier to read), as it will be used in the body of a GitHub PR so can be formatted. Any flags, paths or code references should be wrapped in backticks \` so they are formatted in the PR body.`

    console.log(`Getting latest release note summary for ${repo}...`)
    return process.env.ENV == "dev" ? "Test description" : await sendToOpenAI(prompt)
}

// ****************************************************
// Create the body of the PR based on the updated files
// ****************************************************
async function createPullRequestBody(repo, composeFileContents) {
    gitHubURL = await getGitHubRepoURL(repo)

    try {
        const url = `${gitHubURL}/releases/latest`
        const response = await axios.get(url)
        const html = response.data

        const $ = cheerio.load(html)
        // TODO: Hardcoded for now, but should be able to find this automatically
        const bodyContent = $('[data-test-selector="body-content"]').text().trim()

        return await getReleaseNoteSummary(composeFileContents, repo, bodyContent)
    } catch (error) {
        console.error("Error extracting release notes:", error.message)
    }
}

// **********************************************
// Create a PR on GitHub to merge the new branch
// **********************************************
async function createPullRequest(mainRepo, branchName, repo, currentImageVersion, latestImageVersion, composeFileContents) {
    const owner = process.env.GITHUB_MAIN_USERNAME
    const apiUrl = `https://api.github.com/repos/${owner}/${mainRepo}/pulls`
    const prTitle = `GPT - Updating ${repo} from ${currentImageVersion} to ${latestImageVersion}`
    const prBody = await createPullRequestBody(repo, composeFileContents)

    const data = {
        title: prTitle,
        body: prBody,
        head: branchName,
        base: "main",
    }

    try {
        console.log(`Creating PR for branch ${branchName}...`)
        const response = await axios.post(apiUrl, data, {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
        })
        console.log("PR created:", response.data.html_url)
        await addReviewer(mainRepo, response.data.number)
    } catch (error) {
        console.error("Error creating PR:", error.response.data)
    }
}

// ***********************************
// Add a reviewer to the PR on GitHub
// ***********************************
async function addReviewer(mainRepo, pullRequestNumber) {
    const owner = process.env.GITHUB_MAIN_USERNAME
    const apiUrl = `https://api.github.com/repos/${owner}/${mainRepo}/pulls/${pullRequestNumber}/requested_reviewers`
    const data = {
        reviewers: [process.env.GITHUB_MAIN_USERNAME],
    }

    try {
        await axios.post(apiUrl, data, {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
        })
    } catch (error) {
        console.error("Error adding reviewer to PR:", error.response.data)
    }
}

// *****************************
// Check if local branch exists
// *****************************
async function checkIfLocalBranchExists(mainRepoPath, branchName) {
    return execSync(`cd ${mainRepoPath} && git branch --list ${branchName}`, { encoding: "utf-8" }).trim().length > 0
}

// ****************************************
// Check if remote branch exists on GitHub
// ****************************************
async function checkIfRemoteBranchExists(mainRepoPath, branchName) {
    return execSync(`cd ${mainRepoPath} && git ls-remote --heads origin ${branchName}`, { encoding: "utf-8" }).trim().length > 0
}

// *************************************
// Check if PR already exists on GitHub
// *************************************
async function checkIfPrExists(owner, repo, branchName) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`

    try {
        const response = await axios.get(apiUrl, {
            params: {
                head: `${owner}:${branchName}`,
                state: "all",
            },
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
            },
        })

        const pullRequests = response.data

        for (const pr of pullRequests) {
            if (pr.state === "open" || pr.state === "merged") {
                return true
            }
        }

        return false
    } catch (error) {
        console.error("Error checking PR:", error.response.data)
        return false
    }
}

// **************
// MAIN FUNCTION
// **************
async function main() {
    // Set constants
    const mainRepoOwner = process.env.GITHUB_MAIN_USERNAME
    const mainRepoPath = path.resolve(__dirname, process.env.MAIN_REPO_NAME)
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
        console.log("*".repeat(repo.length + 1))
        console.log(repo)
        console.log("*".repeat(repo.length + 1))

        const currentImageVersion = imageVersions[repo]
        const latestImageVersion = await getLatestImageVersion(repo, currentImageVersion)
        const branchName = `update-${repo}-${latestImageVersion}`
        const remoteBranchExists = await checkIfRemoteBranchExists(mainRepoPath, branchName)
        const prExists = await checkIfPrExists(mainRepoOwner, process.env.MAIN_REPO_NAME, branchName)

        // If the latest image version is different than the current image version, and there is no PR
        if (latestImageVersion != currentImageVersion && !prExists) {
            console.log(`Updating ${repo} from ${currentImageVersion} to ${latestImageVersion}...`)
            if (remoteBranchExists) {
                console.log("Remote branch exists, but no PR.")
            } else {
                await deleteLocalBranch(mainRepoPath, branchName)
                await checkoutNewBranch(mainRepoPath, branchName)
                await updateDockerComposeFile(repo, latestImageVersion, currentImageVersion, composeFilePath, composeFileContents)
                await commitChanges(mainRepoPath, repo, latestImageVersion)
                await pushChanges(mainRepoPath, branchName)
            }

            // Create the PR
            await createPullRequest(process.env.MAIN_REPO_NAME, branchName, repo, currentImageVersion, latestImageVersion, composeFileContents)

            // Return to main branch
            execSync(`cd ${mainRepoPath} && git checkout --quiet main`, {
                stdio: "inherit",
            })
        } else {
            if (prExists) {
                console.log(`PR already exists for ${repo}: ${branchName}`)
            } else {
                console.log(`No update needed for ${repo}`)
            }
        }
        console.log()
    }
}

main()
