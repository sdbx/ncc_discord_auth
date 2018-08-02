import * as get from "get-value"
import * as io from "socket.io-client"
import { EventDispatcher, IEventHandler } from "strongly-typed-events"
import Log from "../../log"
import NCredit from "../credit/ncredit"
import { CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, 
    CHAT_CHANNEL_URL, CHAT_HOME_URL, CHATAPI_CHANNEL_LEAVE, CHATAPI_CHANNEL_SYNC,
    COOKIE_SITES, NcIDBase } from "../ncconstant"
import { getFirst, parseMember } from "../nccutil"
import Cafe from "../structure/cafe"
import Profile from "../structure/profile"
import NcBaseChannel, { INcChannel } from "./ncbasechannel"
import NcJson from "./ncjson"
import NcMessage, { MessageType, SystemType } from "./ncmessage"

/* tslint:disable:member-ordering */
export default class NcChannel extends NcBaseChannel {
    /**
     * Parse NcChannel from..
     * @param credit 
     * @param id 
     */
    public static async from(credit:NCredit, id:number | NcBaseChannel) {
        id = (typeof id === "number") ? id : id.channelID
        const instance = new NcChannel()
        try {
            await instance.update(credit, id)
        } catch (err) {
            return null
        }
        return instance
    }
    /**
     * Leave Channel
     */
    public static async quit(credit:NCredit, id:number) {
        const request = await credit.req("DELETE", CHATAPI_CHANNEL_LEAVE.get(id))
        const instance = new NcJson(request, (obj) => ({msg:obj["msg"]}))
        if (!instance.valid) {
            return Promise.reject(instance.error.msg)
        }
        return Promise.resolve()
    }
    /************************** Fields & Constructor *******************************/
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
     * Connected internal
     */
    protected _connected = false
    /**
     * Is session connected?
     */
    public get connected() {
        return this._connected
    }
    private constructor() {
        super(null)
    }
    /**
     * Update this channel's objects with new
     * @param credit Ncc Credentials
     * @param id Init id(private)
     */
    public async update(credit:NCredit = null, id = -1) {
        if (id < 0) {
            id = this.channelID
        } else {
            this.channelID = id
        }
        if (credit != null) {
            this.credit = credit
        } else {
            credit = this.credit
        }
        try {
            const sync = JSON.parse(await credit.reqGet(CHATAPI_CHANNEL_SYNC.get(id)))
            const response = new NcJson(sync, (obj) => ({
                channelI: {...get(obj, "channel")} as INcChannel,
                memberList: get(obj, "memberList") as object[],
            }))
            if (!response.valid) {
                Log.e("Wrong status code! - " + response.status)
                // @todo error.code 3006: Not joined room.
                return Promise.reject(response.error.msg)
            }
            this.baseinfo = response.result.channelI

            const memberList = response.result.memberList
            this.users = memberList.map((v) => {
                const serial = {...v} as IChannelMember
                return {
                    ...parseMember(serial, this.cafe),
                    kickable: serial.kickedable,
                    channelManageable: serial.channelManageable,
                } as NccMember
            })
            return Promise.resolve()
        } catch (err) {
            Log.e(err)
            return Promise.reject(err)
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

    /************************** Commands *******************************/
    /**
     * Sync Channel
     */
    public async syncChannel() {
        return this.update()
    }
    /**
     * Leave Channel (No way to destroy channel :p)
     */
    public async leave() {
        return NcChannel.quit(this.credit, this.channelID)
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
interface SysMsg extends NcIDBase {
    message:NcMessage;
    modifier?:Profile;
}
export interface Master extends SysMsg {
    newMasterNick:string;
    newMaster?:Profile;
}
export interface RoomName extends SysMsg {
    before:string;
    after:string;
}
export enum ChatType {
    OnetoOne = 1,
    Group = 2,
}
interface IChannelMember {
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
interface IEventMessage {
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
  