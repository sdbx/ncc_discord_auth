import * as Discord from "discord.js"
import * as fs from "fs-extra"
import * as hangul from 'hangul-js'
import * as request from "request-promise-native"
import { sprintf } from "sprintf-js"
import * as tmp from "tmp-promise"
import Config from "../../config"
import Log from "../../log"
import { NccEvents } from "../../ncc/ncc"
import { cafePrefix } from "../../ncc/ncconstant"
import NcChannel from "../../ncc/talk/ncchannel"
import NcJoinedChannel from "../../ncc/talk/ncjoinedchannel"
import NcMessage, { MessageType, NcImage, NcSticker, SystemType } from "../../ncc/talk/ncmessage"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil"
import { AuthConfig, getNaver } from "./auth"

export default class Cast extends Plugin {
    // declare config file: use save data
    protected config = new CastConfig()
    // declare command.
    private setup:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.setup = new CommandHelp("중계/집결", this.lang.cast.castDesc, true, {reqAdmin: true})
        this.setup.addField(ParamType.from, "네이버 카페", false)
        this.setup.addField(ParamType.dest, this.lang.cast.castParam, true)
        this.setup.addField(ParamType.to, "auth|ro|delete", false)
        // get parameter as complex
        this.setup.complex = true
        // ncc onMessage
        this.ncc.on(NccEvents.message, this.nccMsg.bind(this))
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testSetup = this.setup.check(this.global, command, state)
        if (testSetup.match && msg.channel.type !== "dm") {
            const channel = msg.channel as Discord.TextChannel
            const guild = msg.guild
            // send Message
            const link = testSetup.get(ParamType.dest)
            if (!new RegExp("https://talk.cafe.naver.com/channels/[0-9]+", "i").test(link)) {
                await channel.send(this.lang.cast.linkFail)
                return Promise.resolve()
            }
            const roomid = Number.parseInt(link.substring(link.lastIndexOf("/") + 1))
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver)
                return Promise.resolve()
            }
            const roomCfg = await this.sub(this.config, roomid.toString())
            const channelCfg = await this.sub(new LinkConfig(), msg.channel.id)
            // already listening?
            if (roomCfg.channelID === channel.id && channelCfg.roomID === roomCfg.roomID &&
                roomCfg.channelID && channelCfg.channelID) {
                // toggle OFF
                if (testSetup.has(ParamType.to)) {
                    const opts = testSetup.get(ParamType.to)
                    roomCfg.authedOnly = opts.indexOf("auth") >= 0
                    roomCfg.readOnly = opts.indexOf("ro") >= 0
                    if (opts.indexOf("delete") >= 0) {
                        await this.subDel(roomid.toString())
                        await this.subDel(msg.channel.id)
                        await channel.send("삭제 완료")
                    }
                }
                return Promise.resolve()
            }
            let rooms:NcJoinedChannel[]
            let room:NcJoinedChannel = null
            try {
                rooms = (await this.ncc.fetchChannels()).filter((value) => value.channelID === roomid)
                if (rooms.length === 0) {
                    if (!testSetup.has(ParamType.from)) {
                        await channel.send(this.lang.cast.needNaver)
                        return Promise.resolve()
                    }
                    const cafe = await this.ncc.parseNaver(`${cafePrefix}/${testSetup.get(ParamType.from)}`)
                    const r = await this.ncc.joinChannel(roomid)
                    if (r.success) {
                        room = await this.ncc.getJoinedChannel(roomid)
                    }
                } else {
                    room = rooms[0]
                }
            } catch (err) {
                Log.e(err)
            }
            if (room == null) {
                await channel.send(this.lang.cast.roomFail)
                return Promise.resolve()
            }
            // webhook init
            const webhook = await this.getWebhook(channel).catch(Log.e)
            if (webhook == null) {
                await channel.send(this.lang.cast.webhookFail)
                return Promise.resolve()
            }
            roomCfg.roomID = room.channelID
            roomCfg.channelID = channel.id
            channelCfg.roomID = room.channelID
            channelCfg.channelID = channel.id
            roomCfg.cafeID = room.cafe.cafeId
            roomCfg.webhookId = webhook.id

            await this.onSave()
            await channel.send(this.lang.cast.webhookSuccess)
            return Promise.resolve()
        }
        return Promise.resolve()
    }
    public async onMessage(msg:Discord.Message) {
        if (msg.channel.type === "dm") {
            return Promise.resolve()
        }
        if (msg.author.id === this.client.user.id || !await this.ncc.availableAsync()) {
            return Promise.resolve()
        }
        const guild = msg.guild
        const channel = msg.channel

        const channelCfg = await this.sub(new LinkConfig(), msg.channel.id)
        const roomCfg = await this.sub(this.config, channelCfg.roomID.toString())

        if (roomCfg.channelID !== msg.channel.id || msg.author.bot) {
            // nope
            return Promise.resolve()
        }
        if (roomCfg.readOnly) {
            await channel.send(this.lang.cast.readonly)
            return Promise.resolve()
        }
        const authL = await this.sub(new AuthConfig(),guild.id, false)
        const n = getNaver(authL, guild.id, msg.author.id)
        const room = await this.ncc.getConnectedChannel(roomCfg.roomID)
        if (room == null || (roomCfg.authedOnly && n == null)) {
            // nope
            await channel.send(this.lang.cast.authonly)
            return Promise.resolve()
        }
        const nick = `${DiscordFormat.getNickname(msg.member)}(${n != null ? n : "미인증"})`
        if (msg.attachments.size > 0) {
            for (const [key,attach] of msg.attachments) {
                let url:string = attach.url
                if (url.indexOf("?") >= 0) {
                    url = url.substring(0, url.lastIndexOf("?"))
                }
                if (url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".gif")) {
                    await room.sendText(
                        `${nick}${hangul.endsWithConsonant(nick) ? "이" : "가"} 이미지를 올렸습니다.`)
                    const temp = await tmp.file({postfix: attach.filename.substr(attach.filename.lastIndexOf("."))})
                    const image = await request.get(attach.url, {encoding:null})
                    await fs.writeFile(temp.path,image)
                    await room.sendImage(temp.path)
                }
            }
        }
        if (msg.content.length >= 1) {
            await room.sendText(`${nick} : ${DiscordFormat.normalize(msg.content, msg.guild)}`)
        }
    }
    protected async nccMsg(room:NcChannel, message:NcMessage) {
        /*
        if (!this.subHas(room.channelID.toString())) {
            return Promise.resolve()
        }
        */
        const roomCfg = await this.sub(this.config, room.channelID.toString())
        if (room.channelID !== roomCfg.roomID) {
            // skip - wrong chat
            Log.w("NccCast", "skip - wrong chat")
            return Promise.resolve()
        }
        if (message.sendUser.userid === this.ncc.username) {
            return Promise.resolve()
        }
        if (!this.client.channels.has(roomCfg.channelID)) {
            return Promise.resolve()
        }
        const channel = this.client.channels.get(roomCfg.channelID) as Discord.TextChannel
        // message.user.image
        let pImage = "https://ssl.pstatic.net/static/m/cafe/mobile/img_thumb_20180426.png"
        let nick = this.lang.cast.fallbackNick
        if (message.type !== MessageType.system) {
            pImage = message.sendUser.profileurl
            nick = message.sendUser.nickname
        }
        const webhook = await this.getWebhook(channel, nick, pImage).catch(Log.e)
        if (webhook == null) {
            Log.w("NccCast", "skip - no webhook")
            return Promise.resolve()
        }
        roomCfg.lastProfile = pImage
        switch (message.type) {
            case MessageType.text: {
                let msg = message.content as string
                const user = message.sendUser.userid
                const optout = roomCfg.optouts.indexOf(user)
                if (msg.startsWith("!optout")) {
                    if (optout < 0) {
                        roomCfg.optouts.push(user)
                        await room.sendText("optout 완료.")
                    }
                } else if (msg.startsWith("!optin")) {
                    if (optout >= 0) {
                        roomCfg.optouts.splice(optout, 1)
                        await room.sendText("optin 완료.")
                    }
                } else if (optout >= 0) {
                    msg = this.lang.cast.optoutMessage
                }
                await webhook.send(DiscordFormat.normalize(msg, channel.guild))
            } break
            case MessageType.sticker:
            case MessageType.image: {
                const url = (message.type === MessageType.sticker) ?
                    (message.content as NcSticker).imageUrl : (message.content as NcImage).url
                const optout = roomCfg.optouts.indexOf(message.sendUser.userid)
                let fn = url.substring(url.lastIndexOf("/") + 1)
                if (fn.indexOf("?") >= 0) {
                    fn = fn.substring(0,fn.lastIndexOf("?"))
                }
                const image:Buffer = await request.get(url, { encoding: null })
                const rich = new Discord.RichEmbed()
                if (optout >= 0) {
                    await webhook.send(this.lang.cast.optoutMessage)
                } else {
                    rich.setTitle(this.lang.cast.sendImage)
                    rich.attachFile(new Discord.Attachment(image, fn))
                    rich.setImage(`attachment://${fn}`)
                    rich.setURL(url)
                    await webhook.send(rich)
                }
            } break
            case MessageType.system: {
                if ([SystemType.quited, SystemType.kick, SystemType.joined].indexOf(message.systemType) >= 0) {
                    const member = await this.ncc.getMemberById(message.cafe.cafeId, message.sendUser.userid)
                    const desc = await this.getRichByNaver(member)
                    await webhook.send(
                        DiscordFormat.normalize(message.content as string, channel.guild), desc)
                } else {
                    await webhook.send(
                        DiscordFormat.normalize(message.content as string, channel.guild))
                }
            } break
        }
    }
}
interface Link {
    channelID:string;
    roomID:number;
}
class LinkConfig extends Config implements Link {
    public channelID = "Ch"
    public roomID = -1
    constructor() {
        super("cast")
    }
}
class CastConfig extends LinkConfig {
    public channelID = "Ch"
    public roomID = -1
    public webhookId = "webhook"
    public readOnly = false
    public authedOnly = false
    public optouts:string[] = []
    public cafeID:number = -1
    public lastProfile = "_"
    constructor() {
        super()
    }
}