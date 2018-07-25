import * as Discord from "discord.js";
import * as fs from "fs-extra";
import * as hangul from 'hangul-js';
import { Message, Room } from "node-ncc-es6";
import * as request from "request-promise-native";
import { sprintf } from "sprintf-js";
import * as tmp from "tmp-promise";
import Config from "../../config";
import Log from "../../log";
import { cafePrefix } from "../../ncc/ncconstant";
import Plugin from "../plugin";
import { getNickname, GlobalCfg } from "../runtime";
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil";
import { AuthConfig, getNaver, getRichByProfile } from "./auth";

export default class Cast extends Plugin {
    // declare config file: use save data
    protected config = new CastConfig();
    // declare command.
    private setup:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.setup = new CommandHelp("중계", this.lang.cast.castDesc, true, {reqAdmin: true});
        this.setup.addField(ParamType.from, "네이버 카페", false);
        this.setup.addField(ParamType.dest, this.lang.cast.castParam, true);
        this.setup.addField(ParamType.to, "auth|ro|delete", false);
        // get parameter as complex
        this.setup.complex = true;
        // ncc onMessage
        this.ncc.on("message", this.nccMsg.bind(this));
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testSetup = this.setup.check(this.global, command, state);
        if (testSetup.match && msg.channel.type !== "dm") {
            const channel = msg.channel as Discord.TextChannel;
            const guild = msg.guild;
            // send Message
            const link = testSetup.get(ParamType.dest);
            if (!new RegExp("https://talk.cafe.naver.com/channels/[0-9]+", "i").test(link)) {
                await channel.send(this.lang.cast.linkFail);
                return Promise.resolve();
            }
            const roomid = link.substring(link.lastIndexOf("/") + 1);
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver);
                return Promise.resolve();
            }
            const roomCfg = await this.sub(this.config, roomid);
            const channelCfg = await this.sub(new LinkConfig(), msg.channel.id);
            // already listening?
            if (roomCfg.channelID === channel.id && channelCfg.roomID === roomCfg.roomID &&
                roomCfg.channelID && channelCfg.channelID) {
                // toggle OFF
                if (testSetup.has(ParamType.to)) {
                    const opts = testSetup.get(ParamType.to);
                    roomCfg.authedOnly = opts.indexOf("auth") >= 0;
                    roomCfg.readOnly = opts.indexOf("ro") >= 0;
                    if (opts.indexOf("delete") >= 0) {
                        await this.subDel(roomid);
                        await this.subDel(msg.channel.id);
                        await channel.send("삭제 완료");
                    }
                }
                return Promise.resolve();
            }
            const rooms = (await this.ncc.chat.getRoomList()).filter((value) => value.id === roomid);
            let room:Room = null;
            try {
                if (rooms.length === 0) {
                    if (!testSetup.has(ParamType.from)) {
                        await channel.send(this.lang.cast.needNaver);
                        return Promise.resolve();
                    }
                    const cafe = await this.ncc.parseNaver(`${cafePrefix}/${testSetup.get(ParamType.from)}`);
                    room = await this.ncc.chat.joinRoom(cafe.cafeId, roomid);
                } else {
                    room = rooms[0];
                }
            } catch (err) {
                Log.e(err);
            }
            if (room == null) {
                await channel.send(this.lang.cast.roomFail);
                return Promise.resolve();
            }
            // webhook init
            let webhook:Discord.Webhook;
            try {
                const whs = (await channel.fetchWebhooks()).filter((v) => v.id === roomCfg.webhookId);
                if (whs.has(roomCfg.webhookId)) {
                    webhook = whs.get(roomCfg.webhookId);
                } else {
                    try {
                        webhook = await channel.createWebhook(`ncc-${room.id}`, null, "Connect to ncc");
                    } catch (err2) {
                        // 
                    }
                }
            } catch (err) {
                try {
                    webhook = await channel.createWebhook(`ncc-${room.id}`, null, "Connect to ncc");
                } catch (err2) {
                    Log.e(err2);
                }
            }
            if (webhook == null) {
                await channel.send(this.lang.cast.webhookFail);
                return Promise.resolve();
            }
            roomCfg.roomID = room.id;
            roomCfg.channelID = channel.id;
            channelCfg.roomID = room.id;
            channelCfg.channelID = channel.id;
            roomCfg.cafeID = room.cafe.id;
            roomCfg.webhookId = webhook.id;

            await this.onSave();
            await channel.send(this.lang.cast.webhookSuccess);
            return Promise.resolve();
        }
        return Promise.resolve();
    }
    public async onMessage(msg:Discord.Message) {
        await super.onMessage(msg);
        if (msg.channel.type === "dm") {
            return Promise.resolve();
        }
        if (msg.author.id === this.client.user.id || !await this.ncc.availableAsync()) {
            return Promise.resolve();
        }
        const guild = msg.guild;
        const channel = msg.channel;

        const channelCfg = await this.sub(new LinkConfig(), msg.channel.id);
        const roomCfg = await this.sub(this.config, channelCfg.roomID);

        if (roomCfg.channelID !== msg.channel.id || msg.author.bot) {
            // nope
            return Promise.resolve();
        }
        if (roomCfg.readOnly) {
            await channel.send(this.lang.cast.readonly);
            return Promise.resolve();
        }
        const authL = await this.sub(new AuthConfig(),guild.id, false);
        const n = await getNaver(authL, guild, msg.author.id);
        const room = this.ncc.chat.rooms[roomCfg.roomID];
        if (room == null || (roomCfg.authedOnly && n == null)) {
            // nope
            await channel.send(this.lang.cast.authonly);
            return Promise.resolve();
        }
        const nick = `${getNickname(msg)}(${n != null ? n : "미인증"})`;
        if (msg.attachments.size > 0) {
            for (const [key,attach] of msg.attachments) {
                let url:string = attach.url;
                if (url.indexOf("?") >= 0) {
                    url = url.substring(0, url.lastIndexOf("?"));
                }
                if (url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".gif")) {
                    await this.ncc.chat.sendText(room,
                        `${nick}${hangul.endsWithConsonant(nick) ? "이" : "가"} 이미지를 올렸습니다.`);
                    const temp = await tmp.file({postfix: attach.filename.substr(attach.filename.lastIndexOf("."))});
                    const image = await request.get(attach.url, {encoding:null});
                    await fs.writeFile(temp.path,image);
                    await this.ncc.chat.sendImage(room, fs.createReadStream(temp.path), null);
                }
            }
        }
        if (msg.content.length >= 1) {
            await this.ncc.chat.sendText(room, `${nick} : ${msg.content}`);
        }
    }
    protected async nccMsg(message:Message) {
        const room = message.room;
        if (!this.subHas(room.id)) {
            return Promise.resolve();
        }
        const roomCfg = await this.sub(this.config, room.id);
        if (room.id !== roomCfg.roomID) {
            // skip - wrong chat
            Log.w("NccCast", "skip - wrong chat");
            return Promise.resolve();
        }
        if (message.user.id === this.ncc.username) {
            return Promise.resolve();
        }
        if (!this.client.channels.has(roomCfg.channelID)) {
            return Promise.resolve();
        }
        const channel = this.client.channels.get(roomCfg.channelID) as Discord.TextChannel;
        let webhook:Discord.Webhook;
        try {
            const webhooks = (await channel.fetchWebhooks()).filter((w) => w.id === roomCfg.webhookId);
            if (webhooks.size === 1) {
                webhook = webhooks.get(roomCfg.webhookId);
            }
        } catch (err) {
            Log.e(err);
        }
        if (webhook == null) {
            Log.w("NccCast", "skip - no webhook");
            return Promise.resolve();
        }
        // message.user.image
        let pImage = "https://ssl.pstatic.net/static/m/cafe/mobile/img_thumb_20180426.png";
        let nick = this.lang.cast.fallbackNick;
        if (["text", "image", "sticker"].indexOf(message.type) >= 0) {
            pImage = message.user.image;
            nick = message.user.nickname;
            if (webhook.name !== nick || roomCfg.lastProfile !== pImage) {
                webhook = await webhook.edit(nick, pImage);
            }
        } else if (["join", "leave", "changeName"].indexOf(message.type) >= 0) {
            if (webhook.name !== nick || roomCfg.lastProfile !== pImage) {
                webhook = await webhook.edit(nick, pImage);
            }
        }
        roomCfg.lastProfile = pImage;
        switch (message.type) {
            case "text": {
                let msg = message.message;
                const user = message.user.id;
                const optout = roomCfg.optouts.indexOf(user);
                if (msg.startsWith("!optout")) {
                    if (optout < 0) {
                        roomCfg.optouts.push(user);
                        await this.ncc.chat.sendText(room, "optout 완료.");
                    }
                } else if (msg.startsWith("!optin")) {
                    if (optout >= 0) {
                        roomCfg.optouts.splice(optout, 1);
                        await this.ncc.chat.sendText(room, "optin 완료.");
                    }
                } else if (optout >= 0) {
                    msg = this.lang.cast.optoutMessage;
                }
                await webhook.send(msg);
            } break;
            case "sticker":
            case "image": {
                const url = message["image"];
                const optout = roomCfg.optouts.indexOf(message.user.id);
                let fn = url.substring(url.lastIndexOf("/") + 1);
                if (fn.indexOf("?") >= 0) {
                    fn = fn.substring(0,fn.lastIndexOf("?"));
                }
                const image:Buffer = await request.get(url, { encoding: null });
                const rich = new Discord.RichEmbed();
                if (optout >= 0) {
                    await webhook.send(this.lang.cast.optoutMessage);
                } else {
                    rich.setTitle(this.lang.cast.sendImage);
                    rich.attachFile(new Discord.Attachment(image, fn));
                    rich.setImage(`attachment://${fn}`);
                    rich.setURL(url);
                    await webhook.send(rich);
                }
            } break;
            case "leave":
            case "join": {
                const title = `${message.user.nickname}님이 ${
                    message.type === "join" ? "접속" : "퇴장"}하셨습니다.`
                const cafeID = message.room.cafe.id;
                const member = await this.ncc.getMemberById(cafeID,message.user.id);
                const desc = await getRichByProfile(member);
                await webhook.send(title,desc);
            } break;
            case "changeName": {
                const roomname:any = message.room.name;
                const hasJongseong = hangul.endsWithConsonant(roomname);
                await webhook.send(`방 이름이 ${roomname}${hasJongseong ? '으' : ''}로 변경되었습니다`);
            } break;
        }
    }
}
interface Link {
    channelID:string;
    roomID:string;
}
class LinkConfig extends Config implements Link {
    public channelID = "Ch";
    public roomID = "Fallback";
    constructor() {
        super("cast");
    }
}
class CastConfig extends LinkConfig {
    public channelID = "Ch";
    public roomID = "Fallback";
    public webhookId = "webhook";
    public readOnly = false;
    public authedOnly = false;
    public optouts:string[] = [];
    public cafeID:number = -1;
    public lastProfile = "_";
    constructor() {
        super();
    }
}