import get from "get-value"
import { allocInterface } from "../nccutil"
import Cafe from "../structure/cafe"
import Profile from "../structure/profile"
import { ILastMessage, INcMessage, INowMessage, IPastMessage,
    MessageType, NcEmbed, NcImage, NcSticker, SystemType } from "./ncprotomsg"
/**
 * Classify of Ncc's Message
 * 
 * Anyway There's no new feature.
 */
export default class NcMessage {
    /**
     * Parse Message from Past
     * 
     * `authorName` is *null*.
     * @param m Past Message (using websocket)
     */
    public static fromPast(m:IPastMessage):INcMessage {
        return {
            messageId: m.messageNo,
            content: m.content,
            extras: m.extras,
            authorId: m.userId,
            authorName: null,
            messageType: m.messageTypeCode,
            createdTime: m.createTime,
            updatedTime: m.updateTime,
            channelId: m.channelNo,
            readCount: m.readCount,
            memberCount: m.memberCount,
        }
    }
    /**
     * Parse Message from Last
     * 
     * `readCount`, `memberCount`, `updatedTime` is *invalid*.
     * @param m Last Message (from synced)
     * @param channelNo Channel ID
     */
    public static fromLast(m:ILastMessage, channelNo:number):INcMessage {
        return {
            messageId: m.id,
            content: m.body,
            extras: m.extras == null ? "" : m.extras,
            authorId: m.writerId,
            authorName: m.writerName,
            messageType: m.type,
            createdTime: m.createdTime,
            updatedTime: m.createdTime,
            channelId: channelNo,
            readCount: -1,
            memberCount: -1,
        }
    }
    /**
     * Parse Message from Received Event
     * 
     * `authorName` is *null*.
     * @param m Received Message (from websocket)
     * @param channelNo Channel ID
     */
    public static fromNow(m:INowMessage, channelNo:number):INcMessage {
        return {
            messageId: Number.parseInt(m.serialNumber),
            content: m.contents,
            extras: m.extras,
            authorId: m.userId,
            authorName: null,
            messageType: m.typeCode,
            createdTime: Number.parseInt(m.createTime),
            updatedTime: Number.parseInt(m.updateTime),
            channelId: channelNo,
            readCount: m.readCount,
            memberCount: m.memberCount,
        }
    }
    /**
     * Parse Message.
     * @param m Naver's Message
     * @param channelID Channel ID
     */
    public static from(m:IPastMessage | INowMessage | ILastMessage | INcMessage, channelID?:number):INcMessage {
        let obj:INcMessage
        if (m.hasOwnProperty("messageNo")) {
            // IPastMessage
            obj = NcMessage.fromPast(m as IPastMessage)
        } else if (m.hasOwnProperty("id")) {
            // ILastMessage
            obj = NcMessage.fromLast(m as ILastMessage, channelID)
        } else if (m.hasOwnProperty("serialNumber")) {
            // INowMessage
            obj = NcMessage.fromNow(m as INowMessage, channelID)
        } else if (m.hasOwnProperty("messageId")) {
            obj = m as INcMessage
        } else {
            throw new Error("Wrong Interface!")
        }
        return obj
    }
    public static getNaverID(m:IPastMessage | INowMessage | ILastMessage | INcMessage) {
        return NcMessage.from(m, 53).authorId
    }
    public static typeAsString(t:MessageType) {
        switch (t) {
            case MessageType.text: return "text"
            case MessageType.image: return "image"
            case MessageType.sticker: return "sticker"
            case MessageType.system: return "system"
            default: return "unknown"
        }
    }
    /**
     * Message's Cafe.
     */
    public cafe:Cafe
    public valid:boolean
    /**
     * Message's Author. 
     * 
     * extends `authorId`, `authorName`
     */
    private _author:Profile
    private instance:INcMessage
    /**
     * Create Well-Parsed Class
     * @param obj Past / Last / Now Ncc's Message
     * @param cafe Channel's Cafe.
     * @param channelId Channel's Id (supportment for some message type)
     * @param overrideUser Additional Info of user.
     */
    constructor(obj:INcMessage | IPastMessage | ILastMessage | INowMessage,
        cafe:Cafe, channelId:number, overrideUser:Profile = null) {
        try {
            this.instance = NcMessage.from(obj, channelId)
        } catch (err) {
            this.valid = false
            return
        }
        this.valid = true
        this.cafe = cafe
        this.instance.channelId = channelId
        if (overrideUser != null) {
            this.instance.authorId = overrideUser.userid
            this.instance.authorName = overrideUser.nickname
            this._author = overrideUser
        }
        if (this.instance.extras != null && this.instance.extras.length === 0) {
            this.instance.extras = null
        }
    }
    /**
     * Channel's ID
     */
    public get channelId() {
        return this.instance.channelId
    }
    /**
     * Message read count
     */
    public get readCount() {
        return this.instance.readCount
    }
    /**
     * Message's id
     */
    public get id() {
        return this.instance.messageId
    }
    /**
     * Get INcMessage.
     */
    public get info() {
        return this.instance
    }
    /**
     * Message ID
     * 
     * 메세지 ID
     */
/*     public get messageId() {
        return this.instance.id
    } */
    /**
     * Content
     * 
     * Possible Type - `MessageType.text`, `MessageType.system`
     * 
     * @returns Text.
     */
    public get content():string {
        switch (this.type) {
            case MessageType.text: {
                return this.instance.content
            }
            case MessageType.system: {
                return this.instance.content
            }
            default: {
                // ??
                return ""
            }
        }
    }
    /**
     * Possible Type - `MessageType.image`
     * 
     * @returns Image JSON
     */
    public get image() {
        const extras = this.instance.extras
        if (this.type !== MessageType.image || extras == null) {
            return null
        }
        const parse = JSON.parse(extras)
        return this.parseImage(parse["image"])
    }
    /**
     * Possible Type - `MessageType.sticker`
     * 
     * @returns Naver Sticker (like image.)
     */
    public get sticker() {
        const extras = this.instance.extras
        if (this.type !== MessageType.sticker || extras == null) {
            return null
        }
        const parse = JSON.parse(extras)
        return parse["sticker"] as NcSticker
    }
    /**
     * Possible Type - `MessageType.text`
     * 
     * @returns Naver Embed or null (not exists.)
     */
    public get embed() {
        if (this.type !== MessageType.text) {
            return null
        }
        const extras = this.instance.extras
        if (extras == null || extras.length <= 0) {
            // No embed.
            return null
        }
        // snipet (embed)
        const parse = JSON.parse(extras)
        const embed = {
            image: this.parseImage(get(parse, "snippet.image")),
            ...parse["snippet"],
        } as NcEmbed
        return embed
    }
    /**
     * Type
     * 
     * Image / Sticker / text (with RichEmbed)
     */
    public get type() {
        const t = this.instance.messageType
        if ([1,10,11].indexOf(t) >= 0) {
            return t as MessageType  
        } else {
            // 105: change room name
            if ([101,102,103,105,106,121].indexOf(t) >= 0) {
                return MessageType.system
            }
            return MessageType.unknown
        }
    }
    /**
     * System Message's Type
     * 
     * Possible Type - `MessageType.system`
     * 
     * @returns SystemType
     */
    public get systemType():SystemType {
        const t = this.instance.messageType
        for (const value of Object.values(SystemType)) {
            if (t === value) {
                return value
            }
        }
        return SystemType.unknown
    }
    /**
     * Message's author
     * 
     * Special for `MessageType.system`
     * @returns User / Can be **null**.
     */
    public get author():{naverId:string, nick:string} {
        if (this.type === MessageType.system) {
            if (this.instance.extras == null) {
                return null
            }
            try {
                const extra = JSON.parse(this.instance.extras)
                const _sender = JSON.parse(get(extra, "cafeChatEventJson"))
                const sender = get(_sender, "sender", { default: null })
                if (sender == null) {
                    return null
                }
                return {
                    naverId: get(sender, "id"),
                    nick: get(sender, "nickName"),
                }
            } catch {
                return null
            }
        } else {
            return {
                naverId: this._author.userid,
                nick: this._author.nickname,
            }
        }
    }
    public get profile() {
        return this._author
    }
    /**
     * timestamp (GMT, EpochTime)
     * 
     * 메세지 보낸 시기
     */
    public get timestamp() {
        return this.instance.createdTime
    }
    /**
     * timestamp (GMT, EpochTime) as Date
     * 
     * 메세지 보낸 시기
     */
    public get sentDate() {
        return new Date(this.timestamp)
    }
    private parseImage(json:object) {
        if (json["url"] == null) {
            // Not valid image
            return null
        }
        const safeParse = (value:number | null) => {
            if (value == null) {
                return -1
            } else {
                return value
            }
        }
        return {
            url: json["url"],
            width: safeParse(json["width"]),
            height: safeParse(json["height"]),
            is_original_size: json["is_original_size"],
        } as NcImage
    }
}

