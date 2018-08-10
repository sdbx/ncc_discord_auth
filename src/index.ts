import chalk from "chalk"
import * as Discord from "discord.js"
import { Room } from "node-ncc-es6"
import * as readline from "readline"
import * as request from "request-promise-native"
import Runtime from "./discord/runtime"
import Log from "./log"
import Ncc, { ChannelListEvent, NccEvents } from "./ncc/ncc"
import Cafe from "./ncc/structure/cafe"
import NcChannel from "./ncc/talk/ncchannel"
import NcMessage, { MessageType, NcImage } from "./ncc/talk/ncmessage"
import uploadImage from "./ncc/talk/uploadphoto"

let run:Runtime
async function start() {
    run = new Runtime()
    run.on("restart",async () => {
        run.removeAllListeners("restart")
        await run.destroy()
        Log.d("Main", "Restarting Runtime...")
        setTimeout(start, 2000)
    })
    await run.start()
}
Log.hook()
// start()
init()
// client()

async function init() {
    /*
    run = new Runtime();
    await run.start();
    */
    const ncc = new Ncc()
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole())
    if (loaded != null) {
        Log.d(`name: ${loaded}`)
        // const ar = await ncc.getArticleDetail(26686242, 7382);
        if (ncc.available) {
            try {
                await ncc.fetchChannels()
                await ncc.testChannel(106977317649)
                await ncc.getOpenChannels(26686242)
                await ncc.connect(true)
                ncc.on(NccEvents.updateList, (obj:ChannelListEvent) => {
                    // Log.json("Delta", obj)
                })
                // const ch = await ncc.getConnectedChannel(45528313105)
                // const msgs = await ch.fetchMessages("ALL", -1)
                // const captcha = await ncc.genCaptchaByConsole()
                // tslint:disable-next-line
                // const image = await uploadImage(ncc["credit"], "https://media.discordapp.net/attachments/152746825806381056/474758951171522560/unknown.png", "test.png")
                // tslint:disable-next-line
                // const channel = await ncc.createOpenChannel(26686242, captcha, "Hello", "World", image.path)
                // await channel.leave()
                // await Log.image(image.path, "Uploaded")
                // Log.json("Test",image)
                /*
                for (const msg of msgs) {
                    let text
                    switch (msg.type) {
                        case MessageType.text : text = msg.content; break
                        case MessageType.image : text = (msg.content as NcImage).url; break
                        case MessageType.sticker : text = "Sticker"; break
                        case MessageType.system : text = msg.content; break
                        default: text = "null"
                    }
                    Log.d("Chat", text)
                }
                */
                Log.time()
                // tslint:disable-next-line
                await ncc.changeProfile(26686242, "벨략", null)
            } catch (err) {
                Log.e(err)
            }
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
                _channel.lastestMessage.sender.nick} : ${getSimpleString(_channel.lastestMessage)})`)
    }
    Log.i("채널", "접속할 채널의 번호를 골라주세요.")
    const inputChNo = Number.parseInt(await Log.read("채널 번호", {hide:false, logResult: false}))
    if (Number.isNaN(inputChNo) || inputChNo < 1 || inputChNo > listChannels.length) {
        Log.i("잘못 입력하셨습니다. 종료합니다.")
        return Promise.reject()
    }
    const credit = ncc["credit"]
    const channel = await NcChannel.from(credit, listChannels[inputChNo - 1])
    channel.connect(credit)
    if (channel.detail.lastestMessage.messageId != null) {
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
}
async function parseMessage(msg:NcMessage) {
    const title = `${
        msg.type === MessageType.system ? "시스템" : msg.sender.nick
    } (${getTimestamp(new Date(msg.timestamp))})`
    if (msg.type === MessageType.image) {
        await Log.image((msg.content as NcImage).url, title, `${msg.sendUser.nickname}님이 이미지를 보냈습니다.`)
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
        case MessageType.image: text = (msg.content as NcImage).url; break
        case MessageType.sticker: text = "Sticker"; break
        case MessageType.system: text = msg.content; break
        default: text = "null"
    }
    return text
}