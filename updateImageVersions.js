require("dotenv").config()
const axios = require("axios")
const { sendToOpenAI } = require("./openaiUtil")
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

// **************************************
// Clone a repository if it doesn't exist
// **************************************
function cloneRepo(repoUrl, mainRepoPath) {
    console.log("Checking if repository exists...")
    if (fs.existsSync(mainRepoPath)) {
        console.log("Repository already exists. Pulling latest changes...")
        execSync(
            `cd ${mainRepoPath} && git checkout --quiet main && git pull --quiet`,
            {
                stdio: "inherit",
            }
        )
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

// *********************
// Get a file from a URL
// *********************
async function getFileFromURL(URL) {
    try {
        const response = await axios.get(URL)
        return response.data
    } catch (error) {
        console.error(`Error: ${error.message}`)
    }
}

// **********************************************************
// Send a file to OpenAI for parsing of current image versions
// **********************************************************
async function getCurrentImageVersions(fileContents) {
    const prompt = `Read this docker-compose.yml file and find all the images used and the default versions that have been set. Don't include any results that aren't directly images. Only respond with the result in a json object format. Provide no text other than the direct json object result so that I can parse your response directly in my node.js script.\n\n${fileContents}`

    if (process.env.ENV == "dev") {
        return `{
                "obolnetwork/charon": "v0.15.0",
                "sigp/lighthouse": "v4.0.2-rc.0",
                "consensys/teku": "23.3.1",
                "prom/prometheus": "v2.41.0",
                "grafana/grafana": "9.3.2",
                "prom/node-exporter": "v1.5.0",
                "jaegertracing/all-in-one": "1.41.0"
                }`
    } else {
        return await sendToOpenAI(prompt)
    }
}

// ***********************************************
// Find GitHub repo URL from DockerHub image name
// ***********************************************
async function getGitHubRepoURL(repoName) {
    prompt = `What is the GitHub repo name for the DockerHub image ${repoName}? Only respond with the GitHub URL, no other text.`

    if (process.env.ENV == "dev") {
        if (repoName == "obolnetwork/charon") {
            return `https://github.com/obolnetwork/charon`
        } else if (repoName == "sigp/lighthouse") {
            return `https://github.com/sigp/lighthouse`
        } else if (repoName == "consensys/teku") {
            return `https://github.com/consensys/teku`
        } else if (repoName == "prom/prometheus") {
            return `https://github.com/prometheus/prometheus`
        } else if (repoName == "grafana/grafana") {
            return `https://github.com/grafana/grafana`
        } else if (repoName == "prom/node-exporter") {
            return `https://github.com/prometheus/node_exporter`
        } else if (repoName == "jaegertracing/all-in-one") {
            return `https://github.com/jaegertracing/jaeger`
        }
    } else {
        return await sendToOpenAI(prompt)
    }
}

// ***************************************
// Find latest version on GitHub releases
// ***************************************
async function getLatestImageVersion(repoName, currentImageVersion) {
    try {
        gitHubURL = await getGitHubRepoURL(repoName)
        const response = await axios.get(`${gitHubURL}/releases/latest`, {
            maxRedirects: 0,
            validateStatus: function (status) {
                return (status >= 200 && status < 400) || status === 302
            },
        })

        const redirectedUrl = response.headers.location

        // Ask ChatGPT to compare the current version with that URL to see which is newer
        const prompt = `This is the version of ${repoName} found from GitHub:\n\n${redirectedUrl}\n\nThis is the version I found in the docker-compose.yml file:\n\n${currentImageVersion}\n\nWhich version is newer? The version found on GitHub might be in a slightly different format from the one in the docker-compose.yml file, so make sure your response is in the format found in the docker-compose.yml file. Don't provide any text other than the version number. If both are the same version, respond with only the word "SAME".\n\n`

        if (process.env.ENV == "dev") {
            if (repoName == "obolnetwork/charon") {
                return `SAME`
            } else if (repoName == "sigp/lighthouse") {
                return `v4.1.0`
            } else if (repoName == "consensys/teku") {
                return `23.4.0`
            } else if (repoName == "prom/prometheus") {
                return `v2.43.0`
            } else if (repoName == "grafana/grafana") {
                return `9.5.1`
            } else if (repoName == "prom/node-exporter") {
                return `SAME`
            } else if (repoName == "jaegertracing/all-in-one") {
                return `1.44.0`
            }
        } else {
            return await sendToOpenAI(prompt)
        }
    } catch (error) {
        console.error(`Error: ${error.message}`)
    }
}

// Check if a branch with the specified name exists
function checkIfBranchExists(mainRepoPath, repoName, updatedLine) {
    const branchName = `update-${repoName}-${updatedLine}`

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

async function main() {
    const mainRepoPath = path.resolve(
        __dirname,
        "charon-distributed-validator-cluster"
    )
    const mainRepoURL =
        "https://github.com/DVStakers/charon-distributed-validator-cluster.git"

    // Clone the main repo from GitHub
    cloneRepo(mainRepoURL, mainRepoPath)

    // Read the docker-compose.yml file
    const composeFilePath = path.join(mainRepoPath, "docker-compose.yml")
    const composeFileContents = await getFileFromRepo(
        mainRepoPath,
        "docker-compose.yml"
    )

    const imageVersions = JSON.parse(
        await getCurrentImageVersions(composeFileContents)
    )

    // TODO: Sub process for each update
    // At this point, there could start to be errors (e.g. trying to update everything could cause an error if one fails)
    // Not something to fix right now, but something to be aware of that it would be better to spin off independent processes for each update

    for (const repo in imageVersions) {
        const currentImageVersion = imageVersions[repo]
        const latestImageVersion = await getLatestImageVersion(
            repo,
            currentImageVersion
        )

        if (
            latestImageVersion != "SAME" &&
            latestImageVersion != currentImageVersion
        ) {
            // Check if a PR already exists for this update
            const prExists = checkIfBranchExists(
                mainRepoPath,
                repo,
                latestImageVersion
            )

            if (!prExists) {
                console.log(
                    `Updating ${repo} from ${currentImageVersion} to ${latestImageVersion}`
                )

                // Create and checkout a new branch for the update
                const branchName = `update-${repo}-${latestImageVersion}`

                execSync(
                    `cd ${mainRepoPath} && git checkout --quiet main && git checkout --quiet -b ${branchName}`,
                    {
                        stdio: "inherit",
                    }
                )

                // Make changes to the docker-compose.yml file
                // This is simple line replacement for now to avoid returning the whole file
                const prompt = `I have this docker-compose.yml file. I want to change the default version of the image ${repo} from ${currentImageVersion} to ${latestImageVersion}. Keep all the other content of the line identical, only change the version. I don't want you to return the entire file, because it's too big. Only respond with the number of spaces to indent the line and the contents of the changed line. Don't provide any text other than the number of spaces to indent the line and the contents of the changed line in the format:\n\n{"indentation": "<NUMBER_OF_SPACES>", "updatedLine": "{CHANGED_LINE_CONTENT"}\n\n${composeFileContents}`

                let result
                if (process.env.ENV == "dev") {
                    if (repo == "obolnetwork/charon") {
                        result = {
                            indentation: "2",
                            updatedLine:
                                "image: obolnetwork/charon:${CHARON_VERSION:-v0.15.0}",
                        }
                    } else if (repo == "sigp/lighthouse") {
                        result = {
                            indentation: "4",
                            updatedLine:
                                "image: sigp/lighthouse:${LIGHTHOUSE_VERSION:-v4.1.0}",
                        }
                    } else if (repo == "consensys/teku") {
                        result = {
                            indentation: "4",
                            updatedLine:
                                "image: consensys/teku:${TEKU_VERSION:-23.4.0}",
                        }
                    } else if (repo == "prom/prometheus") {
                        result = {
                            indentation: "4",
                            updatedLine:
                                "image: prom/prometheus:${PROMETHEUS_VERSION:-v2.43.0}",
                        }
                    } else if (repo == "grafana/grafana") {
                        result = {
                            indentation: "4",
                            updatedLine:
                                "image: grafana/grafana:${GRAFANA_VERSION:-9.5.1}",
                        }
                    } else if (repo == "prom/node_exporter") {
                        result = {
                            indentation: "4",
                            updatedLine:
                                "image: prom/node-exporter:${NODE_EXPORTER_VERSION:-v1.5.0}",
                        }
                    } else if (repo == "jaegertracing/all-in-one") {
                        result = {
                            indentation: "4",
                            updatedLine:
                                "image: jaegertracing/all-in-one:${JAEGAR_VERSION:-1.44.0}",
                        }
                    } else {
                        return
                    }
                } else {
                    result = await sendToOpenAI(prompt)
                }

                const indentationSpaces = " ".repeat(Number(result.indentation))
                const updatedLine = indentationSpaces + result.updatedLine

                const lines = composeFileContents.split("\n")
                const targetLine = `image: ${repo}:`
                for (let i = 0; i < lines.length; i++) {
                    if (
                        lines[i].includes(targetLine) &&
                        lines[i].includes(currentImageVersion)
                    ) {
                        lines[i] = updatedLine
                        break
                    }
                }

                const updatedData = lines.join("\n")
                fs.writeFileSync(composeFilePath, updatedData)

                // Commit the changes
                execSync(
                    `cd ${mainRepoPath} && git add . && git commit --quiet -m "Update ${repo} to ${latestImageVersion}"`,
                    { stdio: "inherit" }
                )

                // Push the branch
                // execSync(`cd ${mainRepoPath} && git push -u origin ${branchName}`, {
                //     stdio: "inherit",
                // })

                // Create a PR
                // Use the GitHub API to create a PR
                // https://docs.github.com/en/rest/reference/pulls#create-a-pull-request
                // Include a summary of the changes made in the description of the PR
                // Include a summary of the release notes from the github release page in the description of the PR
                // If I tag myself, will I be notified of the PR?
                // Since I'm the one creating the PR, I don't think I'll be notified, but I want to be
            } else {
                console.log(
                    `A PR for updating ${repo} to ${latestImageVersion} already exists`
                )
            }
        }
    }
}

main()
