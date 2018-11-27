import { decode, encode } from "bencodex"
import chalk from "chalk"
import Discord from "discord.js"
import fs from "fs-extra"
import os from "os"
import readline from "readline"
import request from "request-promise-native"
import showdown from "showdown"
import ytdl from "ytdl-core"
import { MarkType } from "./discord/rundefine"
import Runtime, { MainCfg } from "./discord/runtime"
import { articleMarkdown, DiscordFormat, getFirst } from "./discord/runutil"
import Log from "./log"
import { ArticleParser } from "./ncc/articleparser"
import Ncc, { ChannelListEvent, NccEvents } from "./ncc/ncc"
import { ArticleContent, ImageType, TextStyle } from "./ncc/structure/article"
import Cafe from "./ncc/structure/cafe"
import NaverVideo from "./ncc/structure/navervideo"
import NcChannel from "./ncc/talk/ncchannel"
import NcMessage from "./ncc/talk/ncmessage"
import { ILastMessage, INcMessage, INowMessage, IPastMessage,
    MessageType, NcEmbed, NcImage, NcSticker, SystemType } from "./ncc/talk/ncprotomsg"
import uploadImage from "./ncc/talk/uploadphoto"

let run:Runtime
async function start() {
    run = new Runtime()
    run.on("restart",async () => {
        run.removeAllListeners("restart")
        try {
            await run.destroy()
        } catch (err) {
            Log.e(err)
        }
        Log.d("Main", "Restarting Runtime...")
        setTimeout(start, 5000)
    })
    try {
        run.start()
    } catch (err) {
        Log.e(err)
        if (run != null) {
            try {
                await run.destroy()
            } catch {
                // rip
            }
            setTimeout(start, 10000)
        }
    }
    run.start()
}
async function checkEnv() {
    if (process.env.tokenKey !== undefined) {
        try {
            const global = new MainCfg()
            await global.import(true).catch((err) => null)
            global.token = process.env.tokenKey
            await global.export()
        } catch {
            // :)
        }
    }
}
// Log.hook()
Log.enable = true
// checkEnv().then(() => start())
test()
// client()

async function test() {
    /*
    run = new Runtime();
    await run.start();
    */
    const ncc = new Ncc()
    ncc.autoConnect = false
    // const otpcode = await Log.read("OTP")
    // const loaded = await ncc.loginOTP(otpcode)
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole())
    if (loaded != null) {
        Log.d(`name: ${loaded}`)
        // const ar = await ncc.getArticleDetail(26686242, 7382);
        if (await ncc.availableAsync()) {
            const article = await ncc.getArticleDetail(26686242, 7719)
            const conv = new showdown.Converter()
            // const md2HTML = conv.makeHtml(ArticleParser.articleToMd(article, MarkType.GITHUB))
            const rawHTML = ArticleParser.articleToHTML(article)
            // await fs.writeFile(os.homedir() + "/Downloads/test.html", Buffer.from(md2HTML, "utf8"))
        }
    }
}
// init();
async function client() {
    const ncc = new Ncc()
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole())
    if (loaded == null || !await ncc.availableAsync()) {
        return Promise.reject()
    }
    const listChannels = (await ncc.fetchChannels()).filter((v) => Date.now() - v.updatedAt <= 86400000)
    for (let i = 0; i < listChannels.length; i += 1) {
        const _channel = listChannels[i]
        Log.v((i + 1).toString(),
            `${_channel.channelInfo.name} (${
                _channel.latestMessage.author.nick} : ${getSimpleString(_channel.latestMessage)})`)
    }
    Log.i("채널", "접속할 채널의 번호를 골라주세요.")
    const inputChNo = Number.parseInt(await Log.read("채널 번호", {hide:false, logResult: false}))
    if (Number.isNaN(inputChNo) || inputChNo < 1 || inputChNo > listChannels.length) {
        Log.i("잘못 입력하셨습니다. 종료합니다.")
        return Promise.reject()
    }
    const credit = ncc["credit"]
    const channel = await NcChannel.from(credit, listChannels[inputChNo - 1])
    channel.connect().catch(Log.e)
    if (channel.detail.latestMessage.id != null) {
        await new Promise((res, rej) => {
            let stopper:() => void = null
            stopper = channel.on(channel.events.onPastMessage, async (ch, msgs) => {
                for (const msg of msgs) {
                    await parseMessage(msg)
                }
                stopper()
                res()
            })
        })
    }
    while (true) {
        const text = await Log.read(channel.info.name, {hide:false, logResult:false})
        if (text === ":quit") {
            break
        }
        if (text.startsWith(":image")) {
            try {
                const url = text.substr(6).trim()
                await channel.sendImage(url)
                await Log.image(url, "이미지")
            } catch {
                // :(
            }
            continue
        }
        try {
            await channel.sendText(text)
            Log.v("자신", text)
        } catch {
            // :(
        }
    }
    return 0
}
async function parseMessage(msg:NcMessage) {
    const title = `${
        msg.type === MessageType.system ? "시스템" : msg.author.nick
    } (${getTimestamp(new Date(msg.timestamp))})`
    if (msg.type === MessageType.image) {
        await Log.image(msg.image.url, title, `${msg.profile.nickname}님이 이미지를 보냈습니다.`)
    } else if (msg.type === MessageType.text) {
        if (msg.embed != null) {
            if (msg.embed.image.url != null) {
                await Log.image(msg.embed.image.url, title, msg.content as string)
            } else {
                Log.url(title, msg.embed.url, msg.content as string)
            }
        } else {
            Log.v(title, msg.content as string)
        }
    } else if (msg.type === MessageType.system) {
        Log.i(title, msg.content as string)
    }
}
function getTimestamp(date:Date) {
    const hour = date.getHours()
    const PM = hour >= 12
    return `${PM ? "PM" : "AM"} ${hour % 12}:${date.getMinutes()}`
}
function getSimpleString(msg:NcMessage) {
    let text
    switch (msg.type) {
        case MessageType.text: text = msg.content; break
        case MessageType.image: text = msg.image.url; break
        case MessageType.sticker: text = "Sticker"; break
        case MessageType.system: text = msg.content; break
        default: text = "null"
    }
    return text
}