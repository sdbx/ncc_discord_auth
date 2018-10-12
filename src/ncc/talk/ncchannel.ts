import * as get from "get-value"
import * as io from "socket.io-client"
import { EventDispatcher, IEventHandler } from "strongly-typed-events"
import Log from "../../log"
import { TimerID, WebpackTimer } from "../../webpacktimer"
import NCredit from "../credit/ncredit"
import NCaptcha from "../ncaptcha"
import { CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, 
    CHAT_CHANNEL_URL, CHAT_HOME_URL, CHAT_URL_CRAWLER, CHATAPI_CHANNEL_BAN,
    CHATAPI_CHANNEL_CHGOWNER, CHATAPI_CHANNEL_CLEARMSG, CHATAPI_CHANNEL_INFO, CHATAPI_CHANNEL_INVITE,
    CHATAPI_CHANNEL_LEAVE, CHATAPI_CHANNEL_PERIOD, CHATAPI_CHANNEL_SYNC, COOKIE_SITES } from "../ncconstant"
import { getFirst, parseMember } from "../nccutil"
import Cafe from "../structure/cafe"
import Profile from "../structure/profile"
import NcAPIStatus, { NcErrorType } from "./ncapistatus"
import NcBaseChannel from "./ncbasechannel"
import NcJoinedChannel, { parseFromJoined } from "./ncjoinedchannel"
import NcJson from "./ncjson"
import NcMessage from "./ncmessage"
import { ILastMessage, INcMessage, INowMessage, IPastMessage,
    MessageType, NcEmbed, NcImage, NcSticker, SystemType } from "./ncprotomsg"
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
            Log.e(err)
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
        return new Proxy(this.instance, {
            set() {
                return false
            }
        })
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
     * 
     * Order: [0] *Recent* -> *Old* [length]
     */
    public messages:NcMessage[] = []
    /**
     * events
     */
    public events:Events = new Events()
    /**
     * Prevent to send ACK signal?
     */
    public hideACK = false
    /**
     * Server latency between naver and client
     */
    public latency = -1
    /**
     * Credit for internal use
     */
    protected credit:NCredit = null
    /**
     * First message in fetchable
     */
    protected firstMsgNo:number
    /**
     * Unsubscribe Functions
     */
    protected unsubs:Array<() => void> = []
    /**
     * Check available..
     */
    private checkTimer:TimerID
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
        return this.detail.cafe as Cafe
    }
    /**
     * Channel info
     */
    public get info() {
        return this.detail.channelInfo
    }
    /**
     * Latest Message No (in room)
     */
    public get latestMessageNo() {
        if (this.detail.latestMessage == null) {
            return 0
        } else {
            return this.detail.latestMessage.id
        }
    }
    /**
     * Latest Message (maybe incorrect)
     */
    public get latestMessage() {
        return this.detail.latestMessage
    }
    private constructor() {
        // :)
    }
    /**
     * Update this channel's objects with new
     * @param credit Ncc Credentials
     * @param id Init id(private)
     */
    private async update(credit:NCredit = null, id = -1) {
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
                return Promise.reject(response.errorMsg)
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
     * @returns unsubscribe function
     */
    public on<V>(dispatcher:EventDispatcher<NcChannel, V>, handler:IEventHandler<NcChannel, V>) {
        const unsub = dispatcher.subscribe(handler)
        this.unsubs.push(unsub)
        return unsub
    }
    /**
     * Unsubscribe ALL
     */
    public offAll() {
        for (const unsub of this.unsubs) {
            unsub()
        }
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
            // awe-some fast naver speed, so this shouldn't be a problem.\
            try {
                this.messages = await this.fetchMessages(0, this.latestMessageNo)
            } catch (err) {
                Log.e(err)
            }
        })
        // ping
        s.on("pong", async (latency) => {
            this.latency = latency
            const success = await this.updateConnection(true)
            if (!success) {
                if (await this.credit.validateLogin() == null) {
                    this.disconnect()
                    Log.w("NcChannel", "Broken Credentials.")
                } else {
                    s.disconnect()
                    s.connect()
                    Log.w("NcChannel", "Reconnected.")
                }
            }
        })
        // message
        s.on(ChannelEvent.MESSAGE, async (eventmsg:object) => {
            const message = this.serialNowMsg(eventmsg as any)
            if (message == null) {
                return Promise.resolve()
            }
            Log.d("ChannelMessage", "Received - " + this.info.name)
            this.messages.unshift(message)
            this.events.onMessage.dispatchAsync(this, message)
        })
        // member join
        s.on(ChannelEvent.JOIN, async (eventmsg:object) => {
            const msg = new NcMessage(eventmsg["message"], this.cafe, this.channelID)
            const join = new Join(this.users)
            await this.syncChannel()
            join.fetch(this.users)
            this.events.onMemberJoin.dispatchAsync(this, join)
            this.events.onMessage.dispatchAsync(this, msg)
        })
        // member quit
        s.on(ChannelEvent.QUIT, async (eventmsg:object) => {
            const msg = this.serialQueryMsg(eventmsg)
            await this.syncChannel()
            this.events.onMemberQuit.dispatchAsync(this, msg)
            const ncM = new NcMessage(eventmsg["message"], this.cafe, this.channelID)
            this.events.onMessage.dispatchAsync(this, ncM)
        })
        s.on(ChannelEvent.KICK, async (eventmsg:object) => {
            const action = this.serialQueryMsg(eventmsg)
            const sys = this.serialSysMsg(eventmsg as any)
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
            this.events.onMessage.dispatchAsync(this, sys.msg)
        })
        // system message;;
        s.on(ChannelEvent.SYSTEM, async (eventmsg:object) => {
            const sync = get(eventmsg, "isSync", {default:false}) as boolean
            if (sync) {
                await this.syncChannel()
            }
            const serialMsg = this.serialSysMsg(eventmsg as any)
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
        this.on(this.events.onMessage, (ch, msg) => this.instance.latestMessage = msg)
    }

    /* ************************* Commands ****************************** */
    /**
     * Sync Channel
     */
    public async syncChannel() {
        try {
            return this.update()
        } catch (err) {
            Log.e(err)
            return
        }
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
        return NcAPIStatus.handleSuccess(request)
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
        return NcAPIStatus.handleSuccess(request)
    }
    /**
     * Leave Channel (No way to destroy channel :p)
     * 
     * Permission: *
     */
    public async leave() {
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_LEAVE.get(this.channelID))
        return NcAPIStatus.handleSuccess(request)
    }
    /**
     * Destory Channel (OpenChat- Complely REMOVE)
     * 
     * Permission: Owner
     */
    public async destroy() {
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_INFO.get(this.channelID))
        return NcAPIStatus.handleSuccess(request)
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
            } catch (err) {
                // :)
                Log.e(err)
                embed.image = {
                    width: null,
                    height: null,
                    url: typeof image === "string" ? image : null,
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
        return this.socketEmit("send", {
            extras,
            message: text,
            messageTypeCode: 1,
            sessionKey: this.credit.accessToken,
        }).then((v) => v.success)
    }
    /**
     * Send Image to Chat
     * @param image Image URL / File URL / Buffer
     * @param text Optical text (experimental)
     */
    public async sendImage(image:string | Buffer, text?:string) {
        let naverImage:NcImage = null
        if (!this.connected) {
            return Promise.resolve(false)
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
            Log.w("NcChannel", "Image upload failed.")
            // no upload
        }
        if (naverImage == null) {
            return Promise.resolve(false)
        }
        return this.socketEmit("send", {
            extras: JSON.stringify({image: naverImage}),
            message: text == null ? "" : text,
            messageTypeCode: 11,
            sessionKey: this.credit.accessToken,
        }).then((v) => v.success)
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
        return NcAPIStatus.handleSuccess(request)
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
        return NcAPIStatus.handleSuccess(request)
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
        return NcAPIStatus.handleSuccess(request)
    }
    /**
     * Send ACK signal
     * @param messageid The last watched message ID
     */
    public async sendAck(messageid:number) {
        return this.socketEmit(ChannelEvent.ACK, {
            messageSerialNumber: messageid,
            sessionKey: this.credit.accessToken,
        }).then((v) => v.success)
    }
    /**
     * I don't know what this does.
     * @param connected Connected?
     */
    public async updateConnection(connected:boolean) {
        return this.socketEmit("update_conn_status", {
            type: connected ? 2 : 1,
            sessionKey: this.credit.accessToken,
        }).then((v) => v.success)
    }
    /**
     * Get Messages from `start` to `end`
     * 
     * Order: [0] *New* -> *Old* [length]
     * @param start 
     * @param end 
     * @param checker 
     */
    public async fetchMessages(start:number, end:number,
        checker?:(msg:NcMessage, arr:NcMessage[]) => MessageCheck) {
        // always start < end
        if (start > end) {
            const _mv = start
            start = end
            end = _mv
        }
        // update recent message
        const recent = await this.socketEmit("message_list_recent", {
            sessionKey: this.credit.accessToken,
        })
        if (!recent.success || recent.code === "accessDenied") {
            throw new Error("Not response.")
        }
        // firstNo: first Message in naver server
        const firstNo = get(recent.data, "firstMessageNo") as number
        // lastNo: last Message from now.
        const lastNo = get(recent.data, "lastMessageNo") as number
        if (this.latestMessageNo < lastNo) {
            await this.syncChannel()
            // for stability
            await this.sendAck(lastNo)
        }
        // safe with ncc server
        end = Math.min(this.latestMessageNo, end)
        start = Math.max(firstNo, start)
        // fetch
        const chunk = 100
        // Message queue, order by recent.
        const queue:NcMessage[] = []
        for (let i = end; i >= start; i -= chunk) {
            // include start, end
            const {data, success} = await this.socketEmit("message_list_range", {
                fromMessageNo: Math.max(start, i - chunk + 1),
                toMessageNo: i,
                sessionKey: this.credit.accessToken,
            })
            if (!success) {
                break
            }
            // message order by msgNo (past.), so reverse push.
            const messages:NcMessage[] = (get(data, "messageList") as any[]).map((v) => this.parseMessage(v))
            let stop = false
            for (let k = messages.length - 1; k >= 0; k -= 1) {
                const _msg = messages[k]
                // checker for rule
                if (checker != null) {
                    const ch = checker(_msg, queue)
                    if (ch === MessageCheck.SKIP) {
                        continue
                    } else if (ch === MessageCheck.BREAK) {
                        stop = true
                        break
                    }
                }
                // reverse push.
                queue.push(_msg)
            }
            if (stop) {
                break
            }
        }
        return queue
    }
    /**
     * Clear Recent Messages
     */
    public async clearMessage() {
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_CLEARMSG.get(this.channelID))
        await this.syncChannel()
        return NcAPIStatus.handleSuccess(request)
    }
    /**
     * Parse Message from Ncc's message response.
     * @param messages Ncc's response.
     */
    protected parseMessage(message:IPastMessage | INowMessage | ILastMessage | INcMessage):NcMessage {
        const toNC = NcMessage.from(message)
        if (toNC == null) {
            return null
        }
        return new NcMessage(
            NcMessage.from(message), this.cafe, this.channelID, this.getUserById(toNC.authorId))
    }
    /**
     * Connect session.
     * @param credit 
     */
    public async connect(credit:NCredit) {
        const channel = this.channelID
        this.credit = credit
        this.session = io(`${CHAT_BACKEND_URL}/chat`, {
            multiplex: true,
            timeout: 12000,
            host:CHAT_BACKEND_URL,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 10000,
            forceNew: false,
            autoConnect: false,
            // forceJSONP: true,
            transports: ["websocket", "polling"],
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
                Log.d(this.info.name, successE)
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
        // debug
        this.checkTimer = WebpackTimer.setInterval(() => {
            if (this.info != null) {
                Log.d(this.info.name, "Connected: " + this.connected + " / Latency: " + this.latency + "ms")
            }
        }, 60000)
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
        this.offAll()
        if (this.session != null) {
            this.session.removeAllListeners()
            this.session = null
        }
        if (this.checkTimer != null) {
            WebpackTimer.clearInterval(this.checkTimer)
            this.checkTimer = null
        }
        for (const e of Object.values(this.events)) {
            e.clear()
        }
        this.credit = null
    }
    protected async socketEmit(type:string, ...send:Array<unknown>) {
        const obj = {
            success: false,
            code: null as string,
            data: null as any,
        }
        if (!this.connected) {
            return obj
        }
        try {
            const result = await new Promise<{code:string | null, data:any}>((resolve, reject) => {
                const tout = WebpackTimer.setTimeout(() => {
                    reject(new Error("Timeout."))
                }, 3000)
                const eRes = (code:string | null, data:any) => {
                    WebpackTimer.clearTimeout(tout)
                    resolve({
                        code,
                        data,
                    })
                }
                if (send.length === 0) {
                    this.session.emit(type, eRes)
                } else {
                    this.session.emit(type, ...send, eRes)
                }
            })
            obj.code = result.code
            if (result.data == null) {
                throw new Error("Data > null")
            }
            const rCode = get(result.data, "resultCode", {default: -1})
            if (rCode !== 0) {
                throw new Error("Result Code > " + rCode)
            }
            const rMessage = get(result.data, "resultMessage", {default: "undefined"})
            if (rMessage !== "SUCCESS") {
                throw new Error("Result Message > " + rMessage)
            }
            obj.success = true
            obj.data = get(result.data, "data", {default: {}})
        } catch (err) {
            Log.w("NccSocket", "Code: " + type + " > Failed.\nError: " + err.toString())
        }
        return obj
    }
    
    /**************** Utilities *************************/
    private serialNowMsg(msg:{channelNo:number, message:INowMessage}) {
        if (msg.channelNo !== this.channelID) {
            Log.w("Message's channelID doesn't match.")
            return null
        }
        return this.parseMessage(msg.message)
    }
    private serialSysMsg(msg:{channelNo:number, message:INowMessage}) {
        const message = this.serialNowMsg(msg)
        const modifier = this.getUserById(message.author.naverId)
        let actionDest = null
        try {
            const extras = JSON.parse(message.info.extras)
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
interface NcIDBase {
    channelID:number;
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
/**
 * Message check in fetchMessage
 */
export enum MessageCheck {
    SKIP,
    BREAK,
    PASS,
}