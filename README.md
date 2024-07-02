# celtis

`Latin for tool or chisel - a tool for building things.`

This is a demonstration on how to use the Anthropic tool or function call API from Typescript. 

There is a very simple, user prompt and feedback loop to interact with Claude.

The single configured tool is using the [weatherapi.com](weatherapi.com) API to get the weather for a given location.


## Installation
    
    ```bash
    yarn install
    cp .env.example .env
    ```

Then add your API keys to the `.env` file.

## Usage

    ```bash
    yarn start
    ```
