import * as get from "get-value";
import * as io from "socket.io-client";
import Log from "../../log";
import Cafe from "../../structure/cafe";
import Profile from "../../structure/profile";
import NCredit from "../credit/ncredit";
import { CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, CHAT_HOME_URL, CHAT_SOCKET_IO, COOKIE_SITES } from "../ncconstant";
import { getFirst } from "../nccutil";
import NcBaseChannel, { INcChannel } from "./ncbasechannel";
import NcMessage from "./ncmessage";

export default class NcChannel extends NcBaseChannel {
    /**
     * Parse NcChannel from..
     * @param credit 
     * @param id 
     */
    public static async from(credit:NCredit, id:number | NcBaseChannel) {
        id = (typeof id === "number") ? id : id.channelId;
        const instance = new NcChannel();
        try {
            await instance.update(credit, id);
        } catch (err) {
            return null;
        }
        return instance;
    }
    /**
     * Channel Users
     */
    public users:NccMember[];
    /**
     * Socket.io session of channel
     */
    public session:SocketIOClient.Socket;
    /**
     * Fetched messages
     */
    public messages:Map<number, NcMessage> = new Map();
    private constructor() {
        super(null);
    }
    public async connect(credit:NCredit) {
        const channel = this.channelId;
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
                        "Referer": `${CHAT_HOME_URL}/channels/${channel}`,
                    },
                },
                websocket: {
                    extraHeaders: {
                        "Origin": CHAT_HOME_URL,
                        "Referer": `${CHAT_HOME_URL}/channels/${channel}`,
                    },
                },
            },
            query: {
                accessToken: credit.accessToken,
                userId: credit.username,
                channelNo: channel,
            },
        });
        /**
         * Register message listeners.
         */
        // message handler
        this.session.on(ChannelEvent.MESSAGE, this.onMessage.bind(this));

        // debugs..
        for (const errE of ["error", "connect_error", "reconnect_failed"]) {
            this.session.on(errE, (t) => {
                Log.d(errE, t);
            });
        }
        for (const successE of ["connect", "connect_timeout", "reconnecting", "disconnect"]) {
            this.session.on(successE, () => {
                Log.d(successE + "");
            });
        }
        for (const naverE of Object.values(ChannelEvent)) {
            if (naverE === ChannelEvent.MESSAGE) {
                continue;
            }
            this.session.on(naverE, (t) => {
                Log.i(naverE);
                Log.e(t);
            });
        }
        this.session.open();
    }
    public async update(credit:NCredit, id = -1) {
        if (id < 0) {
            id = this.channelId;
        }
        try {
            const sync = JSON.parse(await credit.reqGet(`${CHAT_API_URL}/channels/${id.toString(10)}/sync`));
            if (get(sync, "message.status", {default: "-1"}) !== "200") {
                Log.e("Wrong status code! - " + get(sync, "message.error.msg"));
                // @todo error.code 3006: Not joined room.
                return Promise.reject(get(sync, "message.error.msg"));
            }
            const channelI = get(sync, "message.result.channel");
            this.baseinfo = {...channelI} as INcChannel;

            const memberList = get(sync, "message.result.memberList") as object[];
            this.users = memberList.map((v) => {
                const serial = {...v} as IChannelMember;
                return {
                    ...this.cafe,
                    profileurl: serial.memberProfileImageUrl,
                    nickname: serial.nickname,
                    userid: serial.memberId,
                    kickable: serial.kickedable,
                    channelManageable: serial.channelManageable,
                } as NccMember;
            });
            return Promise.resolve();
        } catch (err) {
            Log.e(err);
            return Promise.reject(err);
        }
    }
    protected async onMessage(eventmsg:object) {
        const message = this.serialMsg(eventmsg);
        if (message == null) {
            return Promise.resolve();
        }
        this.emit(ChannelEvent.MESSAGE, message);
    }
    private serialMsg(msg:object) {
        if (get(msg, "channelNo") !== this.channelId) {
            Log.w("Message's channelID doesn't match.");
            return null;
        }
        const _message = get(msg, "message") as IEventMessage;
        if (_message.extras != null && _message.extras.length <= 0) {
            _message.extras = null;
        }
        const ncMsg = new NcMessage({
            id: _message.serialNumber,
            body: _message.contents,
            writerId: _message.userId,
            writerName: this.getNick(_message.userId, "Kicked User"),
            type: _message.typeCode,
            createdTime: _message.createTime,
            extras: _message.extras,
        }, this.cafe, this.channelId);
        return ncMsg;
    }
    private getNick(id:string, fallback:string = null) {
        const nick = getFirst(this.users.filter((v) => v.userid === id));
        return nick == null ? fallback : nick.nickname;
    }
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
  