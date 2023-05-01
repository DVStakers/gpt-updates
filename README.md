# Docker Compose Updater

This is a Node.js script that automates the process of updating Docker images in a `docker-compose.yml` file by leveraging OpenAI's GPT-4 language model.

## Features

* Checks for newer versions of Docker images used in a `docker-compose.yml` file
* Creates a new branch for each updated image version
* Updates the `docker-compose.yml` file with the new image version
* Commits and pushes the changes to the new branch
* Creates a pull request for the branch with the changes
* Adds a reviewer to the pull request

## Prerequisites

* Node.js (v14 or later recommended)
* A GitHub account with an access token
* A repository containing a `docker-compose.yml` file

## Setup

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Create a `.env` file in the root directory of the project with the following contents:

```bash
GITHUB_MAIN_USERNAME=<your_github_username>
GITHUB_ACCESS_TOKEN=<your_github_access_token>
MAIN_REPO_NAME=<your_main_repository_name>
MAIN_REPO_URL=<your_main_repository_url>
ENV=<dev | prod>
```


Replace the placeholders with your GitHub username, access token, and repository information.

## Usage

Run `node updateImageVersion.js` in the project root directory to start the script. The script will check for newer versions of the Docker images used in the `docker-compose.yml` file of the specified repository. If any newer versions are found, the script will create a new branch, update the `docker-compose.yml` file, commit and push the changes, and create a pull request for the branch.

## How it works

This script uses OpenAI's GPT-4 language model to parse and understand the contents of the `docker-compose.yml` file, find the latest versions of the Docker images, and update the file accordingly.

Here's a brief overview of the main steps:

1. Read the `docker-compose.yml` file from the specified repository.
2. Send the file contents to the GPT-4 model to identify the images and their versions.
3. For each image, ask the GPT-4 model for the latest version available on GitHub.
4. If a newer version is found, create a new branch and update the `docker-compose.yml` file with the new version.
5. Commit and push the changes to the new branch.
6. Create a pull request for the branch with the updated `docker-compose.yml` file, and add a reviewer to the pull request.

## Limitations

The script assumes that the `docker-compose.yml` file uses a specific format and indentation. If the format is different, the script may not work as expected. In addition, the script depends on the GPT-4 model for parsing and understanding the contents of the `docker-compose.yml` file, which may not always produce accurate results.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
