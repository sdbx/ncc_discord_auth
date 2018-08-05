import * as get from "get-value"
import * as io from "socket.io-client"
import { EventDispatcher, IEventHandler } from "strongly-typed-events"
import Log from "../../log"
import NCredit from "../credit/ncredit"
import NCaptcha from "../ncaptcha"
import { CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, 
    CHAT_CHANNEL_URL, CHAT_HOME_URL, CHAT_URL_CRAWLER, CHATAPI_CHANNEL_BAN,
    CHATAPI_CHANNEL_CHGOWNER, CHATAPI_CHANNEL_CLEARMSG, CHATAPI_CHANNEL_INFO, CHATAPI_CHANNEL_INVITE,
    CHATAPI_CHANNEL_LEAVE, CHATAPI_CHANNEL_PERIOD, CHATAPI_CHANNEL_SYNC, COOKIE_SITES, NcIDBase } from "../ncconstant"
import { getFirst, parseMember } from "../nccutil"
import Cafe from "../structure/cafe"
import Profile from "../structure/profile"
import NcAPIStatus, { NcErrorType } from "./ncapistatus"
import NcBaseChannel from "./ncbasechannel"
import NcJoinedChannel, { parseFromJoined } from "./ncjoinedchannel"
import NcJson from "./ncjson"
import NcMessage, { INcMessage, MessageType, NcEmbed, NcImage, SystemType } from "./ncmessage"
import uploadImage from "./uploadphoto"

/* tslint:disable:member-ordering */
export default class NcChannel {
    /**
     * Parse NcChannel from..
     * @param credit 
     * @param id 
     */
    public static async from(credit:NCredit, id:number | NcBaseChannel) {
        id = (typeof id === "number") ? id : id.channelID
        if (credit.validateLogin().catch(() => null) == null) {
            return null
        }
        const instance = new NcChannel()
        try {
            await instance.update(credit, id)
        } catch (err) {
            return null
        }
        return instance
    }
    /************************** Fields & Constructor *******************************/
    /**
     * All info from naver
     */
    protected instance:NcJoinedChannel
    public get detail() {
        return {...this.instance}
    }
    /**
     * Channel Users
     */
    public users:NccMember[]
    /**
     * Socket.io session of channel
     */
    public session:SocketIOClient.Socket
    /**
     * Fetched messages
     */
    public messages:PastMessage[] = []
    /**
     * events
     */
    public events:Events = new Events()
    /**
     * Prevent to send ACK signal?
     */
    public hideACK = false
    /**
     * Credit for internal use
     */
    protected credit:NCredit = null
    /**
     * First message in fetchable
     */
    protected firstMsgNo:number
    /**
     * Is session connected?
     */
    public get connected() {
        return this.session != null && this.session.connected
    }
    /* ******** Proxies **********/
    /**
     * Channel ID
     */
    public get channelID() {
        return this.detail.channelID
    }
    /**
     * Cafe Info
     */
    public get cafe() {
        return {
            ...this.detail.cafe
        } as Cafe
    }
    /**
     * Channel info
     */
    public get info() {
        return {
            ...this.detail.channelInfo
        }
    }
    private constructor() {

    }
    /**
     * Update this channel's objects with new
     * @param credit Ncc Credentials
     * @param id Init id(private)
     */
    public async update(credit:NCredit = null, id = -1) {
        try {
            if (id < 0) {
                id = this.channelID
            }
            if (credit != null) {
                this.credit = credit
            }
            const sync = JSON.parse(await this.credit.reqGet(CHATAPI_CHANNEL_SYNC.get(id)) as string)
            const response = new NcJson(sync, (obj) => ({
                channelI: parseFromJoined(get(obj, "channel")),
                memberList: get(obj, "memberList") as object[],
            }))
            if (!response.valid) {
                Log.e("Wrong status code! - " + response.status)
                // @todo error.code 3006: Not joined room.
                return Promise.reject(response.error.msg)
            }
            this.instance = response.result.channelI
            const memberList = response.result.memberList
            this.users = memberList.map((v) => {
                const serial = v as IChannelMember
                return {
                    ...parseMember(serial, this.cafe),
                    kickable: serial.kickedable,
                    channelManageable: serial.channelManageable,
                } as NccMember
            })
            return Promise.resolve()
        } catch (err) {
            Log.e(err)
            return Promise.resolve()
        }
    }

    /************************** Events *******************************/
    /**
     * Register event
     * @param dispatcher this.events 
     * @param handler function
     */
    public on<V>(dispatcher:EventDispatcher<NcChannel, V>, handler:IEventHandler<NcChannel, V>) {
        dispatcher.asEvent().subscribe(handler)
    }
    /**
     * Internal register
     * @param s Socket
     */
    protected registerE(s:SocketIOClient.Socket) {
        // connected check
        // s.on("connect", () => this._connected = true)
        // s.on("disconnect", () => this._connected = false);
        // ["error", "connect_error", "reconnect_failed"].forEach((tag) => s.on(tag, () => this._connected = false))
        // fetch recent message
        s.on("connect", async () => {
            if (this.messages.length === 0) {
                this.session.emit("message_list_recent", {
                    sessionKey: this.credit.accessToken,
                }, (code, data) => {
                    if (code !== "accessDenied" && data["resultCode"] === 0) {
                        this.firstMsgNo = get(data, "data.firstMessageNo")
                        this.allocPastMessages(get(data, "data.messageList"))
                    }
                })
            }
        })
        // message
        s.on(ChannelEvent.MESSAGE, async (eventmsg:object) => {
            const message = this.serialMsg(eventmsg)
            if (message == null) {
                return Promise.resolve()
            }
            this.appendMessages(message)
            this.events.onMessage.dispatchAsync(this, message)
        })
        // member join
        s.on(ChannelEvent.JOIN, async (eventmsg:object) => {
            const msg = {channelID: eventmsg["channelNo"]}
            const join = new Join(this.users)
            await this.syncChannel()
            join.fetch(this.users)
            this.events.onMemberJoin.dispatchAsync(this, join)
        })
        // member quit
        s.on(ChannelEvent.QUIT, async (eventmsg:object) => {
            const msg = this.serialQueryMsg(eventmsg)
            await this.syncChannel()
            this.events.onMemberQuit.dispatchAsync(this, msg)
        })
        s.on(ChannelEvent.KICK, async (eventmsg:object) => {
            const action = this.serialQueryMsg(eventmsg)
            const sys = this.serialSysMsg(eventmsg)
            // await this.syncChannel()
            const msg = {
                message: sys.msg,
                ...action,
                ...sys,
            } as SysUserAction
            if (get(sys.actionDest,"memberId", {default: ""}) === this.credit.username) {
                this.events.onKicked.dispatchAsync(this, msg)
            } else {
                this.events.onMemberKick.dispatchAsync(this, msg)
            }
        })
        // system message;;
        s.on(ChannelEvent.SYSTEM, async (eventmsg:object) => {
            const sync = get(eventmsg, "isSync", {default:false}) as boolean
            if (sync) {
                await this.syncChannel()
            }
            const serialMsg = this.serialSysMsg(eventmsg)
            const message = serialMsg.msg
            if (message == null || message.type !== MessageType.system) {
                return Promise.resolve()
            }
            this.events.onMessage.dispatchAsync(this, message)
            switch (message.systemType) {
                // type: room name change
                case SystemType.changed_Roomname: {
                    let content = (message.content as string)
                    let before = null
                    let after = serialMsg.actionDest
                    if (after != null) {
                        // fixed
                        content = content.substring(0, content.lastIndexOf(after) - 3)
                        content = content.replace(/^.+?(님이 채팅방 이름을)\s/, "")
                        before = content
                    } else {
                        // acculate
                        content = content.replace(/^.+?(님이 채팅방 이름을)\s/, "")
                        before =  content.substring(0, content.lastIndexOf("에서"))
                        content = content.substr(content.lastIndexOf("에서") + 3)
                        after = content.substring(0, content.lastIndexOf("(으)로"))
                    }
                    this.events.onRoomnameChanged.dispatchAsync(this,{
                        channelID: this.channelID,
                        before,
                        after,
                        message,
                        modifier: serialMsg.modifier,
                    } as RoomName)
                } break
                case SystemType.changed_Master: {
                    this.events.onMasterChanged.dispatchAsync(this, {
                        newMasterNick: serialMsg.actionDest,
                        newMaster: getFirst(this.users, (v) => v.nickname === serialMsg.actionDest),
                        channelID: this.channelID,
                        message,
                        modifier: serialMsg.modifier,
                    } as Master)
                } break
                case SystemType.kick: {
                    this.events.onKicked.dispatchAsync(this, {
                        channelID: this.channelID,
                        message,
                        modifier: serialMsg.modifier,
                    } as SysMsg)
                } break
            }
        })
    }

    /* ************************* Commands ****************************** */
    /**
     * Sync Channel
     */
    public async syncChannel() {
        return this.update()
    }
    /**
     * Invite Users.
     * 
     * Almost no require captcha.
     * @param users To invite Users
     * @param captcha Captcha (optical)
     */
    public async invite(users:Array<Profile | string>, captcha:NCaptcha = null) {
        const ids = users.map((user) => typeof user === "string" ? user : user.userid)
        const request = await this.credit.reqPost(CHATAPI_CHANNEL_INVITE.get(this.cafe.cafeId, this.channelID), {}, {
            userIdList: ids,
            captchaKey: captcha == null ? "" : captcha.key,
            captchaValue: captcha == null ? "" : captcha.value,
        })
        await this.syncChannel()
        return handleSuccess(request)
    }
    /**
     * Ban user :p
     * 
     * Permission: Owner | Staff
     * @param user userid
     */
    public async ban(user:Profile | string) {
        const id = typeof user === "string" ? user : user.userid
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_BAN.get(this.channelID, id))
        await this.syncChannel()
        return handleSuccess(request)
    }
    /**
     * Leave Channel (No way to destroy channel :p)
     * 
     * Permission: *
     */
    public async leave() {
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_LEAVE.get(this.channelID))
        return handleSuccess(request)
    }
    /**
     * Destory Channel (OpenChat- Complely REMOVE)
     * 
     * Permission: Owner
     */
    public async destroy() {
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_INFO.get(this.channelID))
        return handleSuccess(request)
    }
    /**
     * Get Embed from URL (naver's api) - delay >=600ms?
     * @param url URL
     */
    public async getURLEmbed(url:string) {
        if (!/^http(s)?:\/\//.test(url)) {
            url = "https://" + url
        }
        const request = await this.credit.reqGet(CHAT_URL_CRAWLER, {
            escape: false,
            url,
        }) as string
        const response = new NcJson(request, (obj:EmbedParsed) => obj)
        if (!response.valid || !response.result.hasOgTag) {
            return null
        }
        const r = response.result
        return {
            ...r.summary
        } as NcEmbed
    }
    /**
     * Send text to this channel
     * 
     * AutoEmbed is soooo slow
     * @param text Send text
     * @param autoEmbed Detect link and parse embed?
     */
    public async sendText(text:string, autoEmbed = true) {
        const regex = /(http(s)?:\/\/)[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)/ig
        const url = getFirst(text.match(regex))
        if (!autoEmbed && url != null) {
            return this.sendEmbed(text, await this.getURLEmbed(url))
        } else {
            return this.sendEmbed(text, null)
        }
    }
    /**
     * Send text with custom embed
     * 
     * How about XSS-Atack?
     * @param content Send text (in green chat)
     * @param embed NcEmbed Object
     * @param image Dest Image URL / File Path / Image Buffer
     * @param displayAsVideo Draw with video mark?
     */
    public async sendCustomEmbed(content:string, embed:NcEmbed, image:string | Buffer = null, displayAsVideo = false) {
        let naverImage:NcImage = null
        if (image != null) {
            try {
                const uploaded = await uploadImage(this.credit, image)
                naverImage = {
                    width: uploaded.width,
                    height: uploaded.height,
                    url: uploaded.url,
                }
                embed.image = naverImage
            } catch {
                // :)
                embed.image = {
                    width: null,
                    height: null,
                    url: null,
                }
            }
        }
        embed.type = displayAsVideo ? "video" : null
        return this.sendEmbed(content, embed)
    }
    /**
     * Send text with embed
     * @param text Send Text
     * @param content NcEmbed Object
     */
    public async sendEmbed(text:string, content:NcEmbed) {
        let extras:string = ""
        if (content != null) {
            extras = JSON.stringify({snippet: content})
        }
        if (!this.connected) {
            return Promise.resolve()
        }
        this.session.emit("send", {
            extras,
            message: text,
            messageTypeCode: 1,
            sessionKey: this.credit.accessToken,
        })
        return Promise.resolve()
    }
    /**
     * Send Image to Chat
     * @param image Image URL / File URL / Buffer
     * @param text Optical text (experimental)
     */
    public async sendImage(image:string | Buffer, text?:string) {
        let naverImage:NcImage = null
        if (!this.connected) {
            return Promise.resolve()
        }
        try {
            const uploaded = await uploadImage(this.credit, image)
            naverImage = {
                width: uploaded.width,
                height: uploaded.height,
                url: uploaded.url,
                is_original_size: false,
            }
        } catch {
            // no upload
        }
        if (naverImage == null) {
            return Promise.resolve()
        }
        this.session.emit("send", {
            extras: JSON.stringify({image: naverImage}),
            message: text == null ? "" : text,
            messageTypeCode: 11,
            sessionKey: this.credit.accessToken,
        })
        return Promise.resolve()
    }
    /**
     * Set message expires day
     * 
     * Permission: Owner | Staff | User?
     * @param day Day (0: 3~4 / 30: 30 days / 365: 1 year)
     */
    public async period(day:0 | 30 | 365) {
        let code:number
        switch (day) {
            case 30: code = 2; break
            case 365: code = 3; break
            default: code = 0
        }
        const request = await this.credit.req("PUT", CHATAPI_CHANNEL_PERIOD.get(this.channelID), {}, {"period": code})
        await this.syncChannel()
        return handleSuccess(request)
    }
    /**
     * Change owner to user
     * 
     * Permission: Owner | Staff
     * @param user 
     */
    public async changeOwner(user:Profile | string) {
        const id = typeof user === "string" ? user : user.userid
        const request = await this.credit.req("PUT", CHATAPI_CHANNEL_CHGOWNER.get(this.cafe.cafeId, this.channelID, id))
        await this.syncChannel()
        return handleSuccess(request)
    }
    /**
     * Change Info
     * 
     * Permission: Owner | Staff
     * @param text Name, Description (input null if you don't want to change)
     * @param image Image(s), Multiple image.. is experimental
     */
    public async changeInfo(text:{name?:string, desc?:string}, ...image:string[]) {
        const org = this.info
        if (text.name != null) {
            org.name = text.name
        }
        if (text.desc != null) {
            org.description = text.desc
        }
        if (image.length >= 1) {
            org.thumbnails = image
        }
        const request = await this.credit.req("PUT", CHATAPI_CHANNEL_INFO.get(this.channelID), {}, {
            "profileImageUrl": org.thumbnails,
            "name": org.name,
            "description": org.description,
        })
        await this.syncChannel()
        return handleSuccess(request)
    }
    /**
     * Send ACK signal
     * @param messageid The last watched message ID
     */
    public async sendAck(messageid:number) {
        if (!this.connected) {
            return
        }
        this.session.emit("ack", {
            messageSerialNumber: messageid,
            sessionKey: this.credit.accessToken,
        })
    }
    /**
     * Fetch Past Messages
     * 
     * Count: number of message
     * 
     * At: from now to ID messages
     * 
     * All: all, in server
     * 
     * Date: Messages after timestamp
     * @param mode Mode
     * @param num Value
     */
    public async fetchMessages(mode:"COUNT" | "AT" | "ALL" | "DATE", num:number) {
        if (!this.connected) {
            return
        }
        const pasts = []
        const nowFirst = this.messages.length === 0 ? this.detail.lastestMessageNo : this.messages[0].id
        const dateMode = mode === "DATE"
        let end:number
        /*
        if (mode === "ALL") {
            this.messages = []
            pasts.push(...await this.recentMessages(false))
        }
        */
        switch (mode) {
            case "COUNT" : {end = nowFirst - num + 1} break
            case "AT" : {end = num} break
            case "ALL": {end = -1} break
            case "DATE": {end = -1} break
        }
        end = Math.min(Math.max(this.firstMsgNo, end),nowFirst)
        for (let i = nowFirst - 1; i >= end; i -= 30) {
            await new Promise((res, rej) => {
                this.session.emit("message_list_range", {
                    fromMessageNo: Math.max(end, i - 29),
                    toMessageNo: i,
                    sessionKey: this.credit.accessToken,
                }, (code, data) => {
                    if (code == null && data.resultCode === 0) {
                        if (pasts.length === 0) {
                            pasts.push(...get(data, "data.messageList"))
                        } else {
                            pasts.unshift(...get(data, "data.messageList"))
                        }
                    }
                    res()
                })
            })
            if (dateMode && pasts.length >= 1 && pasts[0].createTime <= num) {
                let k = 0
                while (true) {
                    if (k >= pasts.length - 1 || pasts[k].createTime >= num) {
                        try {
                            pasts.splice(0, k)
                        } catch {
                            // :)
                        }
                        break
                    }
                    k += 1
                }
                break
            }
        }
        return this.allocPastMessages(pasts)
    }
    /**
     * Clear Recent Messages
     */
    public async clearMessage() {
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_CLEARMSG.get(this.channelID))
        await this.syncChannel()
        return handleSuccess(request)
    }
    /**
     * Push Socket.io's past messages to first
     * @param messages Socket.io message_list_*** result
     */
    protected allocPastMessages(messages:any[]) {
        if (messages.length <= 0) {
            return
        }
        const ln = messages.length
        for (let i = 0; i < ln; i += 1) {
            const msg = messages[i]
            messages[i] = {
                id: Number.parseInt(msg.messageNo),
                body: msg.content,
                writerId: msg.userId,
                writerName: null,
                type: msg.messageTypeCode,
                createdTime: Number.parseInt(msg.createdTime),
                extras: msg.extras,
                channelNo: msg.channelNo,
                memberCount: msg.memberCount,
                readCount: msg.readCount,
                updateTime: msg.updateTime,
            } as PastMessage
        }
        const ncMsgs = messages.map(
            (v:PastMessage) => new NcMessage(v, this.cafe, this.channelID, this.getUserById(v.writerId)))
        if (this.messages.length >= 1) {
            if (this.messages[0].id === messages[ln - 1].id + 1) {
                // append to start (all)
                this.messages.unshift(...messages)
            } else {
                Log.w("MsgQueue Broken",
                    `${this.channelID} Channel(${this.info.name}) message array are broken!\n` + 
                    `${this.messages[0].id} <-> ${messages[ln - 1].id}`)
                return ncMsgs
            }
        } else {
            this.messages.push(...messages)
        }
        this.events.onPastMessage.dispatchAsync(this, ncMsgs)
        return ncMsgs
    }
    /**
     * Append Now messages to last
     * @param messages That received Message.
     */
    protected async appendMessages(...messages:NcMessage[]) {
        const ln = messages.length
        const iLn = this.messages.length
        Log.d("LastMsg", (this.messages[iLn - 1].id + 1) + "")
        Log.d("NewMsg", messages[0].messageId + "")

        if (ln >= 1 && (messages[0].messageId === this.messages[iLn - 1].id + 1)) {
            for (let i = 0; i < ln; i += 1) {
                const msg = messages[i]["instance"]
                this.messages.push({
                    ...msg,
                    channelNo: messages[i].channelID,
                    memberCount: this.detail.userCount,
                    updateTime: msg.createdTime,
                } as PastMessage)
            }
        } else {
            Log.w("MsgQueue Broken",
                `${this.channelID} Channel(${this.info.name}) message array are broken!\n` +
                `${this.messages[iLn - 1].id} <-> ${messages[0].messageId}`)
        }
    }
    /**
     * Connect session.
     * @param credit 
     */
    public async connect(credit:NCredit) {
        const channel = this.channelID
        this.credit = credit
        this.session = io(`${CHAT_BACKEND_URL}/chat`, {
            multiplex: false,
            timeout: 5000,
            host:CHAT_BACKEND_URL,
            reconnection: true,
            reconnectionAttempts: 100,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 1000,
            forceNew: true,
            // forceJSONP: true,
            transports: ["polling", "websocket"],
            transportOptions: {
                polling: {
                    extraHeaders: {
                        "Origin": CHAT_HOME_URL,
                        "Referer": CHAT_CHANNEL_URL.get(channel),
                    },
                },
                websocket: {
                    extraHeaders: {
                        "Origin": CHAT_HOME_URL,
                        "Referer": CHAT_CHANNEL_URL.get(channel),
                    },
                },
            },
            query: {
                accessToken: credit.accessToken,
                userId: credit.username,
                channelNo: channel,
            },
        })
        this.registerE(this.session)
        for (const errE of ["error", "connect_error", "reconnect_failed"]) {
            this.session.on(errE, (t) => {
                Log.d(errE, t)
            })
        }
        for (const successE of ["connect", "connect_timeout", "reconnecting", "disconnect"]) {
            this.session.on(successE, () => {
                Log.d(successE + "")
            })
        }
        for (const naverE of Object.values(ChannelEvent)) {
            if (naverE === ChannelEvent.MESSAGE) {
                continue
            }
            this.session.on(naverE, (t) => {
                Log.i(naverE)
                Log.json("Object", t)
            })
        }
        this.session.open()
    }
    /**
     * Disconnect Channel
     * 
     * **Credit also be invalid!!**
     */
    public disconnect() {
        if (this.connected) {
            this.session.disconnect()
        }
        if (this.session != null) {
            this.session.removeAllListeners()
            this.session = null
        }
        for (const e of Object.values(this.events)) {
            e.clear()
        }
        this.credit = null
    }
    
    /**************** Utilities *************************/
    private serialMsg(msg:object) {
        if (get(msg, "channelNo") !== this.channelID) {
            Log.w("Message's channelID doesn't match.")
            return null
        }
        const _message = get(msg, "message") as IEventMessage
        if (_message.extras != null && _message.extras.length <= 0) {
            _message.extras = null
        }
        const ncMsg = new NcMessage({
            id: Number.parseInt(_message.serialNumber),
            body: _message.contents,
            writerId: _message.userId,
            writerName: this.getNick(_message.userId, "Kicked User"),
            type: _message.typeCode,
            createdTime: Number.parseInt(_message.createTime),
            extras: _message.extras,
        }, this.cafe, this.channelID, this.getUserById(_message.userId))
        ncMsg.readCount = Math.max(0, _message.readCount)
        return ncMsg
    }
    private serialSysMsg(msg:object) {
        const message = this.serialMsg(msg)
        const modifier = this.getUserById(get(message.sender, "naverId"))
        let actionDest = null
        try {
            const extras = JSON.parse(get(msg, "message.extras"))
            const _json = JSON.parse(get(extras, "cafeChatEventJson"))
            actionDest = get(_json, "actionItem", { default: null })
        } catch {
            // :)
        }
        return {
            msg:message,
            modifier,
            actionDest,
        }
    }
    private serialQueryMsg(param:object) {
        const users = get(param, "userIdList", { default: [] }) as string[]
        const members = users.map((v) => this.getUserById(v))
        const msg = {
            channelID: get(param, "channelNo"),
            userIDs: users,
            members,
            first: getFirst(members),
            deletedChannel: get(param, "deletedChannel"),
        } as UserAction
        return msg
    }
    private getUserById(userid:string) {
        return getFirst(this.users, (v) => v.userid === userid)
    }
    private getNick(id:string, fallback:string = null) {
        const nick = this.getUserById(id)
        return nick == null ? fallback : nick.nickname
    }
}
export async function handleSuccess(req:string | Buffer):Promise<NcAPIStatus> {
    if (typeof req !== "string") {
        return NcAPIStatus.error(NcErrorType.system, "For coder: Wrong type")
    }
    const instance = new NcJson(req, (obj) => ({ msg: obj["msg"] }))
    return NcAPIStatus.from(instance)
}
class Events {
    public onMessage = new EventDispatcher<NcChannel, NcMessage>()
    public onMemberJoin = new EventDispatcher<NcChannel, Join>()
    /**
     * on Member leave (official: quit)
     */
    public onMemberQuit = new EventDispatcher<NcChannel, UserAction>()
    /**
     * on (other) member kicked
     */
    public onMemberKick = new EventDispatcher<NcChannel, SysUserAction>()
    public onRoomnameChanged = new EventDispatcher<NcChannel, RoomName>()
    /**
     * on Owner changed
     */
    public onMasterChanged = new EventDispatcher<NcChannel, Master>()
    /**
     * on (me) I have been kicked
     */
    public onKicked = new EventDispatcher<NcChannel, SysMsg>()
    /**
     * on Past Messages are parsed.
     * 
     * Order: older -> newer (messageNo order.)
     */
    public onPastMessage = new EventDispatcher<NcChannel, NcMessage[]>()
}
export enum ChannelEvent {
    SYSTEM = "sys",
    MESSAGE = "msg",
    ACK = "ack",
    JOIN = "join",
    QUIT = "quit",
    KICK = "kick",
    BLOCK = "block", // ban
    LEAVE = "leave",
    BLIND = "blind",
    EVENT = "event", // message?
    EMOTION = "emotion",
}
export interface NccMember extends Profile {
    kickable:boolean;
    channelManageable:boolean;
}
export interface UserAction extends NcIDBase {
    userIDs:string[];
    first:Profile;
    members:Profile[];
    deletedChannel:number;
}
export interface SysUserAction extends UserAction, SysMsg {
    // ?
}
interface SysMsg extends NcIDBase {
    message:NcMessage;
    modifier?:Profile;
}
export class Join implements NcIDBase {
    public channelID:number
    public newMember:Profile
    protected oldUsers:string[]
    constructor(members:Profile[]) {
        this.oldUsers = []
        this.oldUsers.push(...members.map((v) => v.userid))
    }
    public fetch(newMembers:Profile[]) {
        this.newMember = getFirst(newMembers, (v) => this.oldUsers.indexOf(v.userid) < 0)
    }
}

export interface Master extends SysMsg {
    newMasterNick:string;
    newMaster?:Profile;
}
export interface RoomName extends SysMsg {
    before:string;
    after:string;
}
/**
 * interface of chat members
 */
export interface IChannelMember {
    memberId:string;
    maskingId:string;
    nickname:string;
    memberProfileImageUrl:string;
    manager:boolean;
    cafeMember:boolean;
    staffCode:number;
    staffName:string;
    status:string;
    updateTime:number;
    role:number;
    kickedable:boolean;
    delegatable:boolean;
    channelManageable:boolean;
}
/**
 * Message event
 */
export interface IEventMessage {
    serialNumber:string;
    typeCode:number;
    userId:string;
    contents:string;
    memberCount:number;
    createTime:string;
    updateTime:string;
    extras:string;
    tempId:string;
    readCount:number;
}
/**
 * Embed resposne
 */
interface EmbedParsed {
    hasOgTag:boolean;
    url:string;
    summary:{
        url:string;
        domain:string;
        title:string;
        description:string;
        type?:string;
        image:EmbedImage;
        allImages?:EmbedImage[];
    };
    complete:boolean;
    busy:boolean;
    cached:boolean;
}
interface EmbedImage {
    url:string;
    width:number;
    height:number;
}
/*
export interface INcMessage {
    id:number;
    body:string;
    writerId:string;
    writerName:string;
    type:number; // 1: text 11:image 10:sticker
    createdTime:number;
    extras:string; // image:{width, url, height, is...} json
}
*/
interface PastMessage extends INcMessage {
    channelNo:number;
    memberCount:number;
    readCount:number;
    updateTime:number;
}