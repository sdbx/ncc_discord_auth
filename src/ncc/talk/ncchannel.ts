import * as get from "get-value"
import * as io from "socket.io-client"
import { EventDispatcher, IEventHandler } from "strongly-typed-events"
import Log from "../../log"
import NCredit from "../credit/ncredit"
import NCaptcha from "../ncaptcha"
import { CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, 
    CHAT_CHANNEL_URL, CHAT_HOME_URL, CHATAPI_CHANNEL_BAN, CHATAPI_CHANNEL_CHGOWNER,
    CHATAPI_CHANNEL_CLEARMSG, CHATAPI_CHANNEL_INFO, CHATAPI_CHANNEL_INVITE, CHATAPI_CHANNEL_LEAVE,
    CHATAPI_CHANNEL_PERIOD, CHATAPI_CHANNEL_SYNC, COOKIE_SITES, NcIDBase } from "../ncconstant"
import { getFirst, parseMember } from "../nccutil"
import Cafe from "../structure/cafe"
import Profile from "../structure/profile"
import NcAPIStatus, { NcErrorType } from "./ncapistatus"
import NcBaseChannel, { ChannelInfo, INcChannel } from "./ncbasechannel"
import NcJoinedChannel, { parseFromJoined } from "./ncjoinedchannel"
import NcJson from "./ncjson"
import NcMessage, { MessageType, SystemType } from "./ncmessage"

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
    public messages:Map<number, NcMessage> = new Map()
    /**
     * events
     */
    public events:Events = new Events()
    /**
     * Credit for internal use
     */
    protected credit:NCredit = null
    /**
     * Is session connected?
     */
    protected _connected = false
    public get connected() {
        return this._connected
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
            const sync = JSON.parse(await credit.reqGet(CHATAPI_CHANNEL_SYNC.get(id)) as string)
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
        s.on("connect", () => this._connected = true)
        s.on("disconnect", () => this._connected = false);
        ["error", "connect_error", "reconnect_failed"].forEach((tag) => s.on(tag, () => this._connected = false))
        // message
        s.on(ChannelEvent.MESSAGE, async (eventmsg:object) => {
            const message = this.serialMsg(eventmsg)
            if (message == null) {
                return Promise.resolve()
            }
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
            await this.syncChannel()
            const msg = {
                message: sys.msg,
                ...action,
                ...sys,
            } as SysUserAction
            this.events.onMemberKick.dispatchAsync(this, msg)
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
                        newMaster: getFirst(this.users.filter((v) => v.nickname === serialMsg.actionDest)),
                        channelID: this.channelID,
                        message,
                        modifier: serialMsg.modifier,
                    } as Master)
                }
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
     * Clear Recent Messages
     */
    public async clearMessage() {
        const request = await this.credit.req("DELETE", CHATAPI_CHANNEL_CLEARMSG.get(this.channelID))
        await this.syncChannel()
        return handleSuccess(request)
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
                Log.e(t)
            })
        }
        this.session.open()
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
            id: _message.serialNumber,
            body: _message.contents,
            writerId: _message.userId,
            writerName: this.getNick(_message.userId, "Kicked User"),
            type: _message.typeCode,
            createdTime: _message.createTime,
            extras: _message.extras,
        }, this.cafe, this.channelID)
        ncMsg.readCount = Math.max(0, _message.readCount)
        return ncMsg
    }
    private serialSysMsg(msg:object) {
        const message = this.serialMsg(msg)
        const modifier = getFirst(this.users.filter((v) => v.userid === get(message.sender, "naverId")))
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
        const members = users.map((v) => getFirst(this.users.filter((_v) => _v.userid === v)))
        const msg = {
            channelID: get(param, "channelNo"),
            userIDs: users,
            members,
            first: getFirst(members),
            deletedChannel: get(param, "deletedChannel"),
        } as UserAction
        return msg
    }
    private getNick(id:string, fallback:string = null) {
        const nick = getFirst(this.users.filter((v) => v.userid === id))
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
    public onMemberQuit = new EventDispatcher<NcChannel, UserAction>()
    public onMemberKick = new EventDispatcher<NcChannel, SysUserAction>()
    public onRoomnameChanged = new EventDispatcher<NcChannel, RoomName>()
    public onMasterChanged = new EventDispatcher<NcChannel, Master>()
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
        this.newMember = getFirst(newMembers.filter((v) => this.oldUsers.indexOf(v.userid) < 0))
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