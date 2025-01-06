# Discord Meeting Assistant

A Discord bot that automatically records, transcribes, and summarizes voice channel meetings. It uses Groq for generating meeting summaries and Deepgram for accurate speech-to-text transcription.

## Features

- Voice channel recording
- Real-time transcription using Deepgram
- Chat message logging during meetings
- Automated meeting summaries using Groq's LLM
- Simple command interface

## Setup

### Prerequisites

- NodeJS 20+
- Discord Bot Token
- Groq API Key
- Deepgram API Key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mdimado/discord-meeting-assistant.git
cd discord-meeting-assistant/bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root with your API keys:
```
DISCORD_TOKEN=your_discord_token
GROQ_API_KEY=your_groq_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

### Running the Bot

```bash
node main.js
```

## Usage

The bot responds to the following commands:

- `!join` - Bot joins your current voice channel
- `!record` - Bot starts recording audio streams
- `!stoprecording` - Bot stops recording the audio streams
- `!chatsummary` - Bot gives only chat message summary
- `!allsummary` - Bot gives both chat and voice chat summary
- `!leave` - Bot leaves the channel and provides meeting transcript and summary
- `!status` - Shows current recording status and statistics

## Configuration

The bot uses the following environment variables:

- `DISCORD_TOKEN` - Your Discord bot token
- `GROQ_API_KEY` - API key for Groq's LLM service
- `DEEPGRAM_API_KEY` - API key for Deepgram's speech-to-text service

## Development

### Project Structure

```
discord-meeting-assistant/
├──bot/
├──├──.env # Environment variables
├──├──main.js # Bot code in JavaScript
├──├──package-lock.json
├──├──package.json
├── main.py           # Bot code in python
├── requirements.txt  # Project dependencies
├── .env             # Environment variables
└── README.md        # Documentation
```

### Requirements

Create a `requirements.txt` with:
```
discord.py
fastapi
groq
deepgram-sdk
python-dotenv
uvicorn
nest-asyncio
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please make sure to update tests as appropriate and follow the existing code style.

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Acknowledgments

- [Discord.py](https://discordpy.readthedocs.io/) for the Discord API wrapper
- [Groq](https://groq.com/) for LLM capabilities
- [Deepgram](https://deepgram.com/) for speech-to-text transcription

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.
