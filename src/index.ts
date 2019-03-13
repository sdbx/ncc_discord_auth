import { decode, encode } from "bencodex"
import chalk from "chalk"
import Discord from "discord.js"
import emojiUnicode from "emoji-unicode"
import fs from "fs-extra"
import { ILastMessage, INcMessage, INowMessage, IPastMessage,
    MessageType, NcEmbed, NcImage, NcSticker, SystemType } from "ncc.js"
import { ArticleContent, ImageType, TextStyle, TextType } from "ncc.js"
import { ArticleParser, Cafe, NaverVideo, Ncc, NcChannel, NcMessage, uploadImage } from "ncc.js"
import os from "os"
import readline from "readline"
import request from "request-promise-native"
import showdown from "showdown"
import DdsClient from "./daldalso/ddsclient"
import DdsCredit from "./daldalso/ddscredit"
import { MarkType } from "./discord/rundefine"
import Runtime, { MainCfg } from "./discord/runtime"
import Log from "./log"

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
        await run.start()
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
    let uname = await ncc.loadCredit()
    if (uname == null) {
        const otpcode = await Log.read("OTP")
        uname = await ncc.loginOTP(otpcode)
    }
    if (uname == null) {
        return
    }
    Log.d(`username: ${uname}`)
    await ncc.connect()
    const openCh = ncc.joinedChannels.find(
        (v) => v.cafe.cafeId === 26686242 && v.channelInfo.name === "비공개 채팅방")
    if (openCh == null) {
        return
    }
    const session = await ncc.getConnectedChannel(openCh)
    // const loaded = await ncc.loginOTP(otpcode)
    /*
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole())
    if (loaded != null) {
        Log.d(`name: ${loaded}`)
        // const ar = await ncc.getArticleDetail(26686242, 7382);
        if (await ncc.availableAsync()) {
            const article = await ncc.getArticleDetail(26686242, 7741)
            const conv = new showdown.Converter()
            const md = ArticleParser.articleToMd(article, MarkType.GITHUB)
            const jujube = ArticleParser.contentsToJujube(article.contents)
            console.log(md)
            await fs.writeFile("/home/alyac/Documents/test.html", ArticleParser.mdToHTML(article, md))
        }
    }
    */
   /*
    const daldalso = new DdsCredit()
    daldalso.id = await Log.read("DDS ID")
    daldalso.pw = await Log.read("DDS PW", {hide:true, logResult: false})
    const success = await daldalso.login()
    if (success) {
        const ddscl = new DdsClient(daldalso)
        await ddscl.connectWS()
    }
    */
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