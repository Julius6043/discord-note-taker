import { Client, GatewayIntentBits } from 'discord.js';
import { EndBehaviorType, joinVoiceChannel } from '@discordjs/voice';
import { createClient } from '@deepgram/sdk';
import { Groq } from 'groq-sdk';
import { configDotenv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import prism from 'prism-media';
import { exec } from 'child_process';

configDotenv();
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent];
const client = new Client({ intents: intents });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const groqClient = new Groq(process.env.GROQ_API_KEY);

class Transcript {
    constructor() {
        this.chat_transcript = "";
        this.audio_transcript = "";
    }

    addChatTranscript(message) {
        this.chat_transcript += message.author.displayName + ": " + message.content + "\n";
    }

    clearTranscript() {
        this.chat_transcript = "";
        this.audio_transcript = "";
    }
}

class MeetingBot {
    constructor() {
        this.client = client;
        this.intents = intents;
        this.token = process.env.DISCORD_TOKEN;
        this.transcription = new Transcript();
        this.voice_connection = null;
        this.recordingStart = null;
        this.activeStreams = new Map();
        this.audioDirectory = path.join(import.meta.dirname, 'audio_chunks');
        this.audioBuffers = new Map();
        this.silenceThreshold = 500;
        this.maxChunkDuration = 30000;
        this.lastSpeakingTime = new Map();
        
        if (!fs.existsSync(this.audioDirectory)) {
            fs.mkdirSync(this.audioDirectory);
        }
    }

    async join(message) {
        if (!message.member.voice.channel) {
            return message.reply('You need to join a voice channel first!');
        }

        const connection = joinVoiceChannel({
            channelId: message.member.voice.channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });
        this.voice_connection = connection;
        message.reply('Joined the voice channel!');
    }

    async start_recording() {
        if (!this.voice_connection) {
            return console.error('No voice connection available!');
        }
        this.recordingOn = true;
        this.recordingStart = Date.now();
        const receiver = this.voice_connection.receiver;

        receiver.speaking.on('start', (userId) => {
            this.lastSpeakingTime.set(userId, Date.now());
            
            if (!this.audioBuffers.has(userId)) {
                this.audioBuffers.set(userId, Buffer.alloc(0));
            }

            const audioStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: this.silenceThreshold,
                },
            });

            const pcmStream = new prism.opus.Decoder({ 
                rate: 48000, 
                channels: 2, 
                frameSize: 960 
            });

            this.activeStreams.set(userId, {
                audioStream,
                pcmStream,
                timestamp: Date.now()
            });

            pcmStream.on('data', (chunk) => {
                const currentBuffer = this.audioBuffers.get(userId);
                this.audioBuffers.set(userId, Buffer.concat([currentBuffer, chunk]));
                
                const duration = Date.now() - this.lastSpeakingTime.get(userId);
                if (duration >= this.maxChunkDuration) {
                    this.saveAudioChunk(userId);
                }
            });

            audioStream.pipe(pcmStream);

            audioStream.on('end', () => {
                this.saveAudioChunk(userId);
                const streamData = this.activeStreams.get(userId);
                if (streamData) {
                    streamData.audioStream.destroy();
                    streamData.pcmStream.destroy();
                    this.activeStreams.delete(userId);
                }
            });
        });
    }

    async saveAudioChunk(userId) {
        const buffer = this.audioBuffers.get(userId);
        if (!buffer || buffer.length === 0) return;

        const timestamp = Date.now();
        const chunkFilePath = path.join(this.audioDirectory, `chunk_${timestamp}_${userId}.pcm`);

        try {
            await fs.promises.writeFile(chunkFilePath, buffer);
            this.audioBuffers.set(userId, Buffer.alloc(0));
            this.lastSpeakingTime.set(userId, Date.now());
        } catch (error) {
            console.error(`Error saving audio chunk for user ${userId}:`, error);
        }
    }

    async stop_recording(message) {
        if (!this.voice_connection || !this.recordingOn) {
            return message.reply('Not recording or not in voice channel!');
        }

        for (const [userId] of this.audioBuffers) {
            await this.saveAudioChunk(userId);
        }

        for (const [userId, streamData] of this.activeStreams) {
            streamData.audioStream.destroy();
            streamData.pcmStream.destroy();
        }
        this.activeStreams.clear();
        this.audioBuffers.clear();

        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            await this.processSavedChunks();
        } catch (error) {
            console.error('Error processing audio chunks:', error);
            message.reply('Error processing audio recording.');
        }
    }

    async processSavedChunks() {
        const chunks = fs.readdirSync(this.audioDirectory)
            .filter(file => file.endsWith('.pcm'))
            .sort((a, b) => {
                const timeA = parseInt(a.split('_')[1]);
                const timeB = parseInt(b.split('_')[1]);
                return timeA - timeB;
            });

        if (chunks.length === 0) return;

        const combinedPcmPath = path.join(this.audioDirectory, 'combined.pcm');
        const combinedStream = fs.createWriteStream(combinedPcmPath);

        try {
            for (const chunk of chunks) {
                const chunkPath = path.join(this.audioDirectory, chunk);
                if (fs.existsSync(chunkPath)) {
                    const chunkData = await fs.promises.readFile(chunkPath);
                    combinedStream.write(chunkData);
                }
            }
            combinedStream.end();

            await this.convertAndTranscribe(combinedPcmPath);

            await Promise.all(chunks.map(chunk => 
                fs.promises.unlink(path.join(this.audioDirectory, chunk))
                    .catch(err => console.error(`Error deleting chunk ${chunk}:`, err))
            ));

        } catch (error) {
            console.error('Error processing audio chunks:', error);
            throw error;
        }
    }

    async convertAndTranscribe(pcmPath) {
        const wavFilePath = path.join(this.audioDirectory, 'recording.wav');

        return new Promise((resolve, reject) => {
            exec(`ffmpeg -f s16le -ar 48000 -ac 2 -i ${pcmPath} ${wavFilePath} -y`,
                async (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    try {
                        const audioBuffer = await fs.promises.readFile(wavFilePath);
                        const response = await deepgram.listen.prerecorded.transcribeFile(
                            audioBuffer,
                            { punctuate: true }
                        );

                        if (response.result.results.channels[0].alternatives[0]) {
                            const transcriptText = response.result.results.channels[0].alternatives[0].transcript;
                            this.transcription.audio_transcript += `${transcriptText}\n`;
                        }

                        await Promise.all([
                            fs.promises.unlink(pcmPath),
                            fs.promises.unlink(wavFilePath)
                        ]).catch(err => console.error('Error cleaning up files:', err));

                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                }
            );
        });
    }

    async get_summary(includeAudioTranscript = false) {
        try {
            const prompt = `
            Please analyze this meeting and provide a comprehensive summary including main conclusions.
            
            Audio Transcript:
            ${includeAudioTranscript ? this.transcription.audio_transcript : ''}
            
            Chat Messages:
            ${this.transcription.chat_transcript}
            
            Please provide:
            1. Meeting Summary
            2. Key Discussion Points
            3. Main Conclusions
            4. Action Items (if any)
            `;

            const response = await groqClient.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "mixtral-8x7b-32768",
                temperature: 0.7,
                max_tokens: 20000
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error generating summary:', error);
            return 'Error generating summary.';
        }
    }

    async leave(message) {
        if (this.voice_connection) {
            await this.stop_recording(message);
            this.voice_connection.destroy();
            this.voice_connection = null;
            await message.reply(`Chat Transcript:\n${this.transcription.chat_transcript}`);
            this.transcription.clearTranscript();
        } else {
            return message.reply("I'm not in a voice channel!");
        }
    }

    async start() {
        this.client.login(this.token);
        this.client.on('ready', () => {
            console.log('Bot is ready!');
        });
    }
}

client.on('messageCreate', async (message) => {
    if (message.content === '!join') {
        await bot.join(message);
    } else if (message.content === '!record') {
        bot.start_recording();
        message.reply(`Recording started!`);
    } else if (message.content === '!stoprecording') {
        bot.stop_recording(message);
        message.reply(`Recording stopped!`);
    } else if (message.content === '!leave') {
        await bot.leave(message);
    } else if (!bot.voice_connection) {
        return;
    } else if (message.content === '!chatsummary') {
        const summary = await bot.get_summary();
        message.reply(summary);
    } else if (message.content === '!allsummary') {
        const summary = await bot.get_summary(true);
        message.reply(summary);
    } else if (message.content === '!cleartranscripts'){
        bot.transcription.clearTranscript();
    } else {
        bot.transcription.addChatTranscript(message);
    }
});

const bot = new MeetingBot();
bot.start();
